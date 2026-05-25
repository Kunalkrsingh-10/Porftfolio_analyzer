# 📖 Architecture Guide & Codebase Walkthrough

A comprehensive guide to understanding the Kalpi AI codebase structure, execution flows, and developer onboarding.

---

## 📊 Overall Code Health & Structure

### The Good 🟢
- **Clean Two-Service Architecture**: FastAPI backend + Next.js frontend 
- **Type Safety**: Pydantic (backend) + TypeScript/tRPC (frontend) ensure compile-time type checking
- **Database Strategy**: MongoDB Atlas — stores portfolio uploads and full chat history as flexible documents (no fixed schema needed)
- **Modern Stack**: Next.js 15 with React 19, tRPC for full-stack type safety
- **AI-Powered Analysis**: Groq (Llama) as default LLM with Gemini as fallback

### Areas Needing Attention 🟡
1. **Configuration Fragmentation** — Multiple config files scattered across services
2. **Magic Route Registration** — Auto-routing makes debugging harder
3. **Incomplete Frontend Integration** — tRPC frontend not yet fully connected to FastAPI backend
4. **Minimal Error Handling** — No structured error responses across services

---

## 📁 Detailed Folder Structure

### Backend: `fastapi-be/api_service/`

**Purpose:** Handles portfolio analysis, AI chat, file uploads, and business operations

```
api_service/
├── main.py                         # FastAPI initialization
├── requirements.txt                # Dependencies
├── Dockerfile
├── pyrightconfig.json              # Type checking config
│
├── app/v1/                         # API endpoints
│   ├── demo.py                     # GET /demo (health check)
│   ├── portfolio/
│   │   ├── upload.py               # POST /portfolio/upload (CSV analysis)
│   │   └── chat.py                 # POST /portfolio/chat (AI Q&A)
│   └── products/
│       ├── add.py                  # POST /products
│       ├── allproductget.py        # GET /products
│       ├── update.py               # PUT /products/{id}
│       └── delete.py               # DELETE /products/{id}
│
├── schemas/                        # Pydantic data validation
│   ├── products.py                 # Product, Order, Booking models
│   ├── portfolio.py                # PortfolioSummaryResponse, ChatRequest
│   └── common.py                   # Shared schemas
│
├── core/                           # Infrastructure
│   ├── config.py                   # MongoDB URL builder
│   ├── middleware.py               # Request middleware
│   └── database/
│       └── mongo.py                # Async MongoDB driver (Motor)
│
├── routers/
│   └── products.py                 # Product routes
│
└── services/                       # Business logic layer
    ├── portfolio_analyzer.py       # Financial metrics calculation
    └── storage.py                  # File upload handler
```

**Key Files:**

| File | What It Does |
|------|-------------|
| `main.py` | 🔌 FastAPI setup, CORS, MongoDB connection, lifespan |
| `core/database/mongo.py` | 🗄️ Motor async MongoDB client with connection pooling |
| `app/v1/portfolio/upload.py` | 📤 Receives CSV → validates → analyzes with pandas → stores in MongoDB |
| `app/v1/portfolio/chat.py` | 💬 Takes session ID + question → AI analysis (Groq/Gemini) → returns insights |
| `services/storage.py` | ☁️ File upload to local/Cloudinary/B2 storage |
| `services/portfolio_analyzer.py` | 📊 Calculates Sharpe ratio, drawdown, VaR, sector allocation |

**Portfolio Analysis Metrics:**
```python
- Total_Return_Cumulative: percentage returns over period
- Sharpe_Ratio: risk-adjusted return metric
- Max_Drawdown: largest peak-to-trough decline
- Value_At_Risk_95: maximum loss at 95% confidence
- Sector_Allocation: portfolio breakdown by sector
```

---

### Frontend: `kalpi-fe/`

**Purpose:** Modern Next.js SPA with type-safe API calls via tRPC

```
kalpi-fe/
├── package.json                    # Dependencies + scripts
├── next.config.js                  # Next.js configuration
├── tsconfig.json                   # TypeScript settings
├── tailwind.config.js              # CSS framework setup
│
├── src/
│   ├── env.js                      # Environment variable schema (Zod validation)
│   │
│   ├── app/                        # Next.js App Router (pages)
│   │   ├── layout.tsx              # Root layout wrapper
│   │   ├── page.tsx                # Home page (/)
│   │   └── api/
│   │       └── trpc/[trpc]/
│   │           └── route.ts        # tRPC HTTP handler
│   │
│   ├── server/                     # Server-only logic
│   │   └── api/
│   │       ├── root.ts             # 🎯 Root tRPC router (combines all subrouters)
│   │       ├── trpc.ts             # tRPC server initialization
│   │       └── routers/
│   │           └── post.ts         # Example router with demo data
│   │
│   ├── trpc/                       # Client-side tRPC integration
│   │   ├── react.tsx               # React provider wrapper
│   │   ├── query-client.ts         # TanStack Query configuration
│   │   └── server.ts               # Server-side tRPC caller
│   │
│   └── styles/
│       └── globals.css             # Tailwind CSS directives
│
└── public/                         # Static assets
```

**Key Files:**

| File | What It Does |
|------|-------------|
| `server/api/root.ts` | 📦 Combines all tRPC routers into single appRouter |
| `server/api/trpc.ts` | ⚙️ tRPC setup: context, middleware, error handling |
| `server/api/routers/post.ts` | 💬 Example router: hello query, create mutation, getLatest |
| `trpc/react.tsx` | 🔌 React component wrapper with QueryClientProvider |
| `app/layout.tsx` | 🎨 Root layout: fonts, metadata, TRPCReactProvider |
| `app/page.tsx` | 🏠 Home page: calls tRPC queries server-side |

---

## 🔄 Execution Flows

### Flow 1: Upload & Analyze Portfolio

```
┌─ FRONTEND ──────────────────────────────────────┐
│ User clicks "Upload Portfolio"                  │
│ Selects CSV file (portfolio.csv)                │
│ Contains: Ticker, Quantity, Price               │
│ Clicks "Analyze"                                │
└────────────────┬────────────────────────────────┘
                 │ FormData with file
                 │ POST http://localhost:8000/api/v1/portfolio/upload
                 ▼
┌─ FASTAPI ───────────────────────────────────────┐
│ Handler: app/v1/portfolio/upload.py             │
│ ├─ Receives CSV file                            │
│ ├─ Validates file format (must be .csv)         │
│ ├─ Reads file content into memory               │
│ ├─ Calls services/portfolio_analyzer.py         │
│ │   ├─ Parses CSV with pandas                   │
│ │   ├─ Calculates metrics:                      │
│ │   │  ├─ Total Return = (final - initial)/initial
│ │   │  ├─ Sharpe Ratio = (return - risk_free) / volatility
│ │   │  ├─ Max Drawdown = lowest peak-to-trough  │
│ │   │  ├─ Value at Risk (95%) = worst 5% loss   │
│ │   │  └─ Sector Allocation = %s by sector      │
│ │   └─ Returns: metrics dict                    │
│ ├─ Stores portfolio data in MongoDB Atlas:      │
│ │   {                                           │
│ │     "_id": "session_abc123",                  │
│ │     "portfolio_data": {...pandas df...},      │
│ │     "created_at": "2026-05-22..."             │
│ │   }                                           │
│ ├─ Caches session_id → DataFrame in memory     │
│ └─ Returns: {                                   │
│      "session_id": "abc123",                    │
│      "Total_Return_Cumulative": 15.5,           │
│      "Sharpe_Ratio": 1.23,                      │
│      "Max_Drawdown": -8.2,                      │
│      "Value_At_Risk_95": -5.1,                  │
│      "Sector_Allocation": {                     │
│        "Technology": 35.0,                      │
│        "Healthcare": 25.0,                      │
│        "Finance": 20.0,                         │
│        "Other": 20.0                            │
│      }                                          │
│    }                                            │
└────────────────┬────────────────────────────────┘
                 │ Response back to frontend
                 ▼
┌─ FRONTEND ──────────────────────────────────────┐
│ Receives: PortfolioSummaryResponse              │
│ Saves: session_id = "abc123"                    │
│ Displays: metrics in dashboard                  │
│ Shows: charts + sector allocation               │
└─────────────────────────────────────────────────┘
```

---

### Flow 2: Chat About Portfolio

```
┌─ FRONTEND ──────────────────────────────────────────────┐
│ User types: "What sectors are risky?"                  │
│ Clicks "Ask"                                            │
└────────────────┬──────────────────────────────────────┘
                 │ POST http://localhost:8000/api/v1/portfolio/chat
                 │ Body: {
                 │   "session_id": "abc123",
                 │   "user_message": "What sectors are risky?"
                 │ }
                 ▼
┌─ FASTAPI ───────────────────────────────────────────────┐
│ Handler: app/v1/portfolio/chat.py                       │
│ ├─ Retrieves DataFrame from:                            │
│ │   app.state.portfolio_sessions[session_id]            │
│ ├─ Calculates fresh metrics using PortfolioAnalyzer     │
│ ├─ Builds context prompt with pre-calculated metrics   │
│ ├─ Calls Groq/Gemini API:                              │
│ │   Prompt: "Analyze this portfolio for sector risk:   │
│ │            [DataFrame with stock data]               │
│ │            User question: What sectors are risky?"   │
│ ├─ LLM returns structured JSON insights                │
│ │   (LLM only interprets metrics, does no math)       │
│ ├─ Determines visualization type:                      │
│ │   "risk" (shows sector volatility chart)            │
│ ├─ Stores chat history in MongoDB Atlas               │
│ └─ Returns: ChatResponse {                             │
│      "bot_response": "Based on...",                    │
│      "active_canvas_view": "risk",                     │
│      "canvas_data": {                                  │
│        "sector": ["Tech", "Finance", ...],             │
│        "volatility": [45, 22, ...],                    │
│        "color": ["red", "yellow", ...]                 │
│      }                                                 │
│    }                                                   │
└────────────────┬──────────────────────────────────────┘
                 │ Response back to frontend
                 ▼
┌─ FRONTEND ──────────────────────────────────────────────┐
│ Displays AI response in chat                            │
│ Renders "risk" visualization:                          │
│ ├─ Bar chart showing sector volatility                 │
│ ├─ Red sectors = high risk                             │
│ ├─ Green sectors = low risk                            │
│ └─ User can ask follow-up questions                    │
└─────────────────────────────────────────────────────────┘
```

---

### Flow 3: tRPC Call (Frontend → Backend, Current Setup)

```
⚠️ NOTE: This currently operates within the same Next.js server.
  To connect to FastAPI, this flow will be modified.

┌─ REACT COMPONENT ───────────────────────────────┐
│ const hello = await api.post.hello({             │
│   text: "from tRPC"                              │
│ })                                               │
│                                                  │
│ Executes during SSR (server-side render)        │
└────────────────┬─────────────────────────────────┘
                 │ tRPC procedure call
                 ▼
┌─ NEXT.JS SERVER ─────────────────────────────────┐
│ Calls: server/api/routers/post.ts                │
│ Procedure: hello                                  │
│ ├─ Receives: {text: "from tRPC"}                │
│ ├─ Validates with Zod schema                    │
│ └─ Returns: {greeting: "Hello from tRPC"}       │
└────────────────┬─────────────────────────────────┘
                 │ Response to component
                 ▼
┌─ REACT COMPONENT ───────────────────────────────┐
│ Receives: hello = {greeting: "Hello from tRPC"} │
│ Renders: <p>{hello.greeting}</p>                │
└─────────────────────────────────────────────────┘
```

---

## 👨‍💻 Developer Reading Guide

### Week 1: Foundation Understanding (3 hours)

1. **Architecture Overview** (30 min)
   - Read: `docker-compose.yml`
   - Understand: How the two services interact
   - Goal: Know what api-service and frontend do

2. **FastAPI Setup** (1 hour)
   - Read: `fastapi-be/api_service/main.py`
   - Understand: FastAPI initialization, CORS, MongoDB connection, lifespan
   - Goal: Know app startup sequence

3. **Database Setup** (1 hour)
   - Read: `fastapi-be/api_service/core/database/mongo.py`
   - Read: `fastapi-be/api_service/core/config.py`
   - Understand: Async MongoDB with Motor
   - Goal: Know where to find connection logic

4. **Environment Variables** (30 min)
   - Read: `.env.example`
   - Understand: What keys are needed (Groq/Gemini API keys)
   - Goal: Know how to configure the app

### Week 2: Backend Deep Dive (5 hours)

5. **Business Logic - Portfolio** (2 hours)
   - Read: `fastapi-be/api_service/app/v1/portfolio/upload.py`
   - Read: `fastapi-be/api_service/services/portfolio_analyzer.py`
   - Understand: CSV parsing, pandas analysis, MongoDB storage
   - Goal: Know portfolio upload flow end-to-end

6. **AI Chat Integration** (1.5 hours)
   - Read: `fastapi-be/api_service/app/v1/portfolio/chat.py`
   - Understand: How Groq/Gemini is called with portfolio context
   - Goal: Know how LLM is used (interpret only, no calculations)

7. **Data Schemas** (1 hour)
   - Read: `fastapi-be/api_service/schemas/products.py`
   - Read: `fastapi-be/api_service/schemas/portfolio.py`
   - Understand: Pydantic validation models
   - Goal: Know data structure expectations

8. **Storage Service** (0.5 hours)
   - Read: `fastapi-be/api_service/services/storage.py`
   - Understand: Local vs cloud upload
   - Goal: Know file upload options

### Week 3: Frontend & Integration (5 hours)

9. **Next.js Setup** (1 hour)
   - Read: `kalpi-fe/package.json`
   - Read: `kalpi-fe/src/env.js`
   - Understand: Dependencies, environment validation
   - Goal: Know frontend tech stack

10. **tRPC Server Side** (1.5 hours)
    - Read: `kalpi-fe/src/server/api/root.ts`
    - Read: `kalpi-fe/src/server/api/trpc.ts`
    - Understand: Router structure, procedure types
    - Goal: Know how to add tRPC endpoints

11. **tRPC Client Side** (1 hour)
    - Read: `kalpi-fe/src/trpc/react.tsx`
    - Read: `kalpi-fe/src/server/api/routers/post.ts`
    - Understand: Making tRPC calls from components
    - Goal: Know how to call procedures

12. **Layout & Pages** (1 hour)
    - Read: `kalpi-fe/src/app/layout.tsx`
    - Read: `kalpi-fe/src/app/page.tsx`
    - Understand: Next.js App Router, component hierarchy
    - Goal: Know where to add new pages

13. **Frontend Integration Task** (0.5 hours)
    - Create new tRPC router that calls FastAPI backend
    - Replace mock post router with real portfolio data
    - Goal: Connect frontend to backend via HTTP

### Week 4: Advanced Topics (4 hours)

14. **Error Handling Strategy** (1 hour)
    - Define error response format
    - Implement try-catch middleware
    - Add detailed error logging

15. **Testing** (1 hour)
    - Set up test files
    - Write unit tests for key functions
    - Add integration tests

16. **Performance** (1 hour)
    - Database query optimization
    - Add caching layer
    - Monitor response times

17. **Deployment** (1 hour)
    - Docker image building
    - Environment configuration for production
    - CI/CD pipeline setup

---

## 🎯 File Reference by Task

| Task | Files |
|------|-------|
| **Add API endpoint** | `api_service/app/v1/*.py` |
| **Modify portfolio analysis** | `api_service/services/portfolio_analyzer.py` |
| **Modify AI chat logic** | `api_service/app/v1/portfolio/chat.py` |
| **Modify API response** | `api_service/schemas/*.py` |
| **Add frontend page** | `kalpi-fe/src/app/` |
| **Add tRPC endpoint** | `kalpi-fe/src/server/api/routers/` |
| **Style component** | `kalpi-fe/src/styles/globals.css` or inline Tailwind |
| **Fix CORS issue** | `api_service/main.py` |
| **Change DB connection** | `api_service/core/database/mongo.py` or `docker-compose.yml` |
| **Change LLM provider** | `.env` (set `LLM_PROVIDER=groq` or `gemini`) |

---

## 🚀 Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Client** | React 19 + Next.js 15 | UI rendering + SSR |
| **API Communication** | tRPC | Type-safe RPC |
| **API Query Caching** | TanStack Query | Intelligent caching |
| **Frontend Styling** | Tailwind CSS 4 | Utility CSS |
| **Type Checking** | TypeScript + Zod | Compile-time safety |
| **Core API** | FastAPI | Async API framework |
| **Core Async DB** | Motor | Async MongoDB driver |
| **Core Database** | MongoDB Atlas | `portfolios` + `chat_sessions` collections (remote) |
| **Data Validation** | Pydantic | Request/response validation |
| **Data Analysis** | pandas + numpy | Portfolio calculations |
| **AI / LLM (default)** | Groq (Llama 3.3 70B) | Portfolio insights |
| **AI / LLM (optional)** | Google Gemini | Alternative AI provider |
| **File Storage** | Local/Cloudinary/B2 | Multiple storage backends |

---

**Continue learning by building features! Each new endpoint will deepen your understanding.** 📚
