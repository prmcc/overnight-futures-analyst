import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: text('id').primaryKey(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  status: text('status').notNull().default('running'),
  durationMs: integer('duration_ms'),
  totalInputTokens: integer('total_input_tokens').default(0),
  totalOutputTokens: integer('total_output_tokens').default(0),
  errorMessage: text('error_message'),
  configSnapshot: text('config_snapshot'),
});

export const agentInvocations = sqliteTable('agent_invocations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => pipelineRuns.id),
  agentId: text('agent_id').notNull(),
  agentName: text('agent_name').notNull(),
  stage: integer('stage').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
  status: text('status').notNull().default('running'),
  modelUsed: text('model_used'),
  inputSummary: text('input_summary'),
  outputSummary: text('output_summary'),
  fullOutput: text('full_output'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
});

export const technicalSnapshots = sqliteTable('technical_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => pipelineRuns.id),
  instrumentId: text('instrument_id').notNull(),
  currentPrice: real('current_price'),
  pdh: real('pdh'),
  pdl: real('pdl'),
  pdc: real('pdc'),
  ema21_10min: real('ema21_10min'),
  ema21_15min: real('ema21_15min'),
  ema21_60min: real('ema21_60min'),
  slope10min: text('slope_10min'),
  slope15min: text('slope_15min'),
  slope60min: text('slope_60min'),
  isConsolidating: integer('is_consolidating'),
  atrRatio: real('atr_ratio'),
  bbMidline: real('bb_midline'),
  swingHighs: text('swing_highs'),
  swingLows: text('swing_lows'),
  tokyoBias: text('tokyo_bias'),
  londonBias: text('london_bias'),
  preNYBias: text('preny_bias'),
  overallBias: text('overall_bias'),
  percentChange: real('percent_change'),
  fullData: text('full_data'),
});

export const biasCalls = sqliteTable('bias_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => pipelineRuns.id),
  date: text('date').notNull(),
  instrumentId: text('instrument_id').notNull(),
  predictedBias: text('predicted_bias').notNull(),
  confidencePct: integer('confidence_pct'),
  reasoning: text('reasoning'),
  actualOutcome: text('actual_outcome'),
  wasCorrect: integer('was_correct'),
  markedAt: text('marked_at'),
});

export const gradedSetups = sqliteTable('graded_setups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => pipelineRuns.id),
  date: text('date').notNull(),
  instrumentId: text('instrument_id').notNull(),
  grade: text('grade').notNull(),
  setupType: text('setup_type').notNull(),
  entryZone: real('entry_zone'),
  stopLoss: real('stop_loss'),
  takeProfit: real('take_profit'),
  estimatedRR: real('estimated_rr'),
  wasTriggered: integer('was_triggered'),
  outcome: text('outcome'),
});

export const qaResults = sqliteTable('qa_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => pipelineRuns.id),
  attemptNumber: integer('attempt_number').notNull(),
  passed: integer('passed').notNull(),
  confidenceScore: integer('confidence_score'),
  sectionsJson: text('sections_json'),
  corrections: text('corrections'),
  createdAt: text('created_at').notNull(),
});

export const economicEvents = sqliteTable('economic_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => pipelineRuns.id),
  eventDate: text('event_date').notNull(),
  eventTime: text('event_time'),
  title: text('title').notNull(),
  impact: text('impact').notNull(),
  forecast: text('forecast'),
  previous: text('previous'),
  actual: text('actual'),
});
