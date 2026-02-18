# 🤖 Crypto Market Analysis Agent

A local crypto market analysis agent that checks the top 50 coins by market cap and suggests which ones to **buy**, **watchlist**, or **avoid** — based on the last 7 days of price performance using pure technical analysis.

---

## 📊 What It Does

- Fetches **top 50 coins** from CoinGecko (free API, no key needed)
- Pulls **7-day OHLC data** for each coin
- Calculates technical indicators:
  - **RSI** (Relative Strength Index — overbought/oversold)
  - **MACD** (momentum & crossover detection)
  - **EMA 7 / EMA 14** (short-term trend direction)
  - **Bollinger Bands** (volatility & breakout zones)
  - **Volume Spike** detection
  - **7-day price change %**
- Scores each coin from **-100 (strongly bearish) to +100 (strongly bullish)**
- Classifies into 3 buckets:
  - 🟢 **BUY** — Oversold, bullish signals, positive momentum
  - 🟡 **WATCHLIST** — Neutral, consolidating, potential setups
  - 🔴 **AVOID** — Overbought, bearish signals, downtrend
- Outputs a **color-coded terminal report** + **JSON export**
- Caches data in a local **SQLite database** to avoid repeated API calls

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Run the Agent
```bash
# Run analysis (uses cached data if available within 24h)
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

## 📁 Project Structure

```
crypto-agent/
├── src/
│   ├── types.ts                  # TypeScript interfaces
│   ├── fetcher/
│   │   └── coingecko.ts          # CoinGecko API client
│   ├── database/
│   │   └── db.ts                 # SQLite caching layer
│   ├── analyzer/
│   │   ├── indicators.ts         # RSI, MACD, EMA, Bollinger Bands
│   │   └── classifier.ts        # Scoring & classification engine
│   ├── output/
│   │   └── reporter.ts          # Color terminal output + JSON export
│   ├── index.ts                  # Main entry point
│   └── scheduler.ts             # Daily cron scheduler
├── data/
│   └── crypto.db                 # SQLite database (auto-created)
├── reports/
│   └── report-*.json            # JSON reports (auto-created)
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
