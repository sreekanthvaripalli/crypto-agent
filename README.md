# 🤖 Crypto Market Analysis Agent

A professional-grade crypto market analysis agent that checks the top 50 coins by market cap and suggests which ones to **buy**, **watchlist**, or **avoid** — using advanced technical analysis, machine learning sentiment analysis, and sophisticated risk management.

---

## 🚀 What's New - Enhanced Features

### 📈 Advanced Technical Indicators
- **Ichimoku Cloud** - Multi-timeframe analysis with future support/resistance levels
- **ATR (Average True Range)** - Volatility measurement for position sizing and stop-loss
- **ADX (Average Directional Index)** - Trend strength validation (filters ranging markets)
- **Williams %R** - Momentum oscillator for overbought/oversold detection
- **CCI (Commodity Channel Index)** - Price level relative to statistical average
- **Stochastic Oscillator** - %K, %D, and signal line for momentum analysis

### ⚠️ Advanced Risk Management
- **Kelly Criterion Position Sizing** - Mathematical approach to optimal position sizing
- **Value at Risk (VaR)** - 95% confidence level risk measurement
- **Portfolio Diversification Analysis** - Correlation matrix and diversification scoring
- **Dynamic Stop-Loss** - ATR-based with confidence score adjustments
- **Risk-Adjusted Returns** - Sharpe ratio and portfolio volatility analysis

### 🤖 Machine Learning Enhanced Sentiment Analysis
- **TF-IDF Vectorization** - Term frequency-inverse document frequency for keyword importance
- **Ensemble Methods** - Three complementary approaches for higher accuracy
- **Advanced Keyword Coverage** - 50+ positive and 60+ negative keywords including geopolitical risks
- **Context Pattern Recognition** - Regex-based phrase detection for strong signals
- **Multi-factor Confidence Scoring** - Weighted combination of all sentiment methods

### 📊 Portfolio Analysis and Management
- **Portfolio-Level Risk Assessment** - Overall risk scoring and diversification analysis
- **Risk Metrics Calculation** - Volatility, max drawdown, Sharpe ratio, VaR
- **Rebalancing Recommendations** - Automated suggestions based on risk metrics
- **Correlation Analysis** - Cross-coin correlation matrix for diversification

### 📰 Enhanced News Validation
- **ML-Enhanced Sentiment** - Uses the new ML sentiment analyzer
- **Alignment Scoring** - Strong/Moderate/Weak/Conflicting signal alignment
- **Confidence Adjustment** - Dynamic confidence based on news alignment
- **Comprehensive Coverage** - Includes geopolitical risks and regulatory clarity

---

## 📊 What It Does

- Fetches **top 50 coins** from CoinGecko (free API, no key needed)
- Pulls **30-day OHLC data** for each coin (4-hourly candles — enough history for long-period indicators like Ichimoku and smoothed ADX)
- Calculates **advanced technical indicators**:
  - **RSI** (Relative Strength Index — overbought/oversold)
  - **MACD** (momentum & crossover detection)
  - **EMA 7 / EMA 14** (short-term trend direction)
  - **Bollinger Bands** (volatility & breakout zones)
  - **Ichimoku Cloud** (multi-timeframe analysis)
  - **ATR, ADX** (volatility and trend strength)
  - **Williams %R, CCI, Stochastic** (advanced momentum indicators)
  - **Volume Spike** detection
  - **7-day price change %**
- **Advanced Risk Analysis**:
  - Kelly Criterion position sizing
  - Value at Risk (VaR) calculation
  - Portfolio diversification scoring
  - Dynamic stop-loss optimization
- **ML-Enhanced Sentiment Analysis**:
  - TF-IDF vectorization
  - Ensemble methods (keyword, TF-IDF, context)
  - Comprehensive geopolitical risk coverage
  - Multi-factor confidence scoring
- **Portfolio Management**:
  - Portfolio-level risk assessment
  - Risk metrics calculation
  - Rebalancing recommendations
  - Correlation-based diversification
- Scores each coin from **-100 (strongly bearish) to +100 (strongly bullish)**
- Classifies into 3 buckets:
  - 🟢 **BUY** — Oversold, bullish signals, positive momentum
  - 🟡 **WATCHLIST** — Neutral, consolidating, potential setups
  - 🔴 **AVOID** — Overbought, bearish signals, downtrend
- **Enhanced News Validation**:
  - ML-powered sentiment analysis
  - Alignment scoring with technical analysis
  - Dynamic confidence adjustment
  - Comprehensive news source integration
- Outputs a **color-coded terminal report** + **JSON export** + **Portfolio Analysis**
- Caches data in a local **SQLite database** to avoid repeated API calls

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v20.19+ — required for chalk v5 ESM compatibility)
- npm

### Installation
```bash
npm install
```

### Run the Agent
```bash
# Run analysis (uses cached data if available within 4h)
npm run dev

# Force fresh data fetch from CoinGecko
npm run dev -- --refresh

# Analyze top 100 coins instead of 50
npm run dev -- --limit=100

# Skip JSON export
npm run dev -- --no-json

# Combine options
npm run dev -- --refresh --limit=100
```

### Configuration (Environment Variables)
| Variable | Default | Description |
|---|---|---|
| `COINGECKO_API_KEY` | _(none)_ | CoinGecko demo/pro API key — raises rate limits (recommended) |
| `COINGECKO_API_TIER` | `demo` | Key type: `demo` (`x-cg-demo-api-key`) or `pro` (`x-cg-pro-api-key`) |
| `FETCH_DELAY_MS` | `2000` | Delay between CoinGecko calls (rate limiting) |
| `CRYPTO_AGENT_DATA_DIR` | `./data` | Where the market cache JSON is stored |
| `CRON_SCHEDULE` | `0 8 * * *` | Scheduler cron expression |

# Force fresh data fetch from CoinGecko
npm run dev -- --refresh

# Analyze top 100 coins instead of 50
npm run dev -- --limit=100

# Skip JSON export
npm run dev -- --no-json

# Combine options
npm run dev -- --refresh --limit=100
```

### Run with Daily Scheduler
```bash
# Runs at 8:00 AM every day by default (and immediately on start)
npm run schedule

# Custom schedule (every 6 hours)
CRON_SCHEDULE="0 */6 * * *" npm run schedule

# Every hour
CRON_SCHEDULE="0 * * * *" npm run schedule
```

---

## 🛠️ Development

```bash
npm test          # Build + run the test suite (Node built-in test runner)
npm run lint      # ESLint (flat config)
npm run build     # Compile to dist/
```

Tests cover the indicators, advanced indicators (ADX smoothing, Stochastic %D, Ichimoku), risk math (Sharpe/VaR/beta/Kelly/drawdown), the sentiment keyword matching, the classifier, and the cache layer — including a regression test for the empty-OHLC crash. CI (GitHub Actions) runs lint + tests on every push/PR.

---

## 📁 Project Structure

```
crypto-agent/
├── src/
│   ├── types.ts                  # TypeScript interfaces
│   ├── fetcher/
│   │   ├── coingecko.ts          # CoinGecko API client (API key, retry/backoff)
│   │   └── news.ts               # Trending coins + project status updates
│   ├── database/
│   │   └── db.ts                 # JSON-file caching layer (retention + entry cap)
│   ├── analyzer/
│   │   ├── indicators.ts         # RSI, MACD, EMA, Bollinger Bands
│   │   ├── advanced-indicators.ts # Ichimoku Cloud, ATR, ADX, Williams %R, CCI, Stochastic
│   │   ├── risk-management.ts    # Kelly Criterion, VaR, Sharpe, beta, portfolio analysis
│   │   ├── ml-sentiment.ts       # TF-IDF + ensemble sentiment scoring
│   │   ├── news-validator.ts     # Validate technical analysis with news sentiment
│   │   ├── sentiment-keywords.ts # Shared keyword lists + word-boundary matching
│   │   └── classifier.ts         # Scoring & classification engine
│   ├── output/
│   │   └── reporter.ts           # Color terminal output + JSON export (incl. portfolio)
│   ├── __tests__/                # Node built-in test runner suite
│   ├── index.ts                  # Main entry point
│   └── scheduler.ts              # Cron scheduler (works from source and dist)
├── data/                         # market-cache.json (auto-created, gitignored)
├── reports/                      # report-*.json (auto-created, gitignored)
└── package.json
```

---

## 📈 Scoring Logic

| Signal | Bullish (+) | Bearish (-) |
|---|---|---|
| RSI | ≤ 35 = +20 pts | ≥ 65 = -20 pts |
| MACD Crossover | Bullish = +25 pts | Bearish = -25 pts |
| EMA Trend | EMA7 > EMA14 = +15 pts | EMA7 < EMA14 = -15 pts |
| Bollinger Bands | Below lower band = +15 pts | Above upper band = -15 pts |
| 7d Price Change | ≤ -20% = +10 pts (dip buy) | ≥ +20% = -10 pts (overextended) |
| Volume Spike | Spike + price up = +10 pts | Spike + price down = -10 pts |

**Classification thresholds:**
- 🟢 **BUY**: Score ≥ +25
- 🟡 **WATCHLIST**: Score between -25 and +25
- 🔴 **AVOID**: Score ≤ -25

---

## ⚠️ Disclaimer

This tool is for **educational and informational purposes only**. It does NOT constitute financial advice. Crypto markets are highly volatile. Always do your own research before making any investment decisions.
