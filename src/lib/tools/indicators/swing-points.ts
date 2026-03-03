import type { OHLCVBar } from '../../types';
import type { SwingPoint } from '../../types/analysis';

export function findSwingPoints(bars: OHLCVBar[]): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    const next = bars[i + 1];

    if (curr.high > prev.high && curr.high > next.high) {
      swingHighs.push({ price: curr.high, time: curr.datetime, barIndex: i });
    }
    if (curr.low < prev.low && curr.low < next.low) {
      swingLows.push({ price: curr.low, time: curr.datetime, barIndex: i });
    }
  }

  return { swingHighs, swingLows };
}
