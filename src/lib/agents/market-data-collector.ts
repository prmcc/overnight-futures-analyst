import { fetchTimeSeries } from '../tools/yahoo-finance';
import { loadInstruments } from '../config/loader';
import type { MarketDataResult, InstrumentConfig } from '../types';

async function fetchInstrumentData(instrument: InstrumentConfig): Promise<MarketDataResult> {
  const [data5min, data60min, dataDailyChron] = await Promise.all([
    fetchTimeSeries(instrument.symbol, '5min', 252),
    fetchTimeSeries(instrument.symbol, '1h', 24),
    fetchTimeSeries(instrument.symbol, '1day', 5),
  ]);

  // Yahoo returns chronological order. PDH/PDL/PDC extractor expects newest-first for daily.
  const dataDaily = [...dataDailyChron].reverse();

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
  const results: MarketDataResult[] = [];

  for (const instrument of instruments) {
    try {
      const data = await fetchInstrumentData(instrument);
      results.push(data);
      console.log(`[Market Data] ${instrument.name}: ${data.data5min.length} 5min, ${data.data60min.length} 60min, ${data.dataDaily.length} daily bars`);
    } catch (error) {
      console.error(`[Market Data] Failed to fetch ${instrument.name}:`, error);
      results.push({
        instrumentId: instrument.id,
        data5min: [],
        data60min: [],
        dataDaily: [],
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}
