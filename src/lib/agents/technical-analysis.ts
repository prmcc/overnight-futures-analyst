import { aggregateBars } from '../tools/bar-aggregator';
import { calculateEMA, calculateEMASlope } from '../tools/indicators/ema';
import { calculateBollingerBands } from '../tools/indicators/bollinger';
import { detectConsolidation } from '../tools/indicators/atr';
import { findSwingPoints } from '../tools/indicators/swing-points';
import { splitBySessions } from '../tools/session-splitter';
import { extractPreviousDayLevels } from '../tools/pdh-pdl-pdc';
import { checkProximity } from '../tools/proximity-checker';
import { loadInstruments } from '../config/loader';
import type { MarketDataResult, OHLCVBar, Bias, InstrumentAnalysis, SessionStats, EMALevels } from '../types';

function computeSessionStats(bars: OHLCVBar[], decimals: number): SessionStats {
  if (bars.length === 0) {
    return { open: 0, high: 0, low: 0, close: 0, range: 0, bias: 'NEUTRAL', barCount: 0 };
  }
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const open = bars[0].open;
  const close = bars[bars.length - 1].close;
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  return {
    open: parseFloat(open.toFixed(decimals)),
    high: parseFloat(high.toFixed(decimals)),
    low: parseFloat(low.toFixed(decimals)),
    close: parseFloat(close.toFixed(decimals)),
    range: parseFloat((high - low).toFixed(decimals)),
    bias: (close > open ? 'BULLISH' : close < open ? 'BEARISH' : 'NEUTRAL') as Bias,
    barCount: bars.length,
  };
}

export function analyzeInstrument(data: MarketDataResult): InstrumentAnalysis {
  const instruments = loadInstruments();
  const config = instruments.find(i => i.id === data.instrumentId);
  const name = config?.name || data.instrumentId;
  const decimals = config?.decimals ?? 2;
  const isUTC = config?.isUTC ?? true;

  const bars5min = data.data5min;
  const bars60min = data.data60min;

  if (bars5min.length === 0) {
    // Return a minimal analysis for missing data
    return createEmptyAnalysis(data.instrumentId, name);
  }

  // Aggregate 5min to 10min and 15min
  const bars10min = aggregateBars(bars5min, 2);
  const bars15min = aggregateBars(bars5min, 3);

  // Extract close arrays
  const closes10min = bars10min.map(b => b.close);
  const closes15min = bars15min.map(b => b.close);
  const closes60min = bars60min.map(b => b.close);

  // Calculate EMAs
  const ema21_10min = calculateEMA(closes10min, 21);
  const ema21_15min = calculateEMA(closes15min, 21);
  const ema21_60min = calculateEMA(closes60min, 21);

  // EMA slopes
  const slope10min = calculateEMASlope(closes10min, 21);
  const slope15min = calculateEMASlope(closes15min, 21);
  const slope60min = calculateEMASlope(closes60min, 21);

  // Current price
  const currentPrice = bars5min[bars5min.length - 1].close;

  // Proximity to 15min EMA
  const proximity15 = ema21_15min ? checkProximity(currentPrice, ema21_15min) : null;

  const emaLevels: EMALevels = {
    ema21_10min: ema21_10min ? parseFloat(ema21_10min.toFixed(decimals)) : null,
    ema21_15min: ema21_15min ? parseFloat(ema21_15min.toFixed(decimals)) : null,
    ema21_60min: ema21_60min ? parseFloat(ema21_60min.toFixed(decimals)) : null,
    slope10min,
    slope15min,
    slope60min,
    proximity15min: proximity15 ? parseFloat((proximity15.percentDistance * 100).toFixed(3)) : null,
    proximityAlert: proximity15?.isAlert ?? false,
  };

  // Bollinger Bands
  const bb10 = calculateBollingerBands(closes10min);
  const bb15 = calculateBollingerBands(closes15min);
  const bb60 = calculateBollingerBands(closes60min);

  // Session breakdown
  const sessions = splitBySessions(bars5min, isUTC);
  const tokyo = computeSessionStats(sessions.tokyo, decimals);
  const london = computeSessionStats(sessions.london, decimals);
  const preNY = computeSessionStats(sessions.preNY, decimals);

  // Overall stats
  const allHighs = bars5min.map(b => b.high);
  const allLows = bars5min.map(b => b.low);
  const sessionHigh = Math.max(...allHighs);
  const sessionLow = Math.min(...allLows);
  const sessionOpen = bars5min[0].open;
  const priceChange = currentPrice - sessionOpen;
  const percentChange = (priceChange / sessionOpen) * 100;

  // Previous Day Levels
  const prevDay = extractPreviousDayLevels(data.dataDaily, currentPrice, decimals);

  // Swing Points from 15min bars
  const swings = findSwingPoints(bars15min);

  // Consolidation from 15min bars
  const consolidation = detectConsolidation(bars15min);

  // Bias
  const bias: Bias = priceChange > 0 ? 'BULLISH' : priceChange < 0 ? 'BEARISH' : 'NEUTRAL';

  return {
    instrumentId: data.instrumentId,
    instrumentName: name,
    currentPrice: parseFloat(currentPrice.toFixed(decimals)),
    overall: {
      open: parseFloat(sessionOpen.toFixed(decimals)),
      high: parseFloat(sessionHigh.toFixed(decimals)),
      low: parseFloat(sessionLow.toFixed(decimals)),
      close: parseFloat(currentPrice.toFixed(decimals)),
      range: parseFloat((sessionHigh - sessionLow).toFixed(decimals)),
      percentChange: percentChange.toFixed(3),
    },
    previousDay: prevDay || { high: 0, low: 0, close: 0, gapFromPDC: 'N/A', gapPercent: 0 },
    tokyo,
    london,
    preNY,
    emaLevels,
    bollingerBands: {
      min10: bb10 ? { upper: parseFloat(bb10.upper.toFixed(decimals)), middle: parseFloat(bb10.middle.toFixed(decimals)), lower: parseFloat(bb10.lower.toFixed(decimals)) } : null,
      min15: bb15 ? { upper: parseFloat(bb15.upper.toFixed(decimals)), middle: parseFloat(bb15.middle.toFixed(decimals)), lower: parseFloat(bb15.lower.toFixed(decimals)) } : null,
      min60: bb60 ? { upper: parseFloat(bb60.upper.toFixed(decimals)), middle: parseFloat(bb60.middle.toFixed(decimals)), lower: parseFloat(bb60.lower.toFixed(decimals)) } : null,
    },
    swingPoints: {
      recentHighs: swings.swingHighs.slice(-3).map(s => ({
        price: parseFloat(s.price.toFixed(decimals)),
        time: s.time,
        barIndex: s.barIndex,
      })),
      recentLows: swings.swingLows.slice(-3).map(s => ({
        price: parseFloat(s.price.toFixed(decimals)),
        time: s.time,
        barIndex: s.barIndex,
      })),
    },
    consolidation: {
      is15minConsolidating: consolidation.isConsolidating,
      atrRatio: consolidation.atrRatio,
      atr: consolidation.atr,
      avgAtr: consolidation.avgAtr,
    },
    bias,
  };
}

function createEmptyAnalysis(id: string, name: string): InstrumentAnalysis {
  const empty: SessionStats = { open: 0, high: 0, low: 0, close: 0, range: 0, bias: 'NEUTRAL', barCount: 0 };
  return {
    instrumentId: id,
    instrumentName: name,
    currentPrice: 0,
    overall: { open: 0, high: 0, low: 0, close: 0, range: 0, percentChange: '0.000' },
    previousDay: { high: 0, low: 0, close: 0, gapFromPDC: 'N/A', gapPercent: 0 },
    tokyo: empty,
    london: empty,
    preNY: empty,
    emaLevels: { ema21_10min: null, ema21_15min: null, ema21_60min: null, slope10min: 'FLAT', slope15min: 'FLAT', slope60min: 'FLAT', proximity15min: null, proximityAlert: false },
    bollingerBands: { min10: null, min15: null, min60: null },
    swingPoints: { recentHighs: [], recentLows: [] },
    consolidation: { is15minConsolidating: false, atrRatio: 1, atr: 0, avgAtr: 0 },
    bias: 'NEUTRAL',
  };
}

export function runTechnicalAnalysis(marketData: MarketDataResult[]): InstrumentAnalysis[] {
  return marketData.map(data => {
    try {
      const result = analyzeInstrument(data);
      console.log(`[Technical Analysis] ${result.instrumentName}: bias=${result.bias}, consolidating=${result.consolidation.is15minConsolidating}`);
      return result;
    } catch (error) {
      console.error(`[Technical Analysis] Error for ${data.instrumentId}:`, error);
      return createEmptyAnalysis(data.instrumentId, data.instrumentId);
    }
  });
}
