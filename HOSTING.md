# Hosting

Lattice has two deployable pieces:
- **Backend**: Rust/Axum server with persistent WebSocket connections
- **Frontend**: Next.js app

WebSocket hosting is the key constraint — platforms that spin down idle processes kill open connections.

---

## Current stack (both free forever)

| Layer    | Platform            | Cost        | Notes |
|----------|---------------------|-------------|-------|
| Backend  | Oracle Cloud Always Free (ARM A1) | Free forever | 4 OCPUs, 24 GB RAM, no spin-down, no expiry |
| Frontend | Vercel Hobby        | Free forever | Native Next.js, zero config |

Auto-deploy is handled by GitHub Actions on every push to `main`.

---

## Backend — Oracle Cloud Always Free setup

Oracle's Always Free ARM A1 tier gives you a real Linux VM with 4 OCPUs and 24GB RAM at no cost and no expiry. No credit card trial — you sign up once and it stays free.

### 1. Create an Oracle Cloud account
Go to cloud.oracle.com → sign up → choose **Always Free** tier.

### 2. Provision an ARM VM
In the console: Compute → Instances → Create Instance
- Shape: **VM.Standard.A1.Flex** (Ampere ARM)
- OCPUs: 2, RAM: 4 GB (well within the free 4 OCPU / 24 GB allowance)
- Image: **Ubuntu 22.04 Minimal**
- Add your SSH public key

### 3. Open port 3001 in the security list
Networking → Virtual Cloud Networks → your VCN → Security Lists → add ingress rule:
- Protocol: TCP, Destination Port: 3001

Also open it in the OS firewall on the VM:
```sh
sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
sudo netfilter-persistent save
```

### 4. Install Docker on the VM
```sh
ssh ubuntu@<your-vm-ip>
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
# log out and back in
```

### 5. Add GitHub secrets
Go to github.com/aakashkolli/lattice → Settings → Secrets → Actions:

| Secret | Value |
|---|---|
| `ORACLE_HOST` | Your VM's public IP |
| `ORACLE_USER` | `ubuntu` |
| `ORACLE_SSH_KEY` | Your SSH private key (the full PEM content) |
| `GHCR_TOKEN` | A GitHub PAT with `read:packages` scope (github.com → Settings → Developer settings → Personal access tokens) |

### 6. Update NEXT_PUBLIC_WS_URL
In the Vercel dashboard → lattice-frontend → Settings → Environment Variables:
```
NEXT_PUBLIC_WS_URL=wss://<your-vm-ip>:3001/ws
```
Or point a free subdomain (Cloudflare, duckdns.org) at the VM IP for a cleaner URL.

---

## Frontend — Vercel

Connected to the GitHub repo via Vercel's Git integration. Deploys automatically on push to `main`.

---

## Why not the alternatives

| Platform | Problem |
|---|---|
| Fly.io | No free tier for new accounts (removed Oct 2024) |
| Render | Spins down after 15 min idle — kills WebSocket connections |
| Railway | $5 credit expires; no true free tier |
| Koyeb | No free compute tier (as of 2026) |
| Deno Deploy | Serverless — can't hold persistent connections |

---

## If you outgrow the free tier

- Oracle Cloud: upgrade to paid shape (~$0.01/OCPU-hr) — same infrastructure, no migration
- Vercel: $20/month Pro for team features (free tier is sufficient for personal use)
