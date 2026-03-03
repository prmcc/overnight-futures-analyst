import type { Bias, EMASlope, EconomicEvent } from './market-data';

export interface SwingPoint {
  price: number;
  time: string;
  barIndex: number;
}

export interface SessionStats {
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  bias: Bias;
  barCount: number;
}

export interface EMALevels {
  ema21_10min: number | null;
  ema21_15min: number | null;
  ema21_60min: number | null;
  slope10min: EMASlope;
  slope15min: EMASlope;
  slope60min: EMASlope;
  proximity15min: number | null;
  proximityAlert: boolean;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
}

export interface ConsolidationData {
  is15minConsolidating: boolean;
  atrRatio: number;
  atr: number;
  avgAtr: number;
}

export interface PreviousDayLevels {
  high: number;
  low: number;
  close: number;
  gapFromPDC: string;
  gapPercent: number;
}

export interface InstrumentAnalysis {
  instrumentId: string;
  instrumentName: string;
  currentPrice: number;
  overall: {
    open: number;
    high: number;
    low: number;
    close: number;
    range: number;
    percentChange: string;
  };
  previousDay: PreviousDayLevels;
  tokyo: SessionStats;
  london: SessionStats;
  preNY: SessionStats;
  emaLevels: EMALevels;
  bollingerBands: {
    min10: BollingerBands | null;
    min15: BollingerBands | null;
    min60: BollingerBands | null;
  };
  swingPoints: {
    recentHighs: SwingPoint[];
    recentLows: SwingPoint[];
  };
  consolidation: ConsolidationData;
  bias: Bias;
}

export interface TradingAnalystOutput {
  analysis: string;
  tokenUsage: { input: number; output: number };
  model: string;
}

export interface QASection {
  name: string;
  passed: boolean;
  issues: string[];
}

export interface QAResult {
  passed: boolean;
  sections: QASection[];
  corrections: string;
  confidenceScore: number;
  tokenUsage: { input: number; output: number };
  model: string;
}

export interface ReportOutput {
  emailHtml: string;
  subject: string;
  plainText: string;
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  timestamp: string;
  error?: string;
}

export interface DailyAnalysis {
  instruments: InstrumentAnalysis[];
  economicEvents: EconomicEvent[];
  chartImages: { instrumentId: string; base64: string }[];
  tradingAnalysis: TradingAnalystOutput;
  qaResult: QAResult;
  report: ReportOutput;
  delivery: DeliveryResult;
}
