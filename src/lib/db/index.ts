import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'overnight-analyst.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Initialize tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    duration_ms INTEGER,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    error_message TEXT,
    config_snapshot TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_invocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    stage INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'running',
    model_used TEXT,
    input_summary TEXT,
    output_summary TEXT,
    full_output TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS technical_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    instrument_id TEXT NOT NULL,
    current_price REAL,
    pdh REAL,
    pdl REAL,
    pdc REAL,
    ema21_10min REAL,
    ema21_15min REAL,
    ema21_60min REAL,
    slope_10min TEXT,
    slope_15min TEXT,
    slope_60min TEXT,
    is_consolidating INTEGER,
    atr_ratio REAL,
    bb_midline REAL,
    swing_highs TEXT,
    swing_lows TEXT,
    tokyo_bias TEXT,
    london_bias TEXT,
    preny_bias TEXT,
    overall_bias TEXT,
    percent_change REAL,
    full_data TEXT
  );

  CREATE TABLE IF NOT EXISTS bias_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    date TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    predicted_bias TEXT NOT NULL,
    confidence_pct INTEGER,
    reasoning TEXT,
    actual_outcome TEXT,
    was_correct INTEGER,
    marked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS graded_setups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    date TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    setup_type TEXT NOT NULL,
    entry_zone REAL,
    stop_loss REAL,
    take_profit REAL,
    estimated_rr REAL,
    was_triggered INTEGER,
    outcome TEXT
  );

  CREATE TABLE IF NOT EXISTS qa_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    attempt_number INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    confidence_score INTEGER,
    sections_json TEXT,
    corrections TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS economic_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    event_date TEXT NOT NULL,
    event_time TEXT,
    title TEXT NOT NULL,
    impact TEXT NOT NULL,
    forecast TEXT,
    previous TEXT,
    actual TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pipeline_runs_date ON pipeline_runs(started_at);
  CREATE INDEX IF NOT EXISTS idx_agent_invocations_run ON agent_invocations(run_id);
  CREATE INDEX IF NOT EXISTS idx_technical_snapshots_run ON technical_snapshots(run_id);
  CREATE INDEX IF NOT EXISTS idx_bias_calls_date ON bias_calls(date);
  CREATE INDEX IF NOT EXISTS idx_bias_calls_instrument ON bias_calls(instrument_id);
  CREATE INDEX IF NOT EXISTS idx_graded_setups_date ON graded_setups(date);
`);

export { schema };
