import type { ChartImage } from '../types';

export async function fetchChartImage(
  chartSymbol: string,
  instrumentId: string,
  interval = '15m',
  studies = 'MACD'
): Promise<ChartImage> {
  const apiKey = process.env.CHARTIMG_API_KEY;
  if (!apiKey) throw new Error('CHARTIMG_API_KEY is not set');

  const params = new URLSearchParams({
    symbol: chartSymbol,
    interval,
    studies,
    width: '800',
    height: '500',
    theme: 'dark',
  });

  const response = await fetch(
    `https://api.chart-img.com/v1/tradingview/advanced-chart?${params}`,
    {
      headers: { 'x-api-key': apiKey },
    }
  );

  if (!response.ok) {
    console.warn(`Chart image fetch failed for ${chartSymbol}: ${response.status}`);
    return { instrumentId, base64: '', fetchedAt: new Date().toISOString() };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const base64 = buffer.toString('base64');

  return {
    instrumentId,
    base64,
    fetchedAt: new Date().toISOString(),
  };
}
