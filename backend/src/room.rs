use std::collections::HashMap;
use tokio::sync::mpsc;
use uuid::Uuid;

use lattice_shared::protocol::{Frame, Opcode};

pub enum RoomMessage {
    Connect    { client_id: Uuid, tx: mpsc::Sender<Frame> },
    Disconnect { client_id: Uuid },
    Update     { client_id: Uuid, data: Vec<u8> },
    Presence   { client_id: Uuid, data: Vec<u8> },
}

struct RoomActor {
    room_id:       Uuid,
    room_id_bytes: [u8; 16],
    clients:       HashMap<Uuid, mpsc::Sender<Frame>>,
    updates:       Vec<Vec<u8>>,
}

impl RoomActor {
    fn new(room_id: Uuid) -> Self {
        RoomActor {
            room_id,
            room_id_bytes: *room_id.as_bytes(),
            clients: HashMap::new(),
            updates: Vec::new(),
        }
    }

    async fn handle(&mut self, msg: RoomMessage) {
        match msg {
            RoomMessage::Connect { client_id, tx } => {
                self.clients.insert(client_id, tx);
                tracing::debug!(room=%self.room_id, client=%client_id, "client joined");
            }

            RoomMessage::Disconnect { client_id } => {
                self.clients.remove(&client_id);
                tracing::debug!(room=%self.room_id, client=%client_id, "client left");
            }

            RoomMessage::Update { client_id, data } => {
                self.updates.push(data.clone());
                // broadcast to ALL clients including sender for now
                for (cid, tx) in &self.clients {
                    let frame = Frame::new(Opcode::Broadcast, self.room_id_bytes, data.clone());
                    let _ = tx.send(frame).await;
                    let _ = cid;
                }
            }

            RoomMessage::Presence { client_id: _, data: _ } => {
                // TODO: broadcast presence
            }
        }
    }
}

pub async fn run_room_actor(room_id: Uuid, mut rx: mpsc::Receiver<RoomMessage>) {
    let mut actor = RoomActor::new(room_id);
    tracing::info!(room=%room_id, "room actor started");
    while let Some(msg) = rx.recv().await {
        actor.handle(msg).await;
    }
    tracing::info!(room=%room_id, "room actor terminated");
}
