.PHONY: dev backend frontend bench test clean

# Start backend (terminal 1)
backend:
	RUST_LOG=lattice_backend=debug cargo run -p lattice-backend

# Start frontend (terminal 2)
frontend:
	npm run dev --workspace=frontend

# Run all Rust tests
test:
	cargo test

# Run benchmarks against a running backend (PORT=3001 by default)
bench:
	cargo run -p lattice-bench -- --url ws://localhost:3001/ws --clients 20 --messages 500

# Quick bench with higher concurrency
bench-stress:
	cargo run --release -p lattice-bench -- \
		--url ws://localhost:3001/ws \
		--clients 100 \
		--messages 1000 \
		--payload-bytes 256

# Start infra services (Redis + Postgres) for future phases
infra:
	docker compose -f infra/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker-compose.yml down

clean:
	cargo clean
	rm -rf frontend/.next frontend/node_modules node_modules
