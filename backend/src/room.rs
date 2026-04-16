use std::collections::HashMap;
use tokio::sync::mpsc;
use uuid::Uuid;

use lattice_shared::protocol::Frame;

pub enum RoomMessage {
    Connect    { client_id: Uuid, tx: mpsc::Sender<Frame> },
    Disconnect { client_id: Uuid },
    Update     { client_id: Uuid, data: Vec<u8> },
    Presence   { client_id: Uuid, data: Vec<u8> },
}

struct RoomActor {
    room_id:      Uuid,
    room_id_bytes: [u8; 16],
    clients:      HashMap<Uuid, mpsc::Sender<Frame>>,
    updates:      Vec<Vec<u8>>,
}

impl RoomActor {
    fn new(room_id: Uuid) -> Self {
        RoomActor {
            room_id,
            room_id_bytes: *room_id.as_bytes(),
            clients:  HashMap::new(),
            updates:  Vec::new(),
        }
    }
}

pub async fn run_room_actor(room_id: Uuid, mut rx: mpsc::Receiver<RoomMessage>) {
    let mut actor = RoomActor::new(room_id);
    tracing::info!(room=%room_id, "room actor started");
    while let Some(_msg) = rx.recv().await {
        // TODO: handle messages
    }
    tracing::info!(room=%room_id, "room actor terminated");
}
