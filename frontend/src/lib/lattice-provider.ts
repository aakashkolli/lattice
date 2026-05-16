import * as Y from 'yjs';
import {
  Opcode,
  decodeFrame,
  encodeFrame,
  uuidToBytes,
  PROTOCOL_VERSION,
} from '@lattice/protocol';

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'synced'
  | 'disconnected'
  | 'reconnecting';

export interface PresenceState {
  clientId: string;
  cursorFrom: number;
  cursorTo: number;
  name: string;
  color: string;
}

function genClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class LatticeProvider {
  private ws: WebSocket | null = null;
  private roomIdBytes: Uint8Array;
  private reconnectDelay = 1500;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  /** Stable identity for this browser session — included in every presence payload. */
  readonly clientId = genClientId();

  state: ConnectionState = 'connecting';
  presence = new Map<string, PresenceState>();

  onStateChange?: (state: ConnectionState) => void;
  onPresence?: (states: PresenceState[]) => void;

  constructor(
    private readonly serverUrl: string,
    private readonly roomId: string,
    readonly doc: Y.Doc,
  ) {
    this.roomIdBytes = uuidToBytes(roomId);
    this.connect();

    // Forward local Yjs updates to server.
    // BUG-FIX: do NOT use `this` as a filter here — we want ALL local updates sent.
    // Remote updates are applied with `this` as origin (see handleFrame) to prevent echo.
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      // Skip updates that originated from applying a remote broadcast (origin === this)
      // to avoid echoing back to the server.
      if (origin === this) return;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send(Opcode.Update, update);
      }
    });
  }

  private connect() {
    if (this.destroyed) return;

    const url = `${this.serverUrl}/${this.roomId}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.setState('connecting');

    this.ws.onopen = () => {
      this.reconnectDelay = 1500;
      this.setState('syncing');
    };

    this.ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      try {
        const frame = decodeFrame(new Uint8Array(event.data));
        this.handleFrame(frame);
      } catch (err) {
        console.warn('[lattice] frame decode error', err);
      }
    };

    this.ws.onclose = () => {
      this.setState('disconnected');
      if (!this.destroyed) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose fires after onerror; no extra action needed.
    };
  }

  private handleFrame(frame: ReturnType<typeof decodeFrame>) {
    switch (frame.opcode) {
      case Opcode.Broadcast:
        // Mark origin as `this` so the doc.on('update') listener above skips re-sending.
        Y.applyUpdate(this.doc, frame.payload, this);
        break;

      case Opcode.SyncComplete:
        this.setState('synced');
        break;

      case Opcode.Presence: {
        try {
          const text = new TextDecoder().decode(frame.payload);
          const state = JSON.parse(text) as PresenceState;
          if (state.clientId && state.clientId !== this.clientId) {
            this.presence.set(state.clientId, state);
            this.onPresence?.(Array.from(this.presence.values()));
          }
        } catch {
          // ignore malformed presence
        }
        break;
      }
    }
  }

  sendPresence(partial: Omit<PresenceState, 'clientId'>) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // Include clientId so receivers can key presence state correctly.
    const full: PresenceState = { ...partial, clientId: this.clientId };
    const payload = new TextEncoder().encode(JSON.stringify(full));
    this.send(Opcode.Presence, payload);
  }

  private send(opcode: Opcode, payload: Uint8Array) {
    const frame = encodeFrame({
      version: PROTOCOL_VERSION,
      opcode,
      flags: 0,
      roomId: this.roomIdBytes,
      payload,
    });
    this.ws?.send(frame);
  }

  private setState(next: ConnectionState) {
    this.state = next;
    this.onStateChange?.(next);
  }

  private scheduleReconnect() {
    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 10000);
      this.connect();
    }, this.reconnectDelay);
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
