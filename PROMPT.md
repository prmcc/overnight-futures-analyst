# Claude Code Prompt — Overnight Futures Analyst Multi-Agent Build

I want to build a Node.js application that powers an automated pre-market futures analysis pipeline ("Overnight Futures Analyst").

**Business Context**

I'm a day trader who trades GC (Gold), NQ (Nasdaq E-mini), ES (S&P E-mini), Silver (SI/XAG), and Bitcoin (BTC) during the NY session. Every morning before the open, I need a comprehensive briefing on overnight price action from the Tokyo and London sessions — including key levels, EMA zones, swing points, consolidation warnings, and graded trade setups — delivered to my inbox by 5:30 AM PST.

I currently run this as an n8n workflow, but I want to rebuild it as a multi-agent system with a proper UI so I can tune prompts, adjust instruments, and review analysis history without touching code.

**My Trading Strategies (agents must understand these):**

1. **NY Session — EMA Retests:**
   - Trade retests of the 21 EMA on 10/15/60 min timeframes (plotted on 3 min chart)
   - Signal candle wick touching EMA must be 25% larger than opposite wick
   - Confluence: BB midline cross within one candle of retest
   - Triple confluence: Both 10 and 15 min EMA retest + BB midline cross
   - CRITICAL: Do NOT take setups if 15 min is consolidating (ATR ratio < 0.6)
   - Stop loss: Back of signal candle
   - Take profit: 3 or 15 min swing OR 2:1 RR

2. **Asian Session — Swing Point Failures (SFP):**
   - Trade SFPs in direction of trend
   - Need BB midline cross + at least 1 retest as confluence
   - Stop loss: Back of SFP signal candle
   - Take profit: 3 or 15 min swing OR 2:1 RR

3. **Key Level Analysis — PDH/PDL/PDC:**
   - PDH and PDL act as key support/resistance zones
   - Price opening above PDH = bullish bias; below PDL = bearish bias
   - PDC is a pivot: price above = bullish lean, below = bearish lean
   - Gaps from PDC to current open often get filled — note gap direction and size
   - When PDH/PDL aligns with an EMA level, that creates HIGH confluence

---

**Design a multi-agent system using a modular architecture where each agent has a clear responsibility:**

(a) **Market Data Collector Agent** — fetches real-time and historical price data from TwelveData API for all 5 instruments (GC via XAU/USD, NQ, ES, Silver via XAG/USD, BTC via BTC/USD) across multiple timeframes:
  - 5-minute bars (last 252 bars = ~21 hours of overnight data)
  - 1-hour bars (last 24 bars)
  - Daily bars (last 5 bars for PDH/PDL/PDC calculation)
  Outputs: raw OHLCV data per instrument per timeframe, normalized and timestamped.

(b) **Technical Analysis Agent** — takes raw OHLCV data and computes all technical indicators deterministically (no LLM needed for this — pure math):
  - 21-period EMA on 10min, 15min, and 60min aggregated bars (aggregated from 5min data)
  - EMA slope direction (RISING/FALLING/FLAT) based on last 3 EMA values
  - Proximity alerts: flag when price is within 0.1% of the 15min 21 EMA
  - Bollinger Bands (20-period, 2 std dev) midline for confluence detection
  - ATR ratio for consolidation detection (ATR < 0.6 of 20-period average = consolidating)
  - Swing point identification (swing highs/lows from overnight bars)
  - Previous Day High, Low, Close with gap calculation from PDC to current price
  - Session breakdowns: Tokyo (6PM–2AM ET), London (2AM–5AM ET), Pre-NY (5AM–9:30AM ET) with OHLC and bias per session
  - Percent change calculations
  Outputs: structured technical data per instrument with all computed levels.

(c) **Economic Calendar Agent** — fetches today's USD economic events from Myfxbook calendar XML feed (or similar free source). Parses event time, title, impact level (HIGH/MEDIUM/LOW), forecast, and previous values. Sorts by impact. Outputs: array of economic events for the trading day, filtered to HIGH and MEDIUM impact USD events.

(d) **Chart Image Agent** — fetches 15-minute chart images with MACD overlay for each instrument from chart-img.com API (or TradingView widget screenshots). Uses dark theme, 800x500 resolution. Outputs: base64-encoded PNG images per instrument for email embedding.

(e) **Trading Analyst Agent** (LLM-powered) — the core intelligence. Takes the structured technical data from the Technical Analysis Agent + economic calendar + chart images and produces a comprehensive, graded trading plan. This agent uses the system prompt encoding all three trading strategies above. Its analysis must include:
  1. **Overnight Session Recap** — what happened in Tokyo, London, Pre-NY for each instrument
  2. **Previous Day Key Levels** — PDH/PDL/PDC with current price position and gap analysis
  3. **EMA Retest Zones** — exact 10/15/60 min EMA levels with slopes and proximity alerts
  4. **Swing Points** — key overnight swing highs/lows for SFP setups
  5. **Consolidation Warnings** — flag instruments where 15min is consolidating (AVOID EMA retest setups)
  6. **Bias & Confidence** — BULLISH/BEARISH/NEUTRAL per instrument with confidence % and reasoning
  7. **Graded Trading Plan** — specific setups graded A+ through C:
     - A+ = Triple confluence (10+15 EMA retest + BB midline + PDH/PDL nearby + all EMAs aligned)
     - A = Double confluence (EMA retest + BB midline cross + trending market)
     - B = Single confluence (EMA retest only or SFP only)
     - C = Low confluence (skip unless nothing else)
     Each setup: grade, instrument, type, entry zone, confirmation trigger, stop loss, take profit targets, estimated R:R, overlapping news risk
  8. **News Risk Windows** — specific times to go flat or avoid entries
  Outputs: structured analysis text with all 8 sections.

(f) **QA / Evidence Checker Agent** (LLM-powered) — validates the Trading Analyst's output against the raw technical data:
  - Verifies all price levels cited are within 0.1% of actual computed values
  - Confirms EMA slopes match the computed direction
  - Checks that consolidating instruments are NOT given EMA retest setups
  - Validates R:R calculations are mathematically correct
  - Ensures every setup references specific, verifiable price levels (no vague "around $X" language)
  - Checks bias reasoning is consistent with the technical data
  - Flags any hallucinated levels or contradictions
  Outputs: pass/fail per section, list of corrections needed, and a confidence score for the overall analysis.

(g) **Report Builder Agent** — takes the validated analysis, technical data, chart images, and economic calendar and generates a polished HTML email briefing:
  - Header with date and generation time
  - Bias summary cards (colored: green=bullish, red=bearish, yellow=neutral) with percent change and consolidation badges
  - Economic events table with impact color coding
  - PDH/PDL/PDC key levels table
  - 21 EMA retest zones table with slope badges
  - Overnight swing points table
  - Session statistics table (Tokyo/London/Pre-NY biases)
  - Embedded chart images
  - Full AI analysis with formatted headers and bold text
  - Disclaimer footer
  - Email subject line with bias emojis per instrument
  Outputs: complete HTML email body + subject line + plain text fallback.

(h) **Delivery Agent** — sends the formatted email via Gmail SMTP (or SendGrid/Mailgun). Handles retry logic on transient failures. Logs delivery status and timestamp. Optionally supports sending to multiple recipients or a Slack/Discord webhook as a secondary channel.

(i) **Orchestrator** — coordinates the entire pipeline on a daily cron schedule (5:30 AM PST / 13:30 UTC). Pipeline flow:

  ```
  Cron Trigger (5:30 AM PST)
       │
       ├──► Market Data Collector (parallel: all 5 instruments × 3 timeframes)
       ├──► Economic Calendar Agent
       ├──► Chart Image Agent (parallel: all 5 instruments)
       │
       ▼
  Technical Analysis Agent (processes all collected data)
       │
       ▼
  Trading Analyst Agent (LLM analysis with full context)
       │
       ▼
  QA / Evidence Checker Agent
       │
       ├── PASS ──► Report Builder ──► Delivery Agent ──► Done
       │
       └── FAIL ──► Trading Analyst Agent (retry with corrections, max 2 retries)
                         │
                         ▼
                    QA Agent (re-check) ──► PASS? ──► Report Builder ──► Delivery
  ```

  The Orchestrator:
  - Runs Market Data Collector, Economic Calendar, and Chart Image agents **in parallel** (they're independent)
  - Passes all results to Technical Analysis Agent
  - Sends computed data to Trading Analyst Agent
  - Validates output through QA Agent
  - On QA failure: retries Trading Analyst with the QA feedback (max 2 retries before sending with warnings)
  - Generates a daily run log: timestamps per agent, token usage, pass/fail status, total pipeline duration
  - Stores analysis history in a local database for backtesting reference

---

**Technical Requirements:**

1. **`agents.json`** — defines each agent in human-readable format: name, description, LLM model used (if applicable), tools available, system prompt, objective, temperature, max tokens, and retry settings. Non-engineers should be able to read and modify this. Agents that don't use an LLM (Technical Analysis, Chart Image, etc.) should be clearly marked as "deterministic."

2. **`tools.json`** — lists every tool each agent can use, in human-scannable JSON. Tools to include:
   - TwelveData API client (time series, multiple symbols/intervals)
   - Myfxbook calendar XML parser
   - Chart-img.com API client (TradingView chart snapshots)
   - EMA calculator (any period, any timeframe)
   - Bollinger Bands calculator
   - ATR calculator with consolidation detection
   - Swing point identifier (highs/lows from bar data)
   - Session time splitter (Tokyo/London/Pre-NY boundaries in ET)
   - PDH/PDL/PDC extractor from daily bars
   - Price proximity checker (% distance from level)
   - R:R ratio calculator
   - HTML email template renderer
   - Gmail SMTP sender (or SendGrid/Mailgun)
   - Base64 image encoder

3. **`workflow.json`** — stitches all agents together in a clear pipeline with the parallel/sequential flow described above. Includes retry logic for QA failures and timeout handling.

4. **Analysis history storage** — implement a local SQLite database (or `analysis_history.json`) that stores each daily run:
   - Date, run timestamp, pipeline duration
   - Raw technical data snapshot per instrument
   - AI analysis text
   - QA pass/fail results and corrections
   - Bias calls per instrument (for later backtesting accuracy)
   - Delivery status

5. **Step-by-step agent output display** — when the system runs, it should clearly show each agent's work:
   - Market Data Collector: instruments fetched, bar counts, data freshness
   - Technical Analysis: EMA levels, slopes, swing points, consolidation flags per instrument
   - Economic Calendar: events found, impact levels
   - Chart Image: charts generated (thumbnail preview or file paths)
   - Trading Analyst: the full analysis with all 8 sections
   - QA: validation checks and pass/fail per section
   - Report Builder: email preview
   - Delivery: send status and timestamp
   Each agent's output should be labeled and visible so it's easy to understand what every agent produced.

6. **`RFC.md`** — describes the entire project: the problem (manual pre-market analysis is slow, inconsistent, and easy to skip on tired mornings), the multi-agent architecture, tools selected and why, agents selected and why, the trading strategy encoding approach, QA validation logic, and a step-by-step usage guide. Include comprehensive ASCII diagrams for: agent pipeline flow, data model, and system context. Link this file in the app for easy viewing.

7. **Definition of Done**: the system runs every trading day at 5:30 AM PST and delivers a comprehensive, QA-validated pre-market briefing via email containing:
   - Bias calls for all 5 instruments with confidence levels
   - At least 2–3 graded setups (A+ through B) with specific entry/stop/target levels
   - PDH/PDL/PDC key levels and gap analysis
   - EMA retest zones with slope direction
   - Overnight swing points for SFP targets
   - Consolidation warnings
   - Economic calendar with news risk windows
   - Embedded chart images
   - All price levels verified by the QA agent against raw data

Show what LLM you are specifically using for each agent with the agent outputs.

---

**Enhancement #1 — Audit / Observability Layer**

Log every agent invocation: inputs, outputs, tool calls, LLM token usage, latency, and errors. Store in a structured log (SQLite or JSON) for traceability and debugging. Surface this in the UI as a "Run History" view where I can drill into any day's pipeline and see exactly what each agent received and produced.

**Enhancement #2 — Config UI**

Create a config page where I can edit `agents.json`, `tools.json`, and `workflow.json` through forms. I should be able to:
- Add/remove instruments (e.g., add Crude Oil CL, remove BTC)
- Adjust the Trading Analyst system prompt (update strategy rules, add new setups)
- Change LLM models per agent (swap GPT-4o for Claude, adjust temperature)
- Modify the cron schedule
- Edit email recipients
- Toggle agents on/off (e.g., skip Chart Image agent to save API costs)
- All without touching code.

**Enhancement #3 — RFC Document**

Use the same RFC generation approach (Executive Summary, Architecture, Agent Rationale, Tooling Philosophy, Usage Guide) tailored to the futures trading domain. Include sections on:
- Why multi-agent for trading analysis (separation of data collection, computation, reasoning, validation)
- How the QA agent prevents hallucinated price levels (the #1 risk in AI trading analysis)
- Strategy encoding approach (why the system prompt matters and how to update it)
- Backtesting potential using stored bias calls vs actual market outcomes

**Enhancement #4 — Backtesting Dashboard** (stretch goal)

Since we're storing daily bias calls and graded setups, build a simple dashboard that:
- Shows historical accuracy of bias calls (was the BULLISH call on GC correct?)
- Tracks setup grade distribution over time
- Highlights which instruments the system is most/least accurate on
- Helps tune the Trading Analyst prompt based on actual performance data
