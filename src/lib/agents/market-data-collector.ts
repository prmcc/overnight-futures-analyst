import { fetchTimeSeries } from '../tools/twelvedata';
import { parseBar } from '../tools/bar-aggregator';
import { loadInstruments } from '../config/loader';
import type { MarketDataResult, InstrumentConfig } from '../types';

async function fetchInstrumentData(instrument: InstrumentConfig): Promise<MarketDataResult> {
  // Fetch all three timeframes with small delays to respect rate limits
  const [data5minRaw, data60minRaw, dataDailyRaw] = await Promise.all([
    fetchTimeSeries(instrument.symbol, '5min', 252),
    fetchTimeSeries(instrument.symbol, '1h', 24),
    fetchTimeSeries(instrument.symbol, '1day', 5),
  ]);

  // TwelveData returns newest first - reverse for chronological order for 5min/60min
  // Keep daily as-is (newest first) since PDH/PDL/PDC extractor expects that
  const data5min = (data5minRaw.values || []).reverse().map(parseBar);
  const data60min = (data60minRaw.values || []).reverse().map(parseBar);
  const dataDaily = (dataDailyRaw.values || []).map(parseBar); // Keep newest-first

  return {
    instrumentId: instrument.id,
    data5min,
    data60min,
    dataDaily,
    fetchedAt: new Date().toISOString(),
  };
}

export async function collectMarketData(): Promise<MarketDataResult[]> {
  const instruments = loadInstruments().filter(i => i.enabled);

  // Fetch instruments with staggered delays to respect TwelveData rate limits
  // Free tier: 8 requests/minute, each instrument = 3 requests = 15 total
  const results: MarketDataResult[] = [];

  for (let i = 0; i < instruments.length; i++) {
    if (i > 0) {
      // 2.5 second delay between instruments to stay under rate limit
      await new Promise(r => setTimeout(r, 2500));
    }
    try {
      const data = await fetchInstrumentData(instruments[i]);
      results.push(data);
      console.log(`[Market Data] ${instruments[i].name}: ${data.data5min.length} 5min bars, ${data.data60min.length} 60min bars, ${data.dataDaily.length} daily bars`);
    } catch (error) {
      console.error(`[Market Data] Failed to fetch ${instruments[i].name}:`, error);
      results.push({
        instrumentId: instruments[i].id,
        data5min: [],
        data60min: [],
        dataDaily: [],
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}
