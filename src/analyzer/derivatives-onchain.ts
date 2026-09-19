import axios from 'axios';
import { DerivativesData, OnChainMetrics } from '../types';

const BINANCE_FUTURES_URL = 'https://fapi.binance.com/fapi/v1';
const MEMPOOL_SPACE_URL = 'https://mempool.space/api';

const client = axios.create({
  timeout: 8000,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'crypto-agent/1.0',
  },
});

/**
 * Fetch Derivatives Data (Funding Rate & Open Interest) from Binance Futures
 */
export async function fetchDerivativesData(symbol: string): Promise<DerivativesData | undefined> {
  const pair = `${symbol.toUpperCase()}USDT`;
  try {
    const [premiumRes, oiRes] = await Promise.all([
      client.get(`${BINANCE_FUTURES_URL}/premiumIndex`, { params: { symbol: pair } }),
      client.get(`${BINANCE_FUTURES_URL}/openInterest`, { params: { symbol: pair } }),
    ]);

    const fundingRate = parseFloat(premiumRes.data.lastFundingRate || '0');
    const openInterest = parseFloat(oiRes.data.openInterest || '0');
    const nextFundingTime = premiumRes.data.nextFundingTime || Date.now();

    // Classification based on funding rate thresholds
    let sentiment: DerivativesData['sentiment'] = 'neutral';
    if (fundingRate > 0.0003) sentiment = 'overheated'; // high long leverage
    else if (fundingRate > 0) sentiment = 'bullish';
    else if (fundingRate < -0.0001) sentiment = 'bearish';

    return {
      symbol: pair,
      fundingRate,
      openInterest,
      nextFundingTime,
      sentiment,
    };
  } catch {
    return undefined; // Derivatives data optional if pair not on Binance Futures
  }
}

/**
 * Fetch Bitcoin Network On-Chain Metrics from Mempool.space
 */
export async function fetchOnChainMetrics(): Promise<OnChainMetrics | undefined> {
  try {
    const [mempoolRes, feesRes] = await Promise.all([
      client.get(`${MEMPOOL_SPACE_URL}/mempool`),
      client.get(`${MEMPOOL_SPACE_URL}/v1/fees/recommended`),
    ]);

    const unconfirmedTransactions = mempoolRes.data.count || 0;
    const fastestFee = feesRes.data.fastestFee || 0;
    const halfHourFee = feesRes.data.halfHourFee || 0;

    let networkCongestion: OnChainMetrics['networkCongestion'] = 'low';
    if (unconfirmedTransactions > 100000) networkCongestion = 'high';
    else if (unconfirmedTransactions > 40000) networkCongestion = 'medium';

    return {
      unconfirmedTransactions,
      fastestFeeSatVB: fastestFee,
      halfHourFeeSatVB: halfHourFee,
      networkCongestion,
    };
  } catch {
    return undefined;
  }
}

