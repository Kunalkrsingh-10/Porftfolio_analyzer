# Kalpi AI — Full-Stack Portfolio Intelligence Platform

One-command local deployment for the complete Kalpi AI stack: Next.js frontend and FastAPI analytics service wired together via Docker Compose. MongoDB Atlas is hosted remotely — no local database containers needed.

---

## Architecture

```
Browser
  │
  ├── port 3000
  │   ┌───────────────────┐
  │   │   Next.js 15      │
  │   │   (Frontend)      │
  │   └────────┬──────────┘
  │             │ HTTP requests (NEXT_PUBLIC_API_BASE_URL)
  │             ▼
  └── port 8000
      ┌───────────────────┐
      │   FastAPI          │
      │   (api-service)    │
      └────────┬───────────┘
               │
      ┌────────┴──────────────────────┐
      │                               │
 ┌────▼──────┐                 ┌──────▼──────┐
 │ MongoDB   │                 │  Groq /     │
 │ Atlas     │                 │  Gemini AI  │
 │ (remote)  │                 └─────────────┘
 └───────────┘
 portfolios +
 chat_sessions
```

Two containers start locally:
- **api-service** → http://localhost:8000
- **frontend** → http://localhost:3000

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
| `GROQ_API_KEY` | Free key from https://console.groq.com (default LLM provider) |
| `GEMINI_API_KEY` | Free key from https://aistudio.google.com/apikey (optional, if switching to Gemini) |

Everything else works out of the box for local development — databases are pre-configured and hosted remotely.

### 3. Build and start everything

```bash
docker compose up --build
```

The first build downloads base images and installs all dependencies — this typically takes **5–10 minutes**. Subsequent starts (without `--build`) take under 30 seconds.

### 4. Open the app

| Service | URL |
|---|---|
| **Kalpi AI App** | http://localhost:3000 |
| FastAPI interactive docs | http://localhost:8000/docs |
| FastAPI redoc | http://localhost:8000/redoc |

---

## Day-to-day commands

```bash
# Stop all containers (data is preserved on remote DBs)
docker compose down

# Rebuild a single service after code changes
docker compose up --build api-service
docker compose up --build frontend

# Stream logs for all services
docker compose logs -f

# Stream logs for one service
docker compose logs -f api-service
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ | — | Groq API key for LLM (portfolio chat AI) |
| `GEMINI_API_KEY` | Optional | — | Gemini API key (only needed if `LLM_PROVIDER=gemini`) |
| `LLM_PROVIDER` | Optional | `groq` | AI provider: `groq` or `gemini` |
| `GROQ_MODEL` | Optional | `llama-3.3-70b-versatile` | Groq model to use |
| `NEXT_PUBLIC_API_BASE_URL` | Optional | `http://localhost:8000` | URL the browser uses to reach the API |
| `ENV_MODE` | Optional | `production` | App environment mode |

> The MongoDB Atlas URL is pre-configured in `docker-compose.yml` and works out of the box.

---

## Project Structure

```
kalpi-ai/
├── docker-compose.yml          ← root compose file (two services: api + frontend)
├── .env                        ← your secrets (never commit this file)
├── .env.example                ← safe template to copy
├── fastapi-be/
│   └── api_service/            ← FastAPI portfolio analytics (port 8000)
│       ├── main.py             ← app entry point
│       ├── requirements.txt
│       ├── Dockerfile
│       ├── app/
│       │   └── v1/
│       │       ├── portfolio/  ← upload.py (CSV analysis), chat.py (AI Q&A)
│       │       └── products/   ← CRUD endpoints
│       ├── core/               ← database connection, config, middleware
│       ├── schemas/            ← Pydantic request/response models
│       └── services/           ← portfolio_analyzer.py, storage.py
└── kalpi-fe/                   ← Next.js 15 frontend (port 3000)
    ├── src/
    │   ├── app/                ← Next.js App Router pages
    │   ├── server/             ← tRPC server-side logic
    │   └── trpc/               ← tRPC client integration
    ├── Dockerfile
    └── .dockerignore
```

---

## Troubleshooting

**`port is already allocated` error**
Another process is using port 8000 or 3000. Update the `ports` mapping in `docker-compose.yml`, set `NEXT_PUBLIC_API_BASE_URL` to the new API port in `.env`, then rebuild: `docker compose up --build`.

**Frontend shows blank page or API 404 errors**
`NEXT_PUBLIC_API_BASE_URL` is baked into the JS bundle at build time. If you changed the API port, this value must match. Rebuild the frontend: `docker compose up --build frontend`.

**API returns 500 errors on startup**
The API service connects to remote databases at startup. Check your network connection and verify you can reach MongoDB Atlas and Railway from your machine.

**Windows: `docker: command not found` in PowerShell**
Docker Desktop may still be starting. Check the system tray for the whale icon and wait until it shows "Docker Desktop is running", then retry.

**AI chat returns errors**
Ensure `GROQ_API_KEY` (or `GEMINI_API_KEY` if using Gemini) is set correctly in `.env`. Verify the key is active at https://console.groq.com.
