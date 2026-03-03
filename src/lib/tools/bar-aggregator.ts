import type { OHLCVBar, RawBar } from '../types';

export function parseBar(raw: RawBar): OHLCVBar {
  return {
    datetime: raw.datetime,
    open: parseFloat(raw.open),
    high: parseFloat(raw.high),
    low: parseFloat(raw.low),
    close: parseFloat(raw.close),
    volume: parseInt(raw.volume || '0') || 0,
  };
}

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
