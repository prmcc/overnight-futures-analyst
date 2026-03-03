import type { BollingerBands } from '../../types';

export function calculateBollingerBands(closes: number[], period = 20, stdDevMultiplier = 2): BollingerBands | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return {
    upper: sma + (stdDevMultiplier * sd),
    middle: sma,
    lower: sma - (stdDevMultiplier * sd),
  };
}
