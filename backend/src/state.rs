use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::room::RoomMessage;

pub type RoomMap = Arc<DashMap<Uuid, mpsc::Sender<RoomMessage>>>;

#[derive(Clone)]
pub struct AppState {
    pub rooms: RoomMap,
}

impl AppState {
    pub fn new() -> Self {
        AppState { rooms: Arc::new(DashMap::new()) }
    }
}
