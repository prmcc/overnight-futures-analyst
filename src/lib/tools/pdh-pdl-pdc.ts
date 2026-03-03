import type { OHLCVBar } from '../types';
import type { PreviousDayLevels } from '../types/analysis';

export function extractPreviousDayLevels(dailyBars: OHLCVBar[], currentPrice: number, decimals = 2): PreviousDayLevels | null {
  // dailyBars should come from TwelveData (newest first), so values[0] = today partial, values[1] = prev day
  if (dailyBars.length < 2) return null;

  const prevDay = dailyBars[1]; // index 1 = previous completed day
  const pdh = prevDay.high;
  const pdl = prevDay.low;
  const pdc = prevDay.close;

  const gap = currentPrice - pdc;
  const gapPercent = pdc !== 0 ? (gap / pdc) * 100 : 0;

  return {
    high: parseFloat(pdh.toFixed(decimals)),
    low: parseFloat(pdl.toFixed(decimals)),
    close: parseFloat(pdc.toFixed(decimals)),
    gapFromPDC: `${gap.toFixed(decimals)} (${gapPercent.toFixed(3)}%)`,
    gapPercent: parseFloat(gapPercent.toFixed(4)),
  };
}
