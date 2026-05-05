# Lattice — Collaborative Editor

A real-time collaborative editor built on CRDT synchronization, a Rust actor-model backend, and a custom binary WebSocket protocol.

## Features

- Real-time sync via binary WebSocket frames
- CRDT-first: conflict-free merging via Yjs
- Toggle between plain text and Markdown mode
- Live collaborator presence and cursors
- Reconnect-safe: late joiners replay all document state

## Architecture

```
Client → Gateway → Room Actor → Broadcast → Clients
```

Each document room is handled by a single Tokio task (Room Actor). Updates are accumulated and replayed to late-joining clients.

## Quickstart

### 1. Start the backend

```bash
cargo run -p lattice-backend
```

### 2. Start the frontend

```bash
npm install
npm run dev --workspace=frontend
```

### 3. Open in browser

Go to `http://localhost:3000`, create a room, then open the same URL in a second tab.

## Development

```bash
cargo test
npm run typecheck --workspace=frontend
```

## Benchmarking

```bash
make bench
```

## Protocol

Binary frame: `[version:1][opcode:1][flags:1][room_id:16][payload_len:4][payload:n]`

The protocol is defined once in `shared/` and mirrored in Rust and TypeScript.
