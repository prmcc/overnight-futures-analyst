import type { OHLCVBar } from '../types';

interface YahooChartResult {
  chart: {
    result: [{
      meta: { symbol: string; regularMarketPrice: number };
      timestamp: number[];
      indicators: {
        quote: [{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }];
      };
    }] | null;
    error: { code: string; description: string } | null;
  };
}

/**
 * Map our interval names to Yahoo Finance interval params.
 */
function mapInterval(interval: string): { interval: string; range: string } {
  switch (interval) {
    case '5min':  return { interval: '5m', range: '5d' };
    case '1h':    return { interval: '1h', range: '5d' };
    case '1day':  return { interval: '1d', range: '1mo' };
    default:      return { interval: '5m', range: '5d' };
  }
}

/**
 * Fetch OHLCV data from Yahoo Finance v8 chart API.
 */
export async function fetchTimeSeries(
  symbol: string,
  interval: string,
  outputsize: number
): Promise<OHLCVBar[]> {
  const { interval: yInterval, range } = mapInterval(interval);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${yInterval}&range=${range}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FuturesAnalyst/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as YahooChartResult;

  if (data.chart.error) {
    throw new Error(`Yahoo Finance error: ${data.chart.error.description}`);
  }

  const result = data.chart.result?.[0];
  if (!result || !result.timestamp) {
    throw new Error(`Yahoo Finance: no data returned for ${symbol}`);
  }

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const bars: OHLCVBar[] = [];

  for (let i = 0; i < timestamp.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    if (open == null || high == null || low == null || close == null) continue;

    const dt = new Date(timestamp[i] * 1000);
    const datetime = dt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

    bars.push({
      datetime,
      open,
      high,
      low,
      close,
      volume: quote.volume[i] ?? 0,
    });
  }

  // Return only the last N bars as requested
  return bars.slice(-outputsize);
}
