FROM rust:1.85-slim AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY backend backend/
COPY shared shared/
COPY bench bench/

RUN cargo build --release --bin lattice-backend

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/lattice-backend /usr/local/bin/lattice-backend

ENV PORT=8080
EXPOSE 8080

CMD ["lattice-backend"]
