# Kalpi AI — Full-Stack Portfolio Intelligence Platform

One-command local deployment for the complete Kalpi AI stack: Next.js frontend, FastAPI analytics service, Flask auth service, PostgreSQL, MongoDB, and Nginx — all wired together via Docker Compose.

---

## Architecture

```
Browser
  │
  ▼ port 80
┌─────────────────────────────────────┐
│           Nginx (gateway)           │
│  /          → frontend:3000         │
│  /api/      → api-service:8000      │
│  /auth/     → auth-service:5000     │
└──────────┬──────────┬───────────────┘
           │          │
    ┌──────▼──┐  ┌────▼──────┐
    │FastAPI  │  │Flask Auth │
    │(Python) │  │(Python)   │
    └──────┬──┘  └────┬──────┘
           │          │
    ┌──────▼──┐  ┌────▼──────┐
    │ MongoDB │  │PostgreSQL │
    │(volume) │  │(volume)   │
    └─────────┘  └───────────┘

    ┌─────────────┐
    │ Next.js 15  │  (built and served inside Docker)
    └─────────────┘
```

All services communicate over an internal Docker bridge network (`kalpi-net`). Only Nginx is exposed to the host on port 80.

---

## Prerequisites

### Windows

1. **Install Docker Desktop**
   - Download from https://www.docker.com/products/docker-desktop/
   - Run the installer and follow the prompts (enable WSL 2 integration when asked)
   - After installation, start Docker Desktop from the Start Menu
   - Wait for the whale icon in the system tray to show "Docker Desktop is running"

2. **Verify installation** — open PowerShell or Command Prompt:
   ```powershell
   docker --version
   docker compose version
   ```

### Ubuntu / Debian

```bash
# 1. Remove any old Docker packages
sudo apt-get remove docker docker-engine docker.io containerd runc

# 2. Install Docker Engine
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 3. Allow running Docker without sudo (log out and back in after this)
sudo usermod -aG docker $USER

# 4. Verify
docker --version
docker compose version
```

---

## Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url> kalpi-ai
cd kalpi-ai
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in the values marked `CHANGE_ME`:

| Variable | What it is |
|---|---|
| `SECRET_KEY` / `JWT_SECRET` | Random strings ≥ 32 chars. Generate with: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `POSTGRES_PASSWORD` | Pick any strong password. Also update `DATABASE_URL` to match. |
| `GROQ_API_KEY` | Free key from https://console.groq.com |
| `GEMINI_API_KEY` | Free key from https://aistudio.google.com/apikey |

Everything else works out of the box for local development.

> **If port 80 is already in use** on your machine, set `NGINX_PORT=8080` in `.env`
> and also set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`.

### 3. Build and start everything

```bash
docker compose up --build
```

The first build downloads base images and installs all dependencies — this typically takes **5–10 minutes**. Subsequent starts (without `--build`) take under 30 seconds.

### 4. Open the app

| Service | URL |
|---|---|
| **Kalpi AI App** | http://localhost |
| FastAPI interactive docs | http://localhost/api/docs |
| FastAPI redoc | http://localhost/api/redoc |

---

## Day-to-day commands

```bash
# Stop all containers (volumes and data are preserved)
docker compose down

# Stop and delete all data (full reset)
docker compose down -v

# Rebuild a single service after code changes
docker compose up --build api-service
docker compose up --build frontend

# Stream logs for all services
docker compose logs -f

# Stream logs for one service
docker compose logs -f api-service
```

---

## Switching to Cloud Databases

The default `.env` uses local Docker containers for PostgreSQL and MongoDB. To switch to hosted databases (Railway, Supabase, MongoDB Atlas, etc.):

1. Replace the database URLs in `.env`:
   ```env
   # PostgreSQL — paste your full connection string
   DATABASE_URL=postgresql://user:pass@your-host:port/dbname

   # MongoDB — paste your Atlas SRV string
   MONGO_URL=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/
   ```

2. Comment out or remove the `postgres` and `mongo` service blocks in `docker-compose.yml` (the application services will connect to the external URLs directly).

3. Rebuild: `docker compose up --build`

---

## Project Structure

```
kalpi-ai/
├── docker-compose.yml          ← root compose file (single command to run everything)
├── .env                        ← your secrets (never commit this file)
├── .env.example                ← safe template to copy
├── nginx/
│   └── nginx.conf              ← request routing: browser → nginx → services
├── fastapi-be/
│   ├── auth_service/           ← Flask OTP auth (internal port 5000)
│   │   └── Dockerfile
│   └── api_service/            ← FastAPI portfolio analytics (internal port 8000)
│       └── Dockerfile
└── kalpi-fe/                   ← Next.js 15 frontend (internal port 3000)
    ├── Dockerfile
    └── .dockerignore
```

---

## Troubleshooting

**`port is already allocated` error**
Another process is using port 80. Set `NGINX_PORT=8080` in `.env` and `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`, then rebuild: `docker compose up --build frontend nginx`.

**Frontend shows blank page or API 404 errors**
`NEXT_PUBLIC_API_BASE_URL` is baked into the JS bundle at build time. If you changed `NGINX_PORT`, this value must match. Rebuild the frontend: `docker compose up --build frontend`.

**`exec /usr/local/bin/mongosh: no such file or directory`**
Your local Docker image cache has a stale Mongo image. Run `docker pull mongo:6.0` then `docker compose up --build`.

**Database errors on first start**
The Flask auth service runs `db.create_all()` at startup. If you see SQLAlchemy connection errors, check that `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` in `.env` match the values in `DATABASE_URL` exactly, and that the `postgres` healthcheck has passed before `auth-service` starts (watch `docker compose logs postgres`).

**Windows: `docker: command not found` in PowerShell**
Docker Desktop may still be starting. Check the system tray for the whale icon and wait until it shows "Docker Desktop is running", then retry.
