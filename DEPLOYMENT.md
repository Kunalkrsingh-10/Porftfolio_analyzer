# Deployment Guide — Kalpi AI

Deploy the full stack for free:
- **Frontend** → Vercel (`kalpi-fe/`)
- **Backend** → Render (`fastapi-be/api_service/`)
- **Database** → MongoDB Atlas (already provisioned)

---

## Prerequisites

- GitHub repo pushed and up to date
- MongoDB Atlas account with your cluster running
- Groq API key from [console.groq.com](https://console.groq.com)

---

## Step 1 — MongoDB Atlas: Allow All IPs

Render's outbound IPs change dynamically, so you must whitelist all IPs.

1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Go to **Security → Network Access**
3. Click **Add IP Address**
4. Enter `0.0.0.0/0` → **Confirm**

Your Atlas connection string (already in `docker-compose.yml`):
```
mongodb+srv://kalpi-ai:kalpi-ai@cluster0.t33jgbr.mongodb.net/?appName=Cluster0
```
> ⚠️ Consider changing the Atlas password — the current one is the same as the username.

---

## Step 2 — Render: Deploy the Backend

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Render will detect `render.yaml` automatically and configure the service
4. Go to **Environment** tab and add these **secret** variables:

   | Key | Value |
   |-----|-------|
   | `MONGO_URL` | `mongodb+srv://kalpi-ai:kalpi-ai@cluster0.t33jgbr.mongodb.net/?appName=Cluster0` |
   | `GROQ_API_KEY` | your Groq key from console.groq.com |
   | `CORS_ORIGINS` | *(leave blank for now — fill in after Step 3)* |

5. Click **Deploy** — wait ~5 minutes for the Docker build
6. Note your backend URL, e.g. `https://kalpi-ai-backend.onrender.com`
7. Test it: open `https://kalpi-ai-backend.onrender.com/health` — should return `{"status":"ok"}`

---

## Step 3 — Vercel: Deploy the Frontend

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Vercel reads `vercel.json` and sets root directory to `kalpi-fe/` automatically
4. Under **Environment Variables**, add:

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://kalpi-ai-backend.onrender.com` *(your Render URL)* |

5. Click **Deploy** — wait ~3 minutes
6. Note your frontend URL, e.g. `https://kalpi-ai.vercel.app`

---

## Step 4 — Update CORS on Render

Now that you have the Vercel URL, go back to Render:

1. **Environment → `CORS_ORIGINS`** → set to your Vercel URL:
   ```
   https://kalpi-ai.vercel.app
   ```
2. **Manual Deploy → Deploy latest commit** to restart with the new env var

---

## Step 5 — Verify Everything Works

| Check | How |
|-------|-----|
| Backend health | `GET https://your-backend.onrender.com/health` → `{"status":"ok"}` |
| Frontend loads | Open `https://your-app.vercel.app` |
| Upload CSV | Go to portfolio page, upload a CSV file |
| Chat works | Ask the agent a question |

---

## Re-deploying After Code Changes

Both services auto-deploy on every push to `main`:
- **Vercel** rebuilds and deploys the frontend automatically
- **Render** rebuilds the Docker image and restarts the backend automatically

> ⚠️ If you change `NEXT_PUBLIC_API_BASE_URL`, Vercel must **rebuild** (not just restart)
> because it's baked into the JS bundle at build time. Trigger a manual redeploy from
> the Vercel dashboard after changing it.

---

## Free Tier Limits

| Service | Limit | Impact |
|---------|-------|--------|
| Render | Sleeps after 15 min idle | First request after sleep takes ~30s to wake |
| Vercel | 100 GB bandwidth/month | More than enough for demos |
| MongoDB Atlas | 512 MB storage | Plenty for portfolio sessions |
| Groq | 6000 req/day free | Enough for demos |
