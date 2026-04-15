use thiserror::Error;

pub const PROTOCOL_VERSION: u8 = 1;
/// Frame header: version(1) + opcode(1) + flags(1) + room_id(16) + payload_len(4) = 23 bytes
pub const HEADER_SIZE: usize = 23;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Opcode {
    Connect    = 0x01,
    Update     = 0x02,
    Broadcast  = 0x03,
    Disconnect = 0x08,
}

impl TryFrom<u8> for Opcode {
    type Error = FrameError;
    fn try_from(v: u8) -> Result<Self, Self::Error> {
        match v {
            0x01 => Ok(Self::Connect),
            0x02 => Ok(Self::Update),
            0x03 => Ok(Self::Broadcast),
            0x08 => Ok(Self::Disconnect),
            other => Err(FrameError::UnknownOpcode(other)),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Frame {
    pub version: u8,
    pub opcode:  Opcode,
    pub flags:   u8,
    pub room_id: [u8; 16],
    pub payload: Vec<u8>,
}

impl Frame {
    pub fn new(opcode: Opcode, room_id: [u8; 16], payload: Vec<u8>) -> Self {
        Frame { version: PROTOCOL_VERSION, opcode, flags: 0, room_id, payload }
    }

    pub fn encode(&self) -> Vec<u8> {
        let payload_len = self.payload.len() as u32;
        let mut buf = Vec::with_capacity(HEADER_SIZE + self.payload.len());
        buf.push(self.version);
        buf.push(self.opcode as u8);
        buf.push(self.flags);
        buf.extend_from_slice(&self.room_id);
        buf.extend_from_slice(&payload_len.to_be_bytes());
        buf.extend_from_slice(&self.payload);
        buf
    }

    pub fn decode(data: &[u8]) -> Result<Self, FrameError> {
        if data.len() < HEADER_SIZE {
            return Err(FrameError::TooShort { got: data.len(), need: HEADER_SIZE });
        }
        let version = data[0];
        if version != PROTOCOL_VERSION {
            return Err(FrameError::VersionMismatch { got: version, expected: PROTOCOL_VERSION });
        }
        let opcode = Opcode::try_from(data[1])?;
        let flags  = data[2];
        let mut room_id = [0u8; 16];
        room_id.copy_from_slice(&data[3..19]);
        let payload_len = u32::from_be_bytes([data[19], data[20], data[21], data[22]]) as usize;
        if data.len() < HEADER_SIZE + payload_len {
            return Err(FrameError::IncompletePayload { got: data.len(), need: HEADER_SIZE + payload_len });
        }
        let payload = data[HEADER_SIZE..HEADER_SIZE + payload_len].to_vec();
        Ok(Frame { version, opcode, flags, room_id, payload })
    }
}

#[derive(Debug, Error)]
pub enum FrameError {
    #[error("frame too short: got {got} bytes, need at least {need}")]
    TooShort { got: usize, need: usize },
    #[error("protocol version mismatch: got {got}, expected {expected}")]
    VersionMismatch { got: u8, expected: u8 },
    #[error("unknown opcode: 0x{0:02x}")]
    UnknownOpcode(u8),
    #[error("incomplete payload: got {got} bytes, need {need}")]
    IncompletePayload { got: usize, need: usize },
}
