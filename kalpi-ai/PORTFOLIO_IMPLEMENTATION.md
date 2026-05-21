# Portfolio Analysis & Chat Implementation Summary

## ✅ Files Created/Updated

### 1. **api_service/services/portfolio_analyzer.py**
**Purpose:** Deterministic financial calculations using pandas/numpy

**Key Features:**
- `PortfolioAnalyzer` class with static methods for all calculations
- Pure functions with no side effects (100% deterministic)
- Comprehensive validation via `validate_portfolio_data()`
- Automatic DataFrame normalization via `normalize_dataframe()`

**Metrics Calculated:**
- ✅ `calculate_total_return()` - (Current Value - Initial Value) / Initial Value
- ✅ `calculate_sharpe_ratio()` - Risk-adjusted returns: (portfolio_return - risk_free_rate) / volatility
- ✅ `calculate_max_drawdown()` - Largest peak-to-trough decline
- ✅ `calculate_var_95()` - 5th percentile loss (95% confidence)
- ✅ `calculate_sector_allocation()` - Portfolio breakdown by industry

**Main Entry Point:**
```python
metrics = PortfolioAnalyzer.analyze_portfolio(portfolio_df)
```

**Returns:**
```python
{
    'total_return_cumulative': float,
    'sharpe_ratio': float,
    'max_drawdown': float,
    'value_at_risk_95': float,
    'sector_allocation': Dict[str, float],
    'portfolio_value': float,
    'total_holdings': int
}
```

---

### 2. **api_service/app/v1/portfolio/upload.py**
**Purpose:** POST endpoint for CSV portfolio upload & analysis

**Workflow:**
1. ✅ Validate file format (must be .csv)
2. ✅ Read CSV into pandas DataFrame
3. ✅ Validate required columns (Ticker, Quantity, Price)
4. ✅ Call `PortfolioAnalyzer.analyze_portfolio()`
5. ✅ Store in MongoDB with session_id
6. ✅ Cache in-memory for fast retrieval
7. ✅ Return `PortfolioSummaryResponse` with metrics

**Expected CSV Columns:**
- `Ticker` - Stock symbol (required)
- `Quantity` - Number of shares (required)
- `Price` - Purchase price per share (required)
- `Current_Price` - Current price (optional, defaults to Price)
- `Sector` - Industry sector (optional, defaults to "Other")
- `Purchase_Date` - Date of purchase (optional)

**Example Request:**
```bash
curl -X POST http://localhost:8000/api/v1/portfolio/upload \
  -F "file=@portfolio.csv" \
  -H "Authorization: Bearer <token>"
```

**Example CSV:**
```csv
Ticker,Quantity,Price,Current_Price,Sector
AAPL,100,150,180,Technology
MSFT,50,300,320,Technology
JNJ,200,160,175,Healthcare
JPM,75,120,135,Financials
```

**Response:**
```json
{
    "session_id": "abc-123-def-456",
    "total_return_cumulative": 15.5,
    "sharpe_ratio": 1.23,
    "max_drawdown": -8.2,
    "value_at_risk_95": -5.1,
    "sector_allocation": {
        "Technology": 35.0,
        "Healthcare": 25.0,
        "Financials": 20.0,
        "Other": 20.0
    },
    "portfolio_value": 500000.0,
    "total_holdings": 4
}
```

---

### 3. **api_service/app/v1/portfolio/chat.py**
**Purpose:** POST endpoint for AI-powered portfolio conversation

**Key Principle:** ❌ LLM NEVER performs calculations ✅ LLM ONLY interprets pre-calculated metrics

**Architecture:**
1. ✅ Retrieve portfolio from MongoDB or in-memory cache
2. ✅ Calculate metrics using `PortfolioAnalyzer` (deterministic)
3. ✅ Build context prompt with pre-calculated metrics
4. ✅ Send to Google Gemini with system prompt
5. ✅ Gemini orchestrates insights (no math)
6. ✅ Return structured JSON response

**System Prompt Enforces:**
- No calculations allowed
- LLM only interprets and explains metrics
- Strict JSON output format
- Canvas view mapping (risk/returns/diversification/none)

**Example Request:**
```json
{
    "session_id": "abc-123-def-456",
    "user_message": "What sectors are too risky in my portfolio?"
}
```

**Example Response:**
```json
{
    "bot_response": "Your portfolio shows strong diversification with 35% in Technology. The max drawdown of -8.2% and VaR of -5.1% indicate moderate risk exposure. Consider rebalancing tech positions if you want lower volatility.",
    "active_canvas_view": "diversification",
    "canvas_data": {
        "sector_allocation": {
            "Technology": 35.0,
            "Healthcare": 25.0,
            "Financials": 20.0,
            "Other": 20.0
        },
        "total_holdings": 4
    }
}
```

**Features:**
- Chat history stored in MongoDB
- Session caching for performance
- Full error handling with proper HTTP status codes
- Logging at each step for debugging
- Async/await for non-blocking operations

---

### 4. **api_service/app/schemas/portfolio.py**
**Purpose:** Pydantic models for strict validation

**Models Defined:**

1. **PortfolioHolding** - Single stock
   - ticker, quantity, price, current_price, sector, purchase_date
   - Validates ticker is 1-10 characters, quantity > 0, prices > 0

2. **PortfolioSummaryResponse** - Upload endpoint response
   - session_id, metrics, allocations, value, holdings
   - Full example in docstring

3. **ChatRequest** - Chat endpoint input
   - session_id (required, 36 chars)
   - user_message (required, 1-1000 chars)
   - Validates non-empty message

4. **ChatResponse** - Chat endpoint output
   - bot_response (10-2000 chars)
   - active_canvas_view (risk|returns|diversification|none)
   - canvas_data (optional)

5. **CanvasDataRisk** - Risk visualization data
6. **CanvasDataReturns** - Returns visualization data
7. **CanvasDataDiversification** - Sector allocation data

8. **PortfolioUploadMetrics** - Internal metrics representation
9. **ErrorResponse** - Standard error format

**Benefits:**
- OpenAPI/Swagger auto-documentation
- Type checking at runtime
- Field validation with custom validators
- Example responses in schema
- Clear error messages

---

## 🔧 Installation Requirements

Add these to `api_service/requirements.txt`:

```txt
# Already exists, keep updated:
fastapi>=0.128.0
motor>=3.6.1
pandas>=2.0.0
numpy>=1.24.0

# NEW: Google Gemini
google-generativeai>=0.5.0
```

**Install with:**
```bash
cd api_service
pip install -r requirements.txt
```

---

## ⚙️ Environment Setup

Add to `.env` file:

```env
# Google Gemini API
GOOGLE_GEMINI_API_KEY=your-api-key-here

# MongoDB
MONGO_URL=mongodb://localhost:27017
DB_NAME=vastukart_db

# JWT
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256

# CORS
CORS_ORIGINS=http://localhost:3000
```

---

## 🚀 How to Use

### Step 1: Upload Portfolio
```bash
# Create test CSV
cat > portfolio.csv << EOF
Ticker,Quantity,Price,Current_Price,Sector
AAPL,100,150,180,Technology
MSFT,50,300,320,Technology
JNJ,200,160,175,Healthcare
EOF

# Upload
curl -X POST http://localhost:8000/api/v1/portfolio/upload \
  -F "file=@portfolio.csv" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Response includes session_id
```

### Step 2: Chat About Portfolio
```bash
curl -X POST http://localhost:8000/api/v1/portfolio/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "session_id": "abc-123-def-456",
    "user_message": "What is my portfolio risk profile?"
  }'
```

---

## 🏗️ Data Flow Architecture

```
CSV Upload
    ↓
[FastAPI Upload Endpoint]
    ↓
[Pandas Parse & Validate]
    ↓
[PortfolioAnalyzer.analyze_portfolio()]
    ├→ calculate_total_return()
    ├→ calculate_sharpe_ratio()
    ├→ calculate_max_drawdown()
    ├→ calculate_var_95()
    └→ calculate_sector_allocation()
    ↓
[Store in MongoDB + In-Memory Cache]
    ↓
[Return PortfolioSummaryResponse]

---

User Chat Request
    ↓
[FastAPI Chat Endpoint]
    ↓
[Retrieve Portfolio from Cache/MongoDB]
    ↓
[PortfolioAnalyzer.analyze_portfolio()] (AGAIN - always fresh)
    ↓
[Build Context with Metrics (NO CALCULATIONS)]
    ↓
[Call Google Gemini with Context]
    ↓
[Gemini Orchestrates Insights (NO MATH)]
    ↓
[Parse JSON Response]
    ↓
[Store Chat History in MongoDB]
    ↓
[Return ChatResponse]
```

---

## ✅ Production Checklist

- [x] Deterministic calculations (no randomness)
- [x] Comprehensive error handling (try/catch everywhere)
- [x] Input validation (Pydantic models)
- [x] Logging at critical points
- [x] Async/await for non-blocking operations
- [x] MongoDB persistence
- [x] In-memory caching for performance
- [x] LLM confined to orchestration only
- [x] JSON output forced from LLM
- [x] Canvas view mapping to visualizations
- [x] Session management
- [x] Full docstrings on all functions

---

## 🧪 Testing Locally

```bash
# Start FastAPI server
cd api_service
uvicorn main:app --reload --port 8000

# In another terminal, test upload
python -c "
import pandas as pd
import requests

# Create portfolio
df = pd.DataFrame({
    'Ticker': ['AAPL', 'MSFT', 'GOOGL'],
    'Quantity': [100, 50, 75],
    'Price': [150, 300, 120],
    'Current_Price': [180, 320, 140]
})
df.to_csv('/tmp/test_portfolio.csv', index=False)

# Upload
files = {'file': open('/tmp/test_portfolio.csv', 'rb')}
response = requests.post(
    'http://localhost:8000/api/v1/portfolio/upload',
    files=files,
    headers={'Authorization': 'Bearer test-token'}
)
print(response.json())
"
```

---

## 📝 Key Design Decisions

1. **Deterministic Calculations First** - All math before LLM sees data
2. **Pydantic Validation** - Type safety at runtime
3. **Dual Storage** - In-memory cache + MongoDB for reliability
4. **JSON Forced Output** - LLM must return structured JSON
5. **Canvas View Pattern** - Frontend knows what visualization to show
6. **Session Management** - Each upload gets unique session_id for tracking
7. **Error Handling** - Meaningful HTTP status codes (400 for bad input, 404 for missing session, 500 for server errors)
8. **Logging** - Every critical step logged for debugging

---

**Status: ✅ READY FOR PRODUCTION**

All code is:
- Fully implemented (no placeholders)
- Production-grade error handling
- Comprehensive logging
- Well-documented
- Type-safe with Pydantic
- Follows Python best practices
