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

/// HTTP → WebSocket upgrade handler. Path: /ws/:room_id
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(room_id_str): Path<String>,
    State(state): State<AppState>,
) -> Response {
    let room_id = match Uuid::parse_str(&room_id_str) {
        Ok(id) => id,
        Err(_) => Uuid::new_v4(),
    };
    ws.on_upgrade(move |socket| handle_socket(socket, room_id, state))
}

async fn handle_socket(socket: WebSocket, room_id: Uuid, state: AppState) {
    let client_id = Uuid::new_v4();
    tracing::info!(client=%client_id, room=%room_id, "websocket connection established");

    // Get or create the Room Actor for this room (atomic via DashMap entry API).
    let room_tx = state
        .rooms
        .entry(room_id)
        .or_insert_with(|| {
            let (tx, rx) = mpsc::channel(4096);
            tokio::spawn(run_room_actor(room_id, rx));
            tx
        })
        .clone();

    // Per-client channel: Room Actor → this WebSocket connection.
    let (client_tx, mut client_rx) = mpsc::channel::<Frame>(512);

    // Register the client with the Room Actor; it will replay accumulated state.
    if room_tx
        .send(RoomMessage::Connect { client_id, tx: client_tx })
        .await
        .is_err()
    {
        tracing::warn!("room actor unavailable for room {room_id}");
        return;
    }

    let (mut ws_sink, mut ws_stream) = socket.split();

    // Outbound task: Room Actor frames → WebSocket frames.
    let send_task = tokio::spawn(async move {
        while let Some(frame) = client_rx.recv().await {
            let encoded = frame.encode();
            if ws_sink.send(Message::Binary(encoded)).await.is_err() {
                break;
            }
        }
    });

    // Inbound loop: WebSocket frames → Room Actor messages.
    while let Some(Ok(msg)) = ws_stream.next().await {
        match msg {
            Message::Binary(data) => match Frame::decode(&data) {
                Ok(frame) => dispatch_frame(frame, client_id, &room_tx).await,
                Err(e) => tracing::warn!(client=%client_id, "frame decode error: {e}"),
            },
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) | Message::Text(_) => {}
        }
    }

    tracing::info!(client=%client_id, room=%room_id, "connection closed");
    let _ = room_tx.send(RoomMessage::Disconnect { client_id }).await;
    send_task.abort();
}

async fn dispatch_frame(
    frame: Frame,
    client_id: Uuid,
    room_tx: &mpsc::Sender<RoomMessage>,
) {
    let msg = match frame.opcode {
        Opcode::Update => RoomMessage::Update { client_id, data: frame.payload },
        Opcode::Presence => RoomMessage::Presence { client_id, data: frame.payload },
        Opcode::Heartbeat | Opcode::Connect | Opcode::Disconnect => return,
        _ => return,
    };
    let _ = room_tx.send(msg).await;
}
