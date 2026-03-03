export interface OHLCVBar {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RawBar {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

export interface TwelveDataResponse {
  meta: {
    symbol: string;
    interval: string;
    currency_base?: string;
    currency_quote?: string;
    type?: string;
  };
  values: RawBar[];
  status: string;
}

export interface InstrumentConfig {
  id: string;
  name: string;
  symbol: string;
  chartSymbol: string;
  decimals: number;
  isUTC: boolean;
  enabled: boolean;
}

export interface MarketDataResult {
  instrumentId: string;
  data5min: OHLCVBar[];
  data60min: OHLCVBar[];
  dataDaily: OHLCVBar[];
  fetchedAt: string;
}

export interface ChartImage {
  instrumentId: string;
  base64: string;
  fetchedAt: string;
}

export interface EconomicEvent {
  time: string;
  title: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  forecast: string;
  previous: string;
  actual: string;
}

export type SessionName = 'tokyo' | 'london' | 'preNY' | 'ny' | 'unknown';
export type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type EMASlope = 'RISING' | 'FALLING' | 'FLAT';
