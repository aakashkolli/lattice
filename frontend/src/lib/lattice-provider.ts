import * as Y from 'yjs';
import { Opcode, encodeFrame, decodeFrame, uuidToBytes, PROTOCOL_VERSION } from '@lattice/protocol';
import { genUuid } from './utils';

export type ConnectionState = 'connecting' | 'connected' | 'syncing' | 'synced' | 'disconnected' | 'reconnecting';

export interface PresenceState {
  clientId: string;
  cursorFrom: number;
  cursorTo: number;
  name: string;
  color: string;
}

export class LatticeProvider {
  private ws: WebSocket | null = null;
  private roomIdBytes: Uint8Array;
  private reconnectDelay = 1500;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private updateHandler: ((update: Uint8Array, origin: unknown) => void) | null = null;

  readonly clientId = genUuid();
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

    this.updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send(Opcode.Update, update);
      }
    };
    this.doc.on('update', this.updateHandler);
  }

  private connect() {
    if (this.destroyed) return;
    this.ws = new WebSocket(`${this.serverUrl}/${this.roomId}`);
    this.ws.binaryType = 'arraybuffer';
    this.setState('connecting');

    this.ws.onopen = () => {
      this.reconnectDelay = 1500;  // fix: reset backoff on successful open
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

    this.ws.onerror = () => {};
  }

  private handleFrame(frame: ReturnType<typeof decodeFrame>) {
    switch (frame.opcode) {
      case Opcode.Broadcast:
        Y.applyUpdate(this.doc, frame.payload, this);
        break;
      case Opcode.SyncComplete:
        this.setState('synced');
        break;
      case Opcode.Presence: {
        try {
          const state = JSON.parse(new TextDecoder().decode(frame.payload)) as PresenceState;
          if (state.clientId && state.clientId !== this.clientId) {
            this.presence.set(state.clientId, state);
            this.onPresence?.(Array.from(this.presence.values()));
          }
        } catch {}
        break;
      }
    }
  }

  sendPresence(partial: Omit<PresenceState, 'clientId'>) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const full: PresenceState = { ...partial, clientId: this.clientId };
    const payload = new TextEncoder().encode(JSON.stringify(full));
    this.send(Opcode.Presence, payload);
  }

  private send(opcode: Opcode, payload: Uint8Array) {
    const frame = encodeFrame({ version: PROTOCOL_VERSION, opcode, flags: 0, roomId: this.roomIdBytes, payload });
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
    if (this.ws) {
      this.ws.onmessage = null; this.ws.onopen = null; this.ws.onclose = null; this.ws.onerror = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.updateHandler) { try { this.doc.off('update', this.updateHandler); } catch {} this.updateHandler = null; }
    this.presence.clear();
  }
}
