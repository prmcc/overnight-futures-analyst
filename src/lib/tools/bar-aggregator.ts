import type { OHLCVBar } from '../types';

export function aggregateBars(bars: OHLCVBar[], factor: number): OHLCVBar[] {
  const aggregated: OHLCVBar[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (chunk.length === factor) {
      aggregated.push({
        datetime: chunk[0].datetime,
        open: chunk[0].open,
        high: Math.max(...chunk.map(b => b.high)),
        low: Math.min(...chunk.map(b => b.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((sum, b) => sum + b.volume, 0),
      });
    }
  }
  return aggregated;
}
