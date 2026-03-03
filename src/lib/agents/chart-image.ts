import { fetchChartImage } from '../tools/chart-img';
import { loadInstruments } from '../config/loader';
import type { ChartImage } from '../types';

export async function collectChartImages(): Promise<ChartImage[]> {
  const instruments = loadInstruments().filter(i => i.enabled);

  // Fetch chart images in parallel (chart-img doesn't have strict rate limits)
  const results = await Promise.allSettled(
    instruments.map(inst => fetchChartImage(inst.chartSymbol, inst.id))
  );

  const images: ChartImage[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value.base64) {
      images.push(result.value);
      console.log(`[Chart Image] ${instruments[i].name}: captured`);
    } else {
      console.warn(`[Chart Image] ${instruments[i].name}: failed or empty`);
      images.push({
        instrumentId: instruments[i].id,
        base64: '',
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return images;
}
