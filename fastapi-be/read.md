vastukart-backend/
├── docker-compose.yml          # Orchestration for both services + DBs
├── .env                        # Global environment variables
├── auth_service/               # [Flask] User Auth & PostgreSQL
│   ├── app.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── config.py               # Env var handling (Dev/Prod)
│   ├── models/                 # SQLAlchemy Models (User)
│   └── routes/                 # Auth Routes (Login, Register, OTP)
└── api_service/                # [FastAPI] Main Logic & MongoDB
    ├── main.py
    ├── requirements.txt
    ├── Dockerfile
    ├── core/
    │   ├── config.py           # Env management
    │   ├── database.py         # Async MongoDB connection
    │   └── security.py         # JWT Verification (from Flask)
    ├── services/
    │   └── storage.py          # B2 / Cloudinary / Local switcher
    └── routers/                # "Page-wise" routing
        ├── products.py
        └── orders.py


        <!-- updated -->

        vastukart-backend/
├── docker-compose.yml
├── .env
├── api_service/                # [FastAPI] Main Logic
│   ├── main.py                 # App Entry Point
│   ├── core/                   # Config & DB
│   ├── schemas/                # Pydantic Models (Request/Response)
│   └── routers/                # 📂 Page-Wise Routing Starts Here
│       ├── __init__.py         # Router Aggregator
│       ├── products/           # Page: Products
│       │   ├── __init__.py
│       │   └── router.py       # CRUD: GET, POST, PUT, DELETE
│       ├── orders/             # Page: Orders
│       │   ├── __init__.py
│       │   └── router.py
│       └── astrology/          # Page: Astrology Services
│           ├── __init__.py
│           └── router.py
└── auth_service/               # [Flask] Auth Only
    └── (Same as before)





    <!-- ne foldre str updated -->

    backend/
├── main.py                # Entry point (Clean & Minimal)
├── core/
│   ├── magic.py           # Ye hai wo MAGIC file (Router Loader)
│   ├── middleware.py      # Authentication Logic
│   └── security.py        # Token decode logic (Mock for now)
└── api/
    └── routes/            # Yahan apni API files banao
        ├── products.py    # Automatic -> /products
        └── orders.py      # Automatic -> /orders




🌐 COMPLETE API ENDPOINTS (Frontend ke liye)
🔐 AUTH (Flask → via Nginx)
POST   http://localhost/auth/login
POST   http://localhost/auth/register


⚙️ CORE API (FastAPI → via Nginx)
GET    http://localhost/api/hello
GET    http://localhost/api/health
GET    http://localhost/api/v1/demo
GET    http://localhost/api/protected   (JWT required)

📘 Swagger (sirf dev ke liye)
http://localhost/api/docs

VITE_API_BASE_URL=http://localhost