use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use uuid::Uuid;

use lattice_shared::protocol::{Frame, Opcode};

use crate::{
    room::{run_room_actor, RoomMessage},
    state::AppState,
};

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(room_id_str): Path<String>,
    State(state): State<AppState>,
) -> Response {
    let room_id = Uuid::parse_str(&room_id_str).unwrap_or_else(|_| Uuid::new_v4());
    ws.on_upgrade(move |socket| handle_socket(socket, room_id, state))
}

async fn handle_socket(socket: WebSocket, room_id: Uuid, state: AppState) {
    let client_id = Uuid::new_v4();

    let room_tx = state
        .rooms
        .entry(room_id)
        .or_insert_with(|| {
            let (tx, rx) = mpsc::channel(4096);
            tokio::spawn(run_room_actor(room_id, rx));
            tx
        })
        .clone();

    let (client_tx, mut client_rx) = mpsc::channel::<Frame>(512);
    let _ = room_tx.send(RoomMessage::Connect { client_id, tx: client_tx }).await;

    let (mut ws_sink, mut ws_stream) = socket.split();

    let send_task = tokio::spawn(async move {
        while let Some(frame) = client_rx.recv().await {
            let encoded = frame.encode();
            if ws_sink.send(Message::Binary(encoded)).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_stream.next().await {
        match msg {
            Message::Binary(data) => {
                if let Ok(frame) = Frame::decode(&data) {
                    let msg = match frame.opcode {
                        Opcode::Update   => RoomMessage::Update   { client_id, data: frame.payload },
                        Opcode::Presence => RoomMessage::Presence { client_id, data: frame.payload },
                        _ => continue,
                    };
                    let _ = room_tx.send(msg).await;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let _ = room_tx.send(RoomMessage::Disconnect { client_id }).await;
    send_task.abort();
}
