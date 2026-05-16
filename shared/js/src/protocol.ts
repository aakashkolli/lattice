// Binary protocol for Lattice WebSocket communication.
// Frame layout: [version:1][opcode:1][flags:1][room_id:16][payload_len:4][payload:n]
// This MUST stay identical to shared/src/protocol.rs — both define the same wire format.

export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 23; // 1 + 1 + 1 + 16 + 4

export enum Opcode {
  Connect = 0x01,
  Update = 0x02,
  Broadcast = 0x03,
  Presence = 0x04,
  Heartbeat = 0x05,
  Sync = 0x06,
  SyncComplete = 0x07,
  Disconnect = 0x08,
}

export interface Frame {
  version: number;
  opcode: Opcode;
  flags: number;
  roomId: Uint8Array; // 16 bytes
  payload: Uint8Array;
}

export function encodeFrame(frame: Frame): Uint8Array {
  const buf = new Uint8Array(HEADER_SIZE + frame.payload.length);
  const view = new DataView(buf.buffer);

  buf[0] = frame.version;
  buf[1] = frame.opcode;
  buf[2] = frame.flags;
  buf.set(frame.roomId.slice(0, 16), 3);
  view.setUint32(19, frame.payload.length, false); // big-endian
  buf.set(frame.payload, HEADER_SIZE);

  return buf;
}

export function decodeFrame(data: Uint8Array): Frame {
  if (data.length < HEADER_SIZE) {
    throw new Error(`Frame too short: ${data.length} < ${HEADER_SIZE}`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = data[0];

  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Version mismatch: expected ${PROTOCOL_VERSION}, got ${version}`);
  }

  const opcode = data[1] as Opcode;
  const flags = data[2];
  const roomId = data.slice(3, 19);
  const payloadLen = view.getUint32(19, false);

  if (data.length < HEADER_SIZE + payloadLen) {
    throw new Error(`Incomplete payload: need ${HEADER_SIZE + payloadLen}, got ${data.length}`);
  }

  const payload = data.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);

  return { version, opcode, flags, roomId, payload };
}

export function makeFrame(
  opcode: Opcode,
  roomIdBytes: Uint8Array,
  payload: Uint8Array = new Uint8Array(0),
): Uint8Array {
  return encodeFrame({
    version: PROTOCOL_VERSION,
    opcode,
    flags: 0,
    roomId: roomIdBytes,
    payload,
  });
}

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`Invalid UUID: ${uuid}`);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
