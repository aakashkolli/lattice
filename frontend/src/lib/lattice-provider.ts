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
  private destroyed = false;

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

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send(Opcode.Update, update);
      }
    });
  }

  private connect() {
    if (this.destroyed) return;
    this.ws = new WebSocket(`${this.serverUrl}/${this.roomId}`);
    this.ws.binaryType = 'arraybuffer';  // fix: was missing, caused string frames
    this.setState('connecting');

    this.ws.onopen  = () => this.setState('syncing');

    this.ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      try {
        const frame = decodeFrame(new Uint8Array(event.data));
        if (frame.opcode === Opcode.Broadcast) {
          Y.applyUpdate(this.doc, frame.payload, this);
        } else if (frame.opcode === Opcode.SyncComplete) {
          this.setState('synced');
        }
      } catch (err) {
        console.warn('[lattice] frame error', err);
      }
    };

    this.ws.onclose = () => {
      this.setState('disconnected');
    };
  }

  private send(opcode: Opcode, payload: Uint8Array) {
    const frame = encodeFrame({ version: PROTOCOL_VERSION, opcode, flags: 0, roomId: this.roomIdBytes, payload });
    this.ws?.send(frame);
  }

  private setState(next: ConnectionState) {
    this.state = next;
    this.onStateChange?.(next);
  }

  destroy() {
    this.destroyed = true;
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}
