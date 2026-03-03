import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { pipelineRuns, technicalSnapshots, biasCalls, qaResults as qaResultsTable, economicEvents as economicEventsTable } from '../db/schema';
import { logAgentStart, logAgentComplete, logAgentError } from '../audit/logger';
import { loadWorkflow } from '../config/loader';

import { collectMarketData } from '../agents/market-data-collector';
import { collectEconomicCalendar } from '../agents/economic-calendar';
import { collectChartImages } from '../agents/chart-image';
import { runTechnicalAnalysis } from '../agents/technical-analysis';
import { runTradingAnalyst } from '../agents/trading-analyst';
import { runQAChecker } from '../agents/qa-checker';
import { buildReport } from '../agents/report-builder';
import { deliverReport } from '../agents/delivery';

import type { MarketDataResult, EconomicEvent, ChartImage, InstrumentAnalysis, TradingAnalystOutput, QAResult, ReportOutput, DeliveryResult } from '../types';

export interface PipelineResult {
  runId: string;
  status: 'completed' | 'failed';
  durationMs: number;
  marketData?: MarketDataResult[];
  economicEvents?: EconomicEvent[];
  chartImages?: ChartImage[];
  technicalAnalysis?: InstrumentAnalysis[];
  tradingAnalysis?: TradingAnalystOutput;
  qaResult?: QAResult;
  report?: ReportOutput;
  delivery?: DeliveryResult;
  error?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export async function runPipeline(): Promise<PipelineResult> {
  const runId = `run-${new Date().toISOString().split('T')[0]}-${uuidv4().slice(0, 8)}`;
  const startTime = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Pipeline] Starting run: ${runId}`);
  console.log(`[Pipeline] Time: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  // Create pipeline run record
  db.insert(pipelineRuns).values({
    id: runId,
    startedAt: new Date().toISOString(),
    status: 'running',
    totalInputTokens: 0,
    totalOutputTokens: 0,
  }).run();

  try {
    // ===== STAGE 1: Data Collection (parallel) =====
    console.log('\n--- STAGE 1: Data Collection (parallel) ---');

    const [marketData, events, charts] = await Promise.all([
      runAgent(runId, 'market-data-collector', 'Market Data Collector', 1, {}, async () => {
        return await collectMarketData();
      }),
      runAgent(runId, 'economic-calendar', 'Economic Calendar', 1, {}, async () => {
        return await collectEconomicCalendar();
      }),
      runAgent(runId, 'chart-image', 'Chart Image', 1, {}, async () => {
        return await collectChartImages();
      }),
    ]);

    // ===== STAGE 2: Technical Analysis (deterministic) =====
    console.log('\n--- STAGE 2: Technical Analysis ---');

    const techAnalysis = await runAgent(
      runId, 'technical-analysis', 'Technical Analysis', 2,
      { instrumentCount: marketData.length },
      async () => runTechnicalAnalysis(marketData)
    );

    // Store technical snapshots
    for (const inst of techAnalysis) {
      db.insert(technicalSnapshots).values({
        runId,
        instrumentId: inst.instrumentId,
        currentPrice: inst.currentPrice,
        pdh: inst.previousDay.high,
        pdl: inst.previousDay.low,
        pdc: inst.previousDay.close,
        ema21_10min: inst.emaLevels.ema21_10min,
        ema21_15min: inst.emaLevels.ema21_15min,
        ema21_60min: inst.emaLevels.ema21_60min,
        slope10min: inst.emaLevels.slope10min,
        slope15min: inst.emaLevels.slope15min,
        slope60min: inst.emaLevels.slope60min,
        isConsolidating: inst.consolidation.is15minConsolidating ? 1 : 0,
        atrRatio: inst.consolidation.atrRatio,
        bbMidline: inst.bollingerBands.min15?.middle ?? null,
        swingHighs: JSON.stringify(inst.swingPoints.recentHighs),
        swingLows: JSON.stringify(inst.swingPoints.recentLows),
        tokyoBias: inst.tokyo.bias,
        londonBias: inst.london.bias,
        preNYBias: inst.preNY.bias,
        overallBias: inst.bias,
        percentChange: parseFloat(inst.overall.percentChange),
        fullData: JSON.stringify(inst),
      }).run();
    }

    // ===== STAGE 3: AI Trading Analysis (LLM) =====
    console.log('\n--- STAGE 3: AI Trading Analysis ---');

    const workflow = loadWorkflow();
    const maxRetries = workflow.qaMaxRetries || 2;
    let tradingAnalysis: TradingAnalystOutput | null = null;
    let qaResult: QAResult | null = null;
    let corrections: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Run Trading Analyst
      tradingAnalysis = await runAgent(
        runId, 'trading-analyst', 'Trading Analyst', 3,
        { attempt: attempt + 1, hasCorrections: !!corrections },
        async () => runTradingAnalyst(techAnalysis, events, charts, corrections),
        attempt
      );

      totalInputTokens += tradingAnalysis.tokenUsage.input;
      totalOutputTokens += tradingAnalysis.tokenUsage.output;

      // ===== STAGE 4: QA Validation =====
      console.log(`\n--- STAGE 4: QA Validation (attempt ${attempt + 1}/${maxRetries + 1}) ---`);

      qaResult = await runAgent(
        runId, 'qa-checker', 'QA / Evidence Checker', 4,
        { attempt: attempt + 1 },
        async () => runQAChecker(tradingAnalysis!.analysis, techAnalysis),
        attempt
      );

      totalInputTokens += qaResult.tokenUsage.input;
      totalOutputTokens += qaResult.tokenUsage.output;

      // Store QA result
      db.insert(qaResultsTable).values({
        runId,
        attemptNumber: attempt + 1,
        passed: qaResult.passed ? 1 : 0,
        confidenceScore: qaResult.confidenceScore,
        sectionsJson: JSON.stringify(qaResult.sections),
        corrections: qaResult.corrections,
        createdAt: new Date().toISOString(),
      }).run();

      if (qaResult.passed) {
        console.log(`[Pipeline] QA PASSED on attempt ${attempt + 1}`);
        break;
      } else {
        console.log(`[Pipeline] QA FAILED on attempt ${attempt + 1}: ${qaResult.corrections.slice(0, 200)}`);
        corrections = qaResult.corrections;
        if (attempt === maxRetries) {
          console.warn('[Pipeline] Max QA retries reached - proceeding with warnings');
        }
      }
    }

    // Store bias calls for backtesting
    const todayStr = new Date().toISOString().split('T')[0];
    for (const inst of techAnalysis) {
      db.insert(biasCalls).values({
        runId,
        date: todayStr,
        instrumentId: inst.instrumentId,
        predictedBias: inst.bias,
        reasoning: `Overall % change: ${inst.overall.percentChange}%, EMA slopes: 10m=${inst.emaLevels.slope10min} 15m=${inst.emaLevels.slope15min} 60m=${inst.emaLevels.slope60min}`,
      }).run();
    }

    // Store economic events
    for (const event of events) {
      db.insert(economicEventsTable).values({
        runId,
        eventDate: todayStr,
        eventTime: event.time,
        title: event.title,
        impact: event.impact,
        forecast: event.forecast,
        previous: event.previous,
        actual: event.actual,
      }).run();
    }

    // ===== STAGE 5: Report Builder =====
    console.log('\n--- STAGE 5: Report Generation ---');

    const report = await runAgent(
      runId, 'report-builder', 'Report Builder', 5,
      {},
      async () => buildReport(
        techAnalysis, events, charts,
        tradingAnalysis!.analysis,
        qaResult!.confidenceScore,
        tradingAnalysis!.model
      )
    );

    // ===== STAGE 6: Delivery (Telegram primary, email fallback) =====
    console.log('\n--- STAGE 6: Delivery ---');

    const delivery = await runAgent(
      runId, 'delivery', 'Delivery', 6,
      { recipients: workflow.emailRecipients },
      async () => deliverReport(
        report.emailHtml,
        report.subject,
        techAnalysis,
        events,
        charts,
        tradingAnalysis!.analysis,
        qaResult!.confidenceScore,
        tradingAnalysis!.model
      )
    );

    // Complete the pipeline run
    const durationMs = Date.now() - startTime;
    db.$client.prepare(
      `UPDATE pipeline_runs SET status = 'completed', completed_at = ?, duration_ms = ?, total_input_tokens = ?, total_output_tokens = ? WHERE id = ?`
    ).run(new Date().toISOString(), durationMs, totalInputTokens, totalOutputTokens, runId);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Pipeline] COMPLETED in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[Pipeline] Tokens: ${totalInputTokens} input, ${totalOutputTokens} output`);
    console.log(`[Pipeline] QA: ${qaResult!.passed ? 'PASSED' : 'FAILED'} (confidence: ${qaResult!.confidenceScore}%)`);
    console.log(`[Pipeline] Delivery: ${delivery.success ? 'SENT' : 'FAILED'}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      runId,
      status: 'completed',
      durationMs,
      marketData,
      economicEvents: events,
      chartImages: charts,
      technicalAnalysis: techAnalysis,
      tradingAnalysis: tradingAnalysis!,
      qaResult: qaResult!,
      report,
      delivery,
      totalInputTokens,
      totalOutputTokens,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    db.$client.prepare(
      `UPDATE pipeline_runs SET status = 'failed', completed_at = ?, duration_ms = ?, error_message = ?, total_input_tokens = ?, total_output_tokens = ? WHERE id = ?`
    ).run(new Date().toISOString(), durationMs, errorMsg, totalInputTokens, totalOutputTokens, runId);

    console.error(`\n[Pipeline] FAILED after ${(durationMs / 1000).toFixed(1)}s: ${errorMsg}`);

    return {
      runId,
      status: 'failed',
      durationMs,
      error: errorMsg,
      totalInputTokens,
      totalOutputTokens,
    };
  }
}

// Helper to run an agent with audit logging
async function runAgent<T>(
  runId: string,
  agentId: string,
  agentName: string,
  stage: number,
  input: unknown,
  fn: () => Promise<T>,
  retryCount = 0
): Promise<T> {
  const invocationId = await logAgentStart(runId, agentId, agentName, stage, input, retryCount);

  try {
    const result = await fn();
    await logAgentComplete(invocationId, result, {
      modelUsed: (result as { model?: string })?.model,
      inputTokens: (result as { tokenUsage?: { input: number } })?.tokenUsage?.input,
      outputTokens: (result as { tokenUsage?: { output: number } })?.tokenUsage?.output,
    });
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await logAgentError(invocationId, errorMsg);
    throw error;
  }
}
