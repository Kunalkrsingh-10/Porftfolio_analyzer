// ─── Portfolio Summary ─────────────────────────────────────────────────────
export const PORTFOLIO_SUMMARY = {
  name: "Akash's NSE Portfolio",
  value: 1_845_200,
  costBasis: 1_520_000,
  totalPnl: 325_200,
  totalReturn: 21.4,
  annualizedReturn: 14.2,
  cagr: 14.2,
  volatility: 16.5,
  sharpe: 1.24,
  maxDrawdown: -12.8,
  var95: -2.1,
  winRate: 73.3,
  winners: 11,
  losers: 3,
  flat: 1,
  totalHoldings: 15,
  riskScore: { score: 34, label: "Moderate", color: "#f59e0b" },
};

// ─── Holdings ──────────────────────────────────────────────────────────────
export const HOLDINGS = [
  { ticker: "RELIANCE", sector: "Energy", qty: 50, buy: 2450, curr: 2890, weight: 12.0 },
  { ticker: "TCS", sector: "Technology", qty: 30, buy: 3800, curr: 4120, weight: 10.2 },
  { ticker: "HDFCBANK", sector: "Finance", qty: 80, buy: 1620, curr: 1750, weight: 10.7 },
  { ticker: "INFY", sector: "Technology", qty: 40, buy: 1550, curr: 1780, weight: 7.4 },
  { ticker: "ICICIBANK", sector: "Finance", qty: 100, buy: 980, curr: 1180, weight: 9.1 },
  { ticker: "BHARTIARTL", sector: "Telecom", qty: 60, buy: 1350, curr: 1520, weight: 7.0 },
  { ticker: "WIPRO", sector: "Technology", qty: 70, buy: 450, curr: 490, weight: 2.7 },
  { ticker: "NESTLEIND", sector: "Consumer", qty: 8, buy: 25000, curr: 26500, weight: 16.3 },
  { ticker: "SUNPHARMA", sector: "Healthcare", qty: 45, buy: 1400, curr: 1650, weight: 5.7 },
  { ticker: "ASIANPAINT", sector: "Consumer", qty: 25, buy: 3200, curr: 2950, weight: 5.7 },
  { ticker: "KOTAKBANK", sector: "Finance", qty: 55, buy: 1800, curr: 1950, weight: 8.2 },
  { ticker: "TITAN", sector: "Consumer", qty: 35, buy: 3600, curr: 4100, weight: 11.0 },
  { ticker: "DRREDDY", sector: "Healthcare", qty: 15, buy: 5400, curr: 6200, weight: 7.1 },
  { ticker: "M&M", sector: "Auto", qty: 45, buy: 1850, curr: 2080, weight: 7.2 },
  { ticker: "BAJFINANCE", sector: "Finance", qty: 12, buy: 7200, curr: 7800, weight: 7.2 },
].map((h) => ({
  ...h,
  currentValue: h.qty * h.curr,
  costValue: h.qty * h.buy,
  pnl: h.qty * (h.curr - h.buy),
  returnPct: ((h.curr - h.buy) / h.buy) * 100,
}));

// ─── Performance: 13-month portfolio value series ─────────────────────────
export const PORTFOLIO_TIMESERIES = [
  { month: "May '24", value: 1_520_000 },
  { month: "Jun '24", value: 1_568_640 },
  { month: "Jul '24", value: 1_607_976 },
  { month: "Aug '24", value: 1_648_348 },
  { month: "Sep '24", value: 1_690_857 },
  { month: "Oct '24", value: 1_639_730 },  // dip
  { month: "Nov '24", value: 1_672_724 },
  { month: "Dec '24", value: 1_724_906 },
  { month: "Jan '25", value: 1_776_453 },
  { month: "Feb '25", value: 1_827_706 },
  { month: "Mar '25", value: 1_772_875 },  // dip
  { month: "Apr '25", value: 1_808_532 },
  { month: "May '25", value: 1_845_200 },
];

// ─── Sector Allocation ─────────────────────────────────────────────────────
export const SECTOR_ALLOCATION = [
  { name: "Technology", value: 20.3, color: "#0ea5e9" },
  { name: "Finance", value: 24.5, color: "#6366f1" },
  { name: "Consumer", value: 23.0, color: "#10b981" },
  { name: "Energy", value: 12.0, color: "#f59e0b" },
  { name: "Healthcare", value: 12.8, color: "#a78bfa" },
  { name: "Telecom", value: 7.0, color: "#f43f5e" },
  { name: "Auto", value: 7.2, color: "#2dd4bf" },
  { name: "Others", value: -7.8, color: "#94a3b8" },  // net against duplicates
];

// cleaned: merge duplicates
export const SECTORS = [
  { name: "Finance", value: 35.2, color: "#6366f1" },
  { name: "Technology", value: 20.3, color: "#0ea5e9" },
  { name: "Consumer", value: 23.0, color: "#10b981" },
  { name: "Energy", value: 12.0, color: "#f59e0b" },
  { name: "Healthcare", value: 12.8, color: "#a78bfa" },
  { name: "Telecom", value: 7.0, color: "#f43f5e" },
  { name: "Auto", value: 7.2, color: "#2dd4bf" },
];

// ─── Risk: radar dimensions (0-100, higher = safer) ───────────────────────
export const RISK_RADAR = [
  { dimension: "Sharpe Adj.", score: 72 },
  { dimension: "Drawdown Res.", score: 65 },
  { dimension: "VaR Protection", score: 78 },
  { dimension: "Diversification", score: 74 },
  { dimension: "Momentum", score: 68 },
];

// ─── Benchmark: indexed to 100 at May '24 ─────────────────────────────────
export const BENCHMARK_TIMESERIES = [
  { month: "May '24", portfolio: 100.0, nifty50: 100.0, sensex: 100.0 },
  { month: "Jun '24", portfolio: 103.2, nifty50: 101.8, sensex: 101.5 },
  { month: "Jul '24", portfolio: 105.8, nifty50: 103.2, sensex: 102.8 },
  { month: "Aug '24", portfolio: 108.4, nifty50: 105.1, sensex: 104.5 },
  { month: "Sep '24", portfolio: 111.2, nifty50: 107.8, sensex: 107.1 },
  { month: "Oct '24", portfolio: 107.9, nifty50: 104.2, sensex: 103.8 },
  { month: "Nov '24", portfolio: 110.0, nifty50: 106.1, sensex: 105.6 },
  { month: "Dec '24", portfolio: 113.5, nifty50: 109.3, sensex: 108.7 },
  { month: "Jan '25", portfolio: 116.9, nifty50: 112.4, sensex: 111.6 },
  { month: "Feb '25", portfolio: 120.2, nifty50: 115.6, sensex: 114.8 },
  { month: "Mar '25", portfolio: 116.6, nifty50: 112.0, sensex: 111.4 },
  { month: "Apr '25", portfolio: 118.9, nifty50: 114.3, sensex: 113.6 },
  { month: "May '25", portfolio: 121.4, nifty50: 116.8, sensex: 115.9 },
];

export const BENCHMARK_STATS = {
  alpha: 4.6,
  beta: 0.84,
  correlation: 0.91,
  trackingError: 3.2,
  informationRatio: 1.44,
  portfolioReturn: 21.4,
  niftyReturn: 16.8,
  outperformance: 4.6,
};

// ─── Stress Test Scenarios ─────────────────────────────────────────────────
export const STRESS_SCENARIOS = [
  {
    id: "covid",
    name: "COVID-19 Crash",
    period: "Feb – Mar 2020",
    impact: -28.4,
    niftyImpact: -38.0,
    recoveryDays: 45,
    severity: "severe" as const,
    description: "Global pandemic-induced market selloff. Finance and Energy sectors bear the brunt.",
  },
  {
    id: "gfc",
    name: "2008 Global Crisis",
    period: "Sep 2008 – Mar 2009",
    impact: -38.2,
    niftyImpact: -55.0,
    recoveryDays: 180,
    severity: "extreme" as const,
    description: "Credit crisis. Your Finance holdings (35.2%) make this the most impactful scenario.",
  },
  {
    id: "taper",
    name: "2013 Taper Tantrum",
    period: "May – Aug 2013",
    impact: -14.6,
    niftyImpact: -17.2,
    recoveryDays: 90,
    severity: "moderate" as const,
    description: "US Fed tapering surprise. INR depreciation hits Consumer and Telecom holdings.",
  },
  {
    id: "inflation",
    name: "Inflation Shock (+4%)",
    period: "Hypothetical",
    impact: -9.2,
    niftyImpact: -11.5,
    recoveryDays: 60,
    severity: "mild" as const,
    description: "Sustained inflation spike. Healthcare and Consumer Staples provide natural hedges.",
  },
  {
    id: "inr",
    name: "INR Depreciation 20%",
    period: "Hypothetical",
    impact: -6.8,
    niftyImpact: -8.0,
    recoveryDays: 45,
    severity: "mild" as const,
    description: "Currency shock. IT exporters (TCS, INFY, WIPRO) benefit; Oil importers hurt.",
  },
];

// ─── Health Scores ─────────────────────────────────────────────────────────
export const HEALTH = {
  overall: 74,
  subsystems: [
    { name: "Returns Quality", score: 82, color: "#10b981", icon: "trending-up" },
    { name: "Risk Management", score: 68, color: "#f59e0b", icon: "shield" },
    { name: "Diversification", score: 71, color: "#0ea5e9", icon: "pie-chart" },
    { name: "Liquidity", score: 88, color: "#2dd4bf", icon: "droplet" },
    { name: "Momentum", score: 65, color: "#818cf8", icon: "zap" },
  ],
  recommendations: [
    {
      priority: "high" as const,
      text: "Reduce Technology concentration from 20.3% → 15% by partially trimming TCS or INFY.",
    },
    {
      priority: "medium" as const,
      text: "Add 2–3 FMCG stocks (HUL, MARICO) to improve drawdown resilience in stress scenarios.",
    },
    {
      priority: "medium" as const,
      text: "ASIANPAINT is your only loss position (–7.8%). Review whether the thesis still holds.",
    },
    {
      priority: "low" as const,
      text: "Consider a small allocation to Gold ETF (5%) for portfolio ballast during INR shocks.",
    },
  ],
};

// ─── Chat Suggested Questions ──────────────────────────────────────────────
export const SUGGESTED_QUESTIONS = [
  "How is my portfolio performing?",
  "What are my biggest risk factors?",
  "Is my portfolio well diversified?",
  "How do I compare to Nifty 50?",
  "Run a COVID crash stress test",
  "Show me my portfolio health score",
];
