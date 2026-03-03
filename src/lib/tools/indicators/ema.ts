import type { EMASlope } from '../../types';

export function calculateEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  return ema;
}

export function calculateEMAArray(closes: number[], period: number): (number | null)[] {
  if (closes.length < period) return [];
  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const emas: (number | null)[] = new Array(period - 1).fill(null);
  emas.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
    emas.push(ema);
  }
  return emas;
}

export function calculateEMASlope(closes: number[], period: number, lookback = 5): EMASlope {
  if (closes.length < period + lookback) return 'FLAT';
  const emas = calculateEMAArray(closes, period);
  const recent = emas.slice(-lookback).filter((v): v is number => v !== null);
  if (recent.length < 2) return 'FLAT';
  const diff = recent[recent.length - 1] - recent[0];
  const avgPrice = recent.reduce((a, b) => a + b, 0) / recent.length;
  const pctChange = (diff / avgPrice) * 100;
  if (pctChange > 0.02) return 'RISING';
  if (pctChange < -0.02) return 'FALLING';
  return 'FLAT';
}
