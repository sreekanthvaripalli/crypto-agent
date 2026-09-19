import { OHLCCandle } from '../types';
import { EMA } from 'technicalindicators';

export type RegimeType = 'risk-on' | 'neutral' | 'risk-off';

export interface RegimeAssessment {
  regime: RegimeType;
  /** % distance of BTC close from its EMA20 (negative = below trend) */
  btcTrendPct: number;
  demoteBuys: boolean;
}

/**
 * Assess the BTC market regime — the gate that decides whether BUY signals
 * are trustworthy. ~80% of altcoins follow BTC, so a BTC downtrend invalidates
 * most BUY picks regardless of their individual setups.
 *
 * Rules (EMA20/EMA50 on BTC closes):
 *   price < EMA20 AND EMA20 < EMA50  →  risk-off (BUY signals demoted)
 *   price > EMA20 AND EMA20 > EMA50  →  risk-on
 *   otherwise                        →  neutral
 */
export function assessMarketRegime(
  btcCandles: OHLCCandle[]
): RegimeAssessment {
  const closes = btcCandles.map((c) => c.close);
  const ema20 = EMA.calculate({ values: closes, period: 20 });
  const ema50 = EMA.calculate({ values: closes, period: 50 });

  if (ema20.length === 0 || ema50.length === 0) {
    return { regime: 'neutral', btcTrendPct: 0, demoteBuys: false };
  }

  const price = closes[closes.length - 1];
  const slow = ema20[ema20.length - 1];
  const long = ema50[ema50.length - 1];
  const btcTrendPct = slow === 0 ? 0 : ((price - slow) / slow) * 100;

  if (price < slow && slow < long) {
    return { regime: 'risk-off', btcTrendPct, demoteBuys: true };
  }
  if (price > slow && slow > long) {
    return { regime: 'risk-on', btcTrendPct, demoteBuys: false };
  }
  return { regime: 'neutral', btcTrendPct, demoteBuys: false };
}