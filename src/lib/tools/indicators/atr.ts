import type { OHLCVBar } from '../../types';

export interface ConsolidationResult {
  isConsolidating: boolean;
  atrRatio: number;
  atr: number;
  avgAtr: number;
}

export function calculateTrueRanges(bars: OHLCVBar[]): number[] {
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  return trueRanges;
}

export function calculateATR(bars: OHLCVBar[], period = 14): number | null {
  const trueRanges = calculateTrueRanges(bars);
  if (trueRanges.length < period) return null;
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function detectConsolidation(bars: OHLCVBar[], lookback = 10, threshold = 0.6): ConsolidationResult {
  if (bars.length < lookback + 1) {
    return { isConsolidating: false, atrRatio: 1, atr: 0, avgAtr: 0 };
  }
  const trueRanges = calculateTrueRanges(bars);
  const avgTR = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  const recentTRs = trueRanges.slice(-lookback);
  const recentAvgTR = recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;
  const ratio = avgTR > 0 ? recentAvgTR / avgTR : 1;
  return {
    isConsolidating: ratio < threshold,
    atrRatio: parseFloat(ratio.toFixed(4)),
    atr: recentAvgTR,
    avgAtr: avgTR,
  };
}
