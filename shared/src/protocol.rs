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
    pub version:  u8,
    pub opcode:   Opcode,
    pub flags:    u8,
    pub room_id:  [u8; 16],
    pub payload:  Vec<u8>,
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
