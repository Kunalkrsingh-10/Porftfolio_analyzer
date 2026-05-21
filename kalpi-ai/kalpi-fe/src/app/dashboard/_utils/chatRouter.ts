import type { TabId } from "../_types";

interface RouteEntry {
  keywords: string[];
  tab: TabId;
  response: string;
}

const ROUTES: RouteEntry[] = [
  {
    keywords: ["perform", "return", "cagr", "gain", "profit", "earning", "growth", "p&l"],
    tab: "performance",
    response:
      "Your portfolio has delivered a total return of +21.4% with a CAGR of 14.2% over the past year. ICICIBANK (+20.4%), RELIANCE (+18.0%), and SUNPHARMA (+17.9%) are your standout performers. The annualized volatility of 16.5% gives you a Sharpe Ratio of 1.24 — solid risk-adjusted returns. Switching to the Performance view.",
  },
  {
    keywords: ["risk", "drawdown", "var", "volatil", "sharpe", "loss", "danger", "safe"],
    tab: "risk",
    response:
      "Your portfolio carries a moderate risk score of 34/100. The worst historical drawdown recorded is −12.8%, and the 1-day Value at Risk (95% confidence) is −2.1% of portfolio value. With a Sharpe of 1.24 you are being well compensated per unit of risk. ASIANPAINT is your only losing position at −7.8%. Opening the Risk view.",
  },
  {
    keywords: ["sector", "diversif", "allocat", "concentrat", "holding", "spread", "weight"],
    tab: "diversification",
    response:
      "Your portfolio spans 7 sectors. Finance leads at 35.2% (HDFCBANK, ICICIBANK, KOTAKBANK, BAJFINANCE), followed by Consumer at 23.0% and Technology at 20.3%. The HHI concentration score is 0.134 — well diversified. Consider reducing Finance exposure slightly to improve resilience in credit-event scenarios. Showing Diversification view.",
  },
  {
    keywords: ["benchmark", "nifty", "sensex", "index", "compar", "beat", "alpha", "beta", "market"],
    tab: "benchmark",
    response:
      "Your portfolio has outperformed the Nifty 50 by +4.6% (alpha) over the past 12 months — 21.4% vs 16.8%. With a beta of 0.84 it moves about 16% less than the broader market on down days, and a correlation of 0.91 means it tracks the index closely while still generating excess returns. Opening Benchmark view.",
  },
  {
    keywords: ["stress", "crash", "crisis", "scenario", "downturn", "covid", "recession", "shock", "2008"],
    tab: "stress",
    response:
      "Under a COVID-2020 style crash your portfolio would face an estimated −28.4% impact, recovering in ~45 days given your quality bias. A 2008 Global Crisis scenario is your worst case at −38.2% — your 35% Finance exposure is the key vulnerability. Adding 5% Gold ETF could reduce this impact by ~3%. Switching to Stress Testing view.",
  },
  {
    keywords: ["health", "score", "overall", "status", "recommend", "suggest", "improve", "overall"],
    tab: "health",
    response:
      "Your overall portfolio health score is 74/100 — Good. Liquidity scores highest at 88 (all large-cap holdings). Returns Quality is strong at 82. Risk Management scores 68, driven by Technology concentration and the ASIANPAINT loss position. Top action: Trim Technology to below 15% and add 2 FMCG names for defensive ballast. Showing Health dashboard.",
  },
];

const FALLBACK_RESPONSE =
  "I can analyse your portfolio across six dimensions. Try asking about: Performance (returns, CAGR), Risk (drawdown, VaR, Sharpe), Diversification (sector allocation), Benchmark (vs Nifty 50), Stress Testing (crash scenarios), or Portfolio Health (recommendations). What would you like to explore?";

export interface ChatRouterResult {
  response: string;
  triggeredTab?: TabId;
}

export function routeChat(userMessage: string): ChatRouterResult {
  const lower = userMessage.toLowerCase();

  for (const route of ROUTES) {
    if (route.keywords.some((kw) => lower.includes(kw))) {
      return { response: route.response, triggeredTab: route.tab };
    }
  }

  return { response: FALLBACK_RESPONSE };
}
