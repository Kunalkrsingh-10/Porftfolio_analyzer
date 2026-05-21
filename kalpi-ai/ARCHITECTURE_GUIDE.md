# 📖 Architecture Guide & Codebase Walkthrough

A comprehensive guide to understanding the Kalpi AI codebase structure, execution flows, and developer onboarding.

---

## 📊 Overall Code Health & Structure

### The Good 🟢
- **Microservices Architecture**: Backend split into Auth Service + API Service for independent scaling
- **Type Safety**: Pydantic (backend) + TypeScript/tRPC (frontend) ensure compile-time type checking
- **Database Strategy**: PostgreSQL for relational data + MongoDB for flexible schemas
- **Modern Stack**: Next.js 15 with React 19, tRPC for full-stack type safety
- **API Gateway**: Nginx properly separates services from clients
- **Authentication**: JWT-based with clear separation of concerns

### Areas Needing Attention 🟡
1. **Configuration Fragmentation** — Multiple config files scattered across services
2. **Magic Route Registration** — Auto-routing makes debugging harder
3. **Incomplete Frontend Integration** — tRPC frontend not yet connected to FastAPI backend
4. **Minimal Error Handling** — No structured error responses across services
5. **Security Gaps** — Token validation stubbed, hardcoded CORS, no rate limiting

---

## 📁 Detailed Folder Structure

### Backend: `fastapi-be/`

#### Auth Service (Flask) — User Identity & Tokens

**Purpose:** Handles registration, login, OTP verification, social auth, JWT token generation

```
auth_service/
├── app.py                          # Flask initialization + middleware
├── requirements.txt                # Dependencies
├── Dockerfile                      # Container setup
│
├── app/v0/                         # API endpoints
│   ├── login.py                    # POST /auth/login
│   ├── register.py                 # POST /auth/register  
│   ├── send-otp.py                 # POST /auth/send-otp
│   ├── verify-otp.py               # POST /auth/verify-otp
│   ├── verify_registration.py      # POST /auth/verify-registration
│   ├── refresh_token.py            # POST /auth/refresh-token
│   ├── social_login.py             # POST /auth/social-login (Google/FB)
│   ├── logout.py                   # POST /auth/logout
│   └── me.py                       # GET /auth/me (current user)
│
└── core/                           # Infrastructure
    ├── config.py                   # Database URL builder
    ├── models.py                   # User SQLAlchemy model
    ├── utils.py                    # Hashing, token generation
    ├── social_utils.py             # OAuth utilities
    ├── magic.py                    # Auto-route registration (WIP)
    └── database/
        ├── postgres.py             # SQLAlchemy connection pool setup
        └── mongo.py                # MongoDB connection (placeholder)
```

**Key Files:**

| File | What It Does |
|------|-------------|
| `app.py` | 🚀 Flask app initialization, DB connection, CORS setup |
| `core/models.py` | 👤 User schema: id (UUID), email, mobile, password_hash, role, social auth fields |
| `app/v0/login.py` | 🔓 Accepts email OR mobile → verifies password → returns JWT token |
| `core/database/postgres.py` | 🗄️ SQLAlchemy connection pooling (20 connections + 40 overflow) |

**User Model Fields:**
```python
- id: UUID (primary key)
- email: unique, nullable
- mobile: unique, nullable
- password_hash: bcrypt encrypted
- first_name, last_name: optional
- is_email_verified, is_mobile_verified: flags
- is_active, is_deleted: access control
- auth_provider: 'email', 'google', 'facebook'
- social_id: external provider ID
- role: 'admin', 'customer', 'support'
- created_at, updated_at: audit timestamps
```

---

#### API Service (FastAPI) — Core Business Logic

**Purpose:** Handles products, portfolio analysis, AI chat, file uploads, and business operations

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
│   ├── middleware.py               # JWT token validation
│   ├── security.py                 # Security utilities (empty)
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
| `main.py` | 🔌 FastAPI setup, CORS, JWT middleware, MongoDB connection |
| `core/database/mongo.py` | 🗄️ Motor async MongoDB client with connection pooling |
| `app/v1/portfolio/upload.py` | 📤 Receives CSV → validates → analyzes with pandas → stores in MongoDB |
| `app/v1/portfolio/chat.py` | 💬 Takes session ID + question → AI analysis (Gemini) → returns insights |
| `services/storage.py` | ☁️ File upload to local/Cloudinary/B2 storage |
| `services/portfolio_analyzer.py` | 📊 Calculates Sharpe ratio, drawdown, VaR, sector allocation |

**Portfolio Analysis Metrics:**
```python
- Total_Return_Cumulative: percentage returns over period
- Benchmark_Return_Cumulative: comparison baseline
- Sharpe_Ratio: risk-adjusted return metric
- Max_Drawdown: largest peak-to-trough decline
- Value_At_Risk_95: maximum loss at 95% confidence
- Sector_Allocation: portfolio breakdown by sector
```

---

#### Nginx Gateway

**Purpose:** Single entry point for all requests, routes to appropriate backend service

```
nginx/
└── nginx.conf                      # Reverse proxy configuration
    ├── Upstream groups
    │   ├── auth_upstream: auth-service:5000
    │   └── api_upstream: api-service:8000
    ├── Location /auth/ → Flask service
    ├── Location /api/ → FastAPI service
    └── CORS handling for OPTIONS preflight
```

**How It Works:**
1. Client sends request to http://nginx:80
2. Nginx checks request path
3. If `/auth/*` → forwards to Flask (port 5000)
4. If `/api/*` → forwards to FastAPI (port 8000)
5. Handles CORS headers and OPTIONS preflight
6. Response sent back to client

---

### Frontend: `kalpi-fe/`

**Purpose:** Modern Next.js SPA with type-safe API calls via tRPC

```
kalpi-fe/
├── package.json                    # Dependencies + scripts
├── next.config.js                  # Next.js configuration
├── tsconfig.json                   # TypeScript settings
├── tailwind.config.js              # CSS framework setup
├── eslint.config.js                # Linting rules
├── prettier.config.js              # Code formatting
│
├── src/
│   ├── env.js                      # Environment variable schema (Zod validation)
│   │
│   ├── app/                        # Next.js App Router (pages)
│   │   ├── layout.tsx              # Root layout wrapper
│   │   ├── page.tsx                # Home page (/)
│   │   ├── _components/
│   │   │   └── post.tsx            # Example component
│   │   ├── api/
│   │   │   └── trpc/[trpc]/
│   │   │       └── route.ts        # tRPC HTTP handler
│   │   └── multiplication-table/
│   │       └── page.tsx            # Example page
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

### Flow 1: User Registration & Login

```
┌─ FRONTEND (Next.js) ─────────────────────────────────────┐
│ User visits /register page                               │
│ Fills form: email/mobile, password, name                 │
│ Clicks "Register" button                                 │
└────────────────┬─────────────────────────────────────────┘
                 │ POST to /auth/register
                 ▼
┌─ NGINX ────────────────────────────────────────────────────┐
│ Receives: POST /auth/register                             │
│ Checks path pattern: matches /auth/*                      │
│ Routes to: http://auth-service:5000/auth/register        │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌─ FLASK AUTH SERVICE ───────────────────────────────────────┐
│ Handler: app/v0/register.py                               │
│ ├─ Validates email/mobile format                          │
│ ├─ Checks if user already exists (query PostgreSQL)      │
│ ├─ Hashes password with bcrypt                            │
│ ├─ Creates User record in PostgreSQL                      │
│ ├─ Generates OTP (6 digits)                               │
│ ├─ Sends OTP to email/SMS (via SMTP/Twilio)              │
│ └─ Returns: {"user_id": "abc-123", "message": "OTP sent"}│
└────────────────┬─────────────────────────────────────────┘
                 │ Response back to frontend
                 ▼
┌─ FRONTEND ─────────────────────────────────────────────────┐
│ Receives: user_id + message                               │
│ Displays: "Check your email for OTP"                      │
│ Shows: OTP input field                                    │
└────────────────┬─────────────────────────────────────────┘
                 │ User enters OTP
                 │ POST to /auth/verify-otp
                 ▼
┌─ FLASK AUTH SERVICE ───────────────────────────────────────┐
│ Handler: app/v0/verify-otp.py                             │
│ ├─ Validates OTP matches generated code                   │
│ ├─ Marks user.is_email_verified = True (update DB)       │
│ └─ Returns: {"status": "verified"}                        │
└────────────────┬─────────────────────────────────────────┘
                 │ User now verified, ready to login
                 ▼
┌─ FRONTEND ─────────────────────────────────────────────────┐
│ Shows: "Registration complete!"                           │
│ Redirects to login page                                   │
└────────────────┬─────────────────────────────────────────┘
                 │ User enters email + password
                 │ POST to /auth/login
                 ▼
┌─ FLASK AUTH SERVICE ───────────────────────────────────────┐
│ Handler: app/v0/login.py                                  │
│ ├─ Finds user by email (query PostgreSQL)                │
│ ├─ Verifies password hash matches                         │
│ ├─ Checks is_email_verified = True                        │
│ ├─ Generates JWT token (exp: 60 minutes)                 │
│ │   Token payload:
│ │   {
│ │     "sub": "user_uuid",
│ │     "type": "access",
│ │     "exp": 1234567890
│ │   }
│ └─ Returns: {"access_token": "eyJh...", "token_type": "Bearer"}
└────────────────┬─────────────────────────────────────────┘
                 │ Response back to frontend
                 ▼
┌─ FRONTEND ─────────────────────────────────────────────────┐
│ Receives: access_token                                    │
│ Stores: localStorage.setItem("token", access_token)      │
│ Redirects: to dashboard                                   │
│ Future requests include: Authorization: Bearer <token>   │
└─────────────────────────────────────────────────────────────┘
```

---

### Flow 2: Upload & Analyze Portfolio

```
┌─ FRONTEND ──────────────────────────────────────┐
│ User clicks "Upload Portfolio"                  │
│ Selects CSV file (portfolio.csv)                │
│ Contains: Date, Ticker, Quantity, Price        │
│ Clicks "Analyze"                                │
└────────────────┬────────────────────────────────┘
                 │ FormData with file
                 │ POST /api/v1/portfolio/upload
                 │ Header: Authorization: Bearer <token>
                 ▼
┌─ NGINX ────────────────────────────────────────┐
│ Receives: POST /api/v1/portfolio/upload        │
│ Routes to: http://api-service:8000/api/...    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─ FASTAPI CORE ──────────────────────────────────┐
│ Middleware: AuthMiddleware                      │
│ ├─ Extracts token from Authorization header    │
│ ├─ Validates JWT signature (using JWT_SECRET)  │
│ ├─ Extracts user ID from token payload         │
│ └─ Stores user in request.state.user           │
│                                                 │
│ Handler: app/v1/portfolio/upload.py            │
│ ├─ Receives CSV file                           │
│ ├─ Validates file format (must be .csv)        │
│ ├─ Reads file content into memory              │
│ ├─ Calls services/portfolio_analyzer.py        │
│ │   ├─ Parses CSV with pandas                  │
│ │   ├─ Calculates metrics:                     │
│ │   │  ├─ Total Return = (final - initial)/initial
│ │   │  ├─ Sharpe Ratio = (return - risk_free) / volatility
│ │   │  ├─ Max Drawdown = lowest peak-to-trough
│ │   │  ├─ Value at Risk (95%) = worst 5% loss │
│ │   │  └─ Sector Allocation = %s by sector    │
│ │   └─ Returns: metrics dict                   │
│ ├─ Stores portfolio data in MongoDB:           │
│ │   {                                          │
│ │     "_id": "session_abc123",                 │
│ │     "user_id": "user_xyz",                   │
│ │     "portfolio_data": {...pandas df...},     │
│ │     "created_at": "2026-05-19..."            │
│ │   }                                          │
│ ├─ Stores session_id → DataFrame in memory    │
│ │   (app.state.portfolio_sessions)             │
│ ├─ Creates PortfolioSummaryResponse           │
│ └─ Returns: {                                  │
│      "session_id": "abc123",                   │
│      "Total_Return_Cumulative": 15.5,          │
│      "Sharpe_Ratio": 1.23,                     │
│      "Max_Drawdown": -8.2,                     │
│      "Value_At_Risk_95": -5.1,                 │
│      "Sector_Allocation": {                    │
│        "Technology": 35.0,                     │
│        "Healthcare": 25.0,                     │
│        "Finance": 20.0,                        │
│        "Other": 20.0                           │
│      }                                         │
│    }                                           │
└────────────────┬────────────────────────────────┘
                 │ Response back through Nginx
                 ▼
┌─ FRONTEND ──────────────────────────────────────┐
│ Receives: PortfolioSummaryResponse              │
│ Saves: session_id = "abc123"                    │
│ Displays: metrics in dashboard                  │
│ Shows: charts + sector allocation               │
└─────────────────────────────────────────────────┘
```

---

### Flow 3: Chat About Portfolio

```
┌─ FRONTEND ──────────────────────────────────────────────┐
│ User types: "What sectors are risky?"                  │
│ Clicks "Ask"                                            │
└────────────────┬──────────────────────────────────────┘
                 │ POST /api/v1/portfolio/chat
                 │ Body: {
                 │   "session_id": "abc123",
                 │   "user_message": "What sectors are risky?"
                 │ }
                 │ Header: Authorization: Bearer <token>
                 ▼
┌─ FASTAPI ───────────────────────────────────────────────┐
│ Handler: app/v1/portfolio/chat.py                       │
│ ├─ Validates JWT token (middleware)                     │
│ ├─ Retrieves DataFrame from:                            │
│ │   app.state.portfolio_sessions[session_id]           │
│ ├─ Prepares AI prompt with portfolio data              │
│ ├─ Calls Google Gemini API:                            │
│ │   Prompt: "Analyze this portfolio for sector risk:   │
│ │            [DataFrame with stock data]               │
│ │            User question: What sectors are risky?"   │
│ ├─ AI returns: "Based on volatility analysis,          │
│ │              Technology sector shows 45% daily       │
│ │              fluctuation, making it risky..."        │
│ ├─ Determines visualization type:                       │
│ │   "risk" (shows sector volatility chart)            │
│ └─ Returns: ChatResponse {                             │
│      "bot_response": "Based on...",                    │
│      "active_canvas_view": "risk",                     │
│      "canvas_data": {                                 │
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

### Flow 4: tRPC Call (Frontend → Backend, Current Setup)

```
⚠️ **NOTE: This currently operates within the same Next.js server.
  To connect to FastAPI, this flow will be modified.**

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
│ ├─ Executes procedure body:                     │
│ │   return {                                     │
│ │     greeting: `Hello ${input.text}`            │
│ │   }                                            │
│ └─ Returns: {greeting: "Hello from tRPC"}       │
└────────────────┬─────────────────────────────────┘
                 │ Response to component
                 ▼
┌─ REACT COMPONENT ───────────────────────────────┐
│ Receives: hello = {greeting: "Hello from tRPC"}│
│ Renders: <p>{hello.greeting}</p>               │
│ Output: "Hello from tRPC"                       │
└─────────────────────────────────────────────────┘
```

---

## 👨‍💻 Developer Reading Guide

### Week 1: Foundation Understanding (4 hours)

1. **Architecture Overview** (30 min)
   - Read: `fastapi-be/docker-compose.yml`
   - Understand: How services interact
   - Goal: Know the 3 main components

2. **API Gateway** (20 min)
   - Read: `fastapi-be/nginx/nginx.conf`
   - Understand: Request routing
   - Goal: Know how `/auth/*` goes to Flask, `/api/*` goes to FastAPI

3. **Authentication** (1.5 hours)
   - Read: `fastapi-be/auth_service/core/models.py`
   - Read: `fastapi-be/auth_service/app/v0/login.py`
   - Read: `fastapi-be/auth_service/app.py`
   - Understand: User registration, OTP, JWT tokens
   - Goal: Know auth flow end-to-end

4. **Database Setup** (1 hour)
   - Read: `fastapi-be/auth_service/core/config.py`
   - Read: `fastapi-be/auth_service/core/database/postgres.py`
   - Read: `fastapi-be/api_service/core/database/mongo.py`
   - Understand: PostgreSQL vs MongoDB
   - Goal: Know where to find connection logic

### Week 2: Backend Deep Dive (6 hours)

5. **FastAPI Setup** (1 hour)
   - Read: `fastapi-be/api_service/main.py` (lines 1-80)
   - Understand: FastAPI initialization, middleware, lifespan
   - Goal: Know app startup sequence

6. **API Middleware & Security** (1 hour)
   - Read: `fastapi-be/api_service/core/middleware.py`
   - Understand: JWT validation flow
   - Goal: Know how tokens are checked

7. **Business Logic - Portfolio** (2 hours)
   - Read: `fastapi-be/api_service/app/v1/portfolio/upload.py`
   - Read: `fastapi-be/api_service/services/portfolio_analyzer.py`
   - Understand: CSV parsing, analysis, MongoDB storage
   - Goal: Know portfolio upload flow

8. **Data Schemas** (1 hour)
   - Read: `fastapi-be/api_service/app/schemas/products.py`
   - Read: `fastapi-be/api_service/app/schemas/portfolio.py`
   - Understand: Pydantic validation models
   - Goal: Know data structure expectations

9. **Storage Service** (1 hour)
   - Read: `fastapi-be/api_service/services/storage.py`
   - Understand: Local vs cloud upload
   - Goal: Know file upload options

### Week 3: Frontend & Integration (5 hours)

10. **Next.js Setup** (1 hour)
    - Read: `kalpi-fe/package.json`
    - Read: `kalpi-fe/src/env.js`
    - Understand: Dependencies, environment validation
    - Goal: Know frontend tech stack

11. **tRPC Server Side** (1.5 hours)
    - Read: `kalpi-fe/src/server/api/root.ts`
    - Read: `kalpi-fe/src/server/api/trpc.ts`
    - Understand: Router structure, procedure types
    - Goal: Know how to add tRPC endpoints

12. **tRPC Client Side** (1 hour)
    - Read: `kalpi-fe/src/trpc/react.tsx`
    - Read: `kalpi-fe/src/server/api/routers/post.ts`
    - Understand: Making tRPC calls from components
    - Goal: Know how to call procedures

13. **Layout & Pages** (1 hour)
    - Read: `kalpi-fe/src/app/layout.tsx`
    - Read: `kalpi-fe/src/app/page.tsx`
    - Understand: Next.js App Router, component hierarchy
    - Goal: Know where to add new pages

14. **Frontend Integration Task** (0.5 hours)
    - Create new tRPC router that calls FastAPI backend
    - Replace mock post router with real data
    - Goal: Connect frontend to backend via HTTP

### Week 4: Advanced Topics (4 hours)

15. **Error Handling Strategy** (1 hour)
    - Define error response format
    - Implement try-catch middleware
    - Add detailed error logging

16. **Testing** (1 hour)
    - Set up test files
    - Write unit tests for key functions
    - Add integration tests

17. **Performance** (1 hour)
    - Database query optimization
    - Add caching layer
    - Monitor response times

18. **Deployment** (1 hour)
    - Docker image building
    - Environment configuration for production
    - CI/CD pipeline setup

---

## 🎯 File Reference by Task

| Task | Files |
|------|-------|
| **Add user field** | `auth_service/core/models.py` |
| **Add auth endpoint** | `auth_service/app/v0/*.py` |
| **Modify JWT logic** | `auth_service/core/utils.py` |
| **Add product endpoint** | `api_service/app/v1/products/*.py` |
| **Modify API response** | `api_service/app/schemas/*.py` |
| **Change routing** | `nginx/nginx.conf` |
| **Add frontend page** | `kalpi-fe/src/app/` |
| **Add tRPC endpoint** | `kalpi-fe/src/server/api/routers/` |
| **Style component** | `kalpi-fe/src/styles/globals.css` or inline Tailwind |
| **Fix CORS issue** | `auth_service/app.py` or `api_service/main.py` |

---

## 🚀 Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Client** | React 19 + Next.js 15 | UI rendering + SSR |
| **API Communication** | tRPC | Type-safe RPC |
| **API Query Caching** | TanStack Query | Intelligent caching |
| **Frontend Styling** | Tailwind CSS 4 | Utility CSS |
| **Type Checking** | TypeScript + Zod | Compile-time safety |
| **Gateway** | Nginx | Request routing |
| **Auth Service** | Flask | User management |
| **Auth ORM** | SQLAlchemy | Database mapping |
| **Auth Database** | PostgreSQL | Relational data |
| **Core API** | FastAPI | Async API framework |
| **Core Async DB** | Motor | Async MongoDB driver |
| **Core Database** | MongoDB | Flexible schema |
| **Authentication** | PyJWT + bcrypt | Token + password hashing |
| **Data Validation** | Pydantic | Request/response validation |
| **Analysis** | pandas + numpy | Data processing |
| **AI/LLM** | Google Gemini | Portfolio insights |
| **File Storage** | Local/Cloudinary/B2 | Multiple storage backends |

---

**Continue learning by building features! Each new endpoint will deepen your understanding.** 📚
