//! Lattice benchmarking harness.
//!
//! Measures message throughput and end-to-end latency (client -> server -> client)
//! under concurrent client load against a running Lattice backend.
//!
//! Usage:
//!   lattice-bench --url ws://localhost:3001/ws --clients 10 --messages 500
//!
//! Each client joins the same room, sends UPDATE frames with embedded timestamps,
//! and measures RTT when the broadcast echoes back from the server.

use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use anyhow::Result;
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use hdrhistogram::Histogram;
use tokio::sync::{Barrier, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

use lattice_shared::protocol::{Frame, Opcode};

#[derive(Parser)]
#[command(name = "lattice-bench", about = "Lattice WebSocket benchmark")]
struct Cli {
    /// Backend WebSocket base URL (without room segment).
    #[arg(long, default_value = "ws://localhost:3001/ws")]
    url: String,

    /// Number of concurrent clients.
    #[arg(long, default_value_t = 10)]
    clients: usize,

    /// Number of UPDATE messages each client sends.
    #[arg(long, default_value_t = 200)]
    messages: usize,

    /// Synthetic payload size (bytes) per UPDATE.
    #[arg(long, default_value_t = 64)]
    payload_bytes: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let room_id = Uuid::new_v4();
    let room_id_bytes = *room_id.as_bytes();

    println!(
        "lattice-bench  clients={} messages={} payload={}B room={}",
        cli.clients, cli.messages, cli.payload_bytes, room_id
    );
    println!("target: {}/{}", cli.url, room_id);
    println!();

    // Shared histogram (μs resolution, up to 60 s).
    let histogram: Arc<Mutex<Histogram<u64>>> =
        Arc::new(Mutex::new(Histogram::new_with_max(60_000_000, 3).unwrap()));

    let total_sent = Arc::new(AtomicU64::new(0));
    let total_recv = Arc::new(AtomicU64::new(0));
    let errors = Arc::new(AtomicU64::new(0));

    // Barrier: all clients wait until everyone is connected before sending.
    let start_barrier = Arc::new(Barrier::new(cli.clients));

    let bench_start = Instant::now();

    let mut handles = Vec::with_capacity(cli.clients);

    for client_idx in 0..cli.clients {
        let url = format!("{}/{}", cli.url, room_id);
        let histogram = Arc::clone(&histogram);
        let total_sent = Arc::clone(&total_sent);
        let total_recv = Arc::clone(&total_recv);
        let errors = Arc::clone(&errors);
        let barrier = Arc::clone(&start_barrier);
        let messages = cli.messages;
        let payload_bytes = cli.payload_bytes;

        handles.push(tokio::spawn(async move {
            if let Err(e) = run_client(
                client_idx,
                url,
                room_id_bytes,
                messages,
                payload_bytes,
                barrier,
                histogram,
                total_sent,
                total_recv,
                errors,
            )
            .await
            {
                eprintln!("client {client_idx} error: {e}");
            }
        }));
    }

    for handle in handles {
        handle.await.ok();
    }

    let elapsed = bench_start.elapsed();
    let hist = histogram.lock().await;

    let sent = total_sent.load(Ordering::Relaxed);
    let recv = total_recv.load(Ordering::Relaxed);
    let errs = errors.load(Ordering::Relaxed);

    println!("─────────────────────────────────────────");
    println!("Results");
    println!("─────────────────────────────────────────");
    println!("  Duration      : {:.2}s", elapsed.as_secs_f64());
    println!("  Messages sent : {sent}");
    println!("  Broadcasts rx : {recv}");
    println!("  Errors        : {errs}");
    println!(
        "  Throughput    : {:.0} msg/s",
        sent as f64 / elapsed.as_secs_f64()
    );
    println!();
    println!("RTT latency (client -> server -> client echo):");
    println!("  p50  : {:.2}ms", hist.value_at_quantile(0.50) as f64 / 1000.0);
    println!("  p95  : {:.2}ms", hist.value_at_quantile(0.95) as f64 / 1000.0);
    println!("  p99  : {:.2}ms", hist.value_at_quantile(0.99) as f64 / 1000.0);
    println!("  max  : {:.2}ms", hist.max() as f64 / 1000.0);
    println!("─────────────────────────────────────────");

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn run_client(
    client_idx: usize,
    url: String,
    room_id_bytes: [u8; 16],
    messages: usize,
    payload_bytes: usize,
    barrier: Arc<Barrier>,
    histogram: Arc<Mutex<Histogram<u64>>>,
    total_sent: Arc<AtomicU64>,
    total_recv: Arc<AtomicU64>,
    errors: Arc<AtomicU64>,
) -> Result<()> {
    let (ws, _) = connect_async(&url).await?;
    let (mut sink, mut stream) = ws.split();

    // Drain the initial sync from the server (BROADCAST* + SyncComplete).
    let synced = tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(Ok(msg)) = stream.next().await {
            if let Message::Binary(data) = msg {
                if let Ok(frame) = Frame::decode(&data) {
                    if frame.opcode == Opcode::SyncComplete {
                        return Ok::<_, anyhow::Error>(());
                    }
                }
            }
        }
        Err(anyhow::anyhow!("connection closed before SyncComplete"))
    })
    .await??;
    let _ = synced;

    // All clients synchronized here before sending.
    barrier.wait().await;

    // Track per-send timestamps: timestamp (μs since epoch) embedded in payload header.
    // Layout: [send_ts_us: 8 bytes][client_idx: 4 bytes][seq: 4 bytes][padding: payload_bytes-16]
    let actual_payload = payload_bytes.max(16);

    for seq in 0u32..messages as u32 {
        let send_ts_us = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64;

        let mut payload = vec![0u8; actual_payload];
        payload[0..8].copy_from_slice(&send_ts_us.to_be_bytes());
        payload[8..12].copy_from_slice(&(client_idx as u32).to_be_bytes());
        payload[12..16].copy_from_slice(&seq.to_be_bytes());

        let frame = Frame::new(Opcode::Update, room_id_bytes, payload);
        let encoded = frame.encode();

        if sink.send(Message::Binary(encoded)).await.is_err() {
            errors.fetch_add(1, Ordering::Relaxed);
            break;
        }
        total_sent.fetch_add(1, Ordering::Relaxed);

        // Read incoming broadcasts while sending; non-blocking via try_recv pattern.
        // We process whatever arrives between sends to keep latency measurement honest.
        while let Ok(Some(Ok(msg))) =
            tokio::time::timeout(Duration::from_millis(1), stream.next()).await
        {
            if let Message::Binary(data) = msg {
                if let Ok(bcast) = Frame::decode(&data) {
                    if bcast.opcode == Opcode::Broadcast && bcast.payload.len() >= 8 {
                        let send_ts = u64::from_be_bytes(bcast.payload[0..8].try_into().unwrap());
                        let recv_ts = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_micros() as u64;

                        if recv_ts >= send_ts {
                            let rtt_us = recv_ts - send_ts;
                            histogram.lock().await.record(rtt_us).ok();
                            total_recv.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            }
        }
    }

    // Drain remaining broadcasts for up to 2 seconds after sending completes.
    let _ = tokio::time::timeout(Duration::from_secs(2), async {
        while let Some(Ok(msg)) = stream.next().await {
            if let Message::Binary(data) = msg {
                if let Ok(bcast) = Frame::decode(&data) {
                    if bcast.opcode == Opcode::Broadcast && bcast.payload.len() >= 8 {
                        let send_ts = u64::from_be_bytes(bcast.payload[0..8].try_into().unwrap());
                        let recv_ts = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_micros() as u64;
                        if recv_ts >= send_ts {
                            histogram.lock().await.record(recv_ts - send_ts).ok();
                            total_recv.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            }
        }
    })
    .await;

    Ok(())
}
