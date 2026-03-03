# RFC: Overnight Futures Analyst

**Status:** Implemented
**Author:** Paul McCurry
**Date:** 2026-03-01
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Agent Rationale](#3-agent-rationale)
4. [Why Multi-Agent for Trading](#4-why-multi-agent-for-trading)
5. [QA Agent Design](#5-qa-agent-design)
6. [Strategy Encoding](#6-strategy-encoding)
7. [Tooling Philosophy](#7-tooling-philosophy)
8. [Data Model](#8-data-model)
9. [Configuration System](#9-configuration-system)
10. [Backtesting](#10-backtesting)
11. [Deployment](#11-deployment)
12. [Usage Guide](#12-usage-guide)

---

## 1. Executive Summary

### The Problem

Manual pre-market analysis is slow, inconsistent, and easy to skip on tired mornings.

Every trading day before the NY session open, a futures trader needs to review overnight price
action across multiple instruments (Gold, Nasdaq, S&P 500, Silver, Bitcoin), compute technical
indicators across multiple timeframes, identify key levels, assess session biases, check the
economic calendar, and formulate a graded trading plan. This process involves:

- Pulling OHLCV data from Tokyo, London, and Pre-NY sessions across 5 instruments
- Computing 21-period EMAs on 10-minute, 15-minute, and 60-minute aggregated bars
- Calculating Bollinger Bands, ATR consolidation ratios, swing points, and PDH/PDL/PDC levels
- Cross-referencing all of the above against three distinct trading strategies
- Grading setups by confluence level (A+ through C)
- Checking the economic calendar for news risk windows

Done manually, this takes 30-60 minutes and is prone to inconsistency, especially at 5:30 AM.
The biggest risk is skipping it entirely on days when discipline is low -- which are exactly the
days when it matters most.

### The Solution

An automated multi-agent pipeline that runs at 5:30 AM PST every weekday and delivers a
comprehensive, QA-validated pre-market briefing via email. The system:

- Fetches overnight market data from TwelveData for all 5 instruments across 3 timeframes
- Computes all technical indicators deterministically (no LLM involved in math)
- Pulls the economic calendar from Myfxbook
- Generates 15-minute chart images from chart-img.com
- Produces a graded trading plan using Claude Sonnet with all three strategies encoded
- Validates every claim against raw data using a separate Claude Haiku QA agent
- Renders a polished HTML email with bias cards, data tables, charts, and the full analysis
- Delivers via Gmail SMTP

The entire pipeline runs in under 2 minutes and produces consistent, verifiable output every
single trading day.

---

## 2. Architecture Overview

### Pipeline Flow

```
+-------------------------------------------------------------------+
|                    ORCHESTRATOR (node-cron)                        |
|                  5:30 AM PST, weekdays only                       |
|                  Cron: "30 13 * * 1-5" UTC                        |
+-------------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+------------------+  +------------------+  +------------------+
| MARKET DATA      |  | ECONOMIC         |  | CHART IMAGE      |
| COLLECTOR        |  | CALENDAR         |  | AGENT            |
| (deterministic)  |  | (deterministic)  |  | (deterministic)  |
|                  |  |                  |  |                  |
| TwelveData API   |  | Myfxbook XML     |  | chart-img.com    |
| 5 instruments    |  | USD events       |  | 15min charts     |
| x 3 timeframes   |  | HIGH + MEDIUM    |  | MACD overlay     |
+------------------+  +------------------+  +------------------+
         |                    |                    |
         +--------------------+--------------------+
                              |
                              v
              +-------------------------------+
              | TECHNICAL ANALYSIS            |
              | (deterministic -- pure math)  |
              |                               |
              | 21 EMA (10/15/60 min)         |
              | EMA slopes + proximity        |
              | Bollinger Bands (20,2)        |
              | ATR consolidation detection   |
              | Swing point identification    |
              | PDH/PDL/PDC + gap calc        |
              | Session breakdown (TKY/LDN)   |
              +-------------------------------+
                              |
                              v
              +-------------------------------+
              | TRADING ANALYST               |
              | (LLM -- Claude Sonnet)        |
              |                               |
              | 8-section analysis            |
              | Graded setups (A+ to C)       |
              | Bias + confidence per inst    |
              | News risk windows             |
              +-------------------------------+
                              |
                              v
              +-------------------------------+
              | QA / EVIDENCE CHECKER         |
              | (LLM -- Claude Haiku)         |
              |                               |
              | Price accuracy: 0.1%          |
              | EMA slope consistency         |
              | Consolidation rule check      |
              | R:R math validation           |
              | Bias consistency              |
              | No vague language             |
              +-------------------------------+
                     |                |
                  PASS             FAIL
                     |                |
                     |                +---> Retry Trading Analyst
                     |                      (max 2 retries with
                     |                       QA corrections fed back)
                     v
              +-------------------------------+
              | REPORT BUILDER                |
              | (deterministic)               |
              |                               |
              | HTML email template           |
              | Bias cards (color-coded)      |
              | Data tables                   |
              | Embedded chart images         |
              | Formatted AI analysis         |
              +-------------------------------+
                              |
                              v
              +-------------------------------+
              | DELIVERY                      |
              | (deterministic)               |
              |                               |
              | Gmail SMTP via nodemailer     |
              | Retry on transient failure    |
              | Delivery status logging       |
              +-------------------------------+
                              |
                              v
                        [ EMAIL INBOX ]
```

### Key Design Decisions

**Parallel data collection.** The Market Data Collector, Economic Calendar, and Chart Image
agents have zero dependencies on each other. They run concurrently via `Promise.all` to minimize
total pipeline latency. Data collection is the slowest stage due to API rate limits (TwelveData
free tier: 8 requests/minute), so parallelizing independent fetches is critical.

**Sequential analysis chain.** Technical Analysis depends on market data. The Trading Analyst
depends on technical analysis plus economic events plus chart images. The QA checker depends on
the Trading Analyst output plus raw technical data. This chain must be sequential.

**QA retry loop.** If the QA agent fails the analysis, the Trading Analyst is re-invoked with the
QA corrections included in the prompt. This loop runs up to 2 retries. If all retries fail, the
report is still sent but with a warning flag. The pipeline never silently drops a run.

---

## 3. Agent Rationale

The system uses 8 agents. Each exists for a specific reason, and the split between deterministic
and LLM-powered agents is intentional.

### Deterministic Agents (no LLM, pure code)

| # | Agent | Why It Exists | Why Deterministic |
|---|-------|--------------|-------------------|
| 1 | **Market Data Collector** | Fetches OHLCV bars from TwelveData for 5 instruments across 3 timeframes (5min, 1h, daily). Handles rate limiting with staggered delays. | API calls are mechanical. An LLM adds no value to fetching time series data. Rate limit handling must be precise and consistent. |
| 2 | **Economic Calendar** | Parses Myfxbook's XML feed for USD economic events, filtering to HIGH and MEDIUM impact. | XML parsing is deterministic. The filter logic (currency = USD, impact >= MEDIUM) is a simple conditional, not a judgment call. |
| 3 | **Chart Image** | Fetches 15-minute TradingView chart snapshots with MACD overlay from chart-img.com for each instrument. | API call with fixed parameters. No reasoning required. |
| 4 | **Technical Analysis** | Computes all indicators: 21-period EMAs on aggregated bars, slopes, Bollinger Bands, ATR consolidation detection, swing points, PDH/PDL/PDC, session breakdowns. | This is the most critical agent to keep deterministic. EMA calculations, ATR ratios, and swing point detection are pure math. An LLM computing a 21-period EMA would introduce floating point hallucinations. Every number this agent produces must be exactly reproducible. |
| 5 | **Report Builder** | Generates the HTML email template with bias cards, data tables, chart images, and formatted analysis text. | HTML rendering is template logic. The structure is fixed; only the data values change. |
| 6 | **Delivery** | Sends the email via Gmail SMTP using nodemailer with app password authentication. | SMTP delivery is mechanical. Retry logic follows fixed rules. |

### LLM-Powered Agents

| # | Agent | Why It Exists | Why LLM-Powered |
|---|-------|--------------|-----------------|
| 7 | **Trading Analyst** (Claude Sonnet) | Produces the core analysis: overnight session recap, bias calls with confidence levels, graded trading plan with specific entry/stop/target levels, news risk assessment. | This is where reasoning matters. Cross-referencing 5 instruments across 3 strategies, weighing confluence factors, assigning grades, and producing coherent narrative requires judgment that deterministic code cannot replicate. Claude Sonnet is used for its strong reasoning and instruction-following. Temperature is set to 0.2 for consistency while allowing some analytical flexibility. |
| 8 | **QA / Evidence Checker** (Claude Haiku) | Validates every claim in the Trading Analyst's output against the raw technical data. Checks price accuracy, slope consistency, consolidation rules, R:R math, and bias logic. | Validation requires reading natural language output and cross-referencing it against structured data -- a task that benefits from language understanding. Claude Haiku is used because it is fast, cheap, and the task is well-constrained (checklist validation, not open-ended reasoning). Temperature is set to 0.0 for maximum determinism. |

### Why Not Fewer Agents?

A single monolithic script would be simpler but would mix concerns that have fundamentally
different reliability requirements. If the email sender fails, you do not want to re-run the
entire LLM analysis. If the LLM hallucinates a price level, you do not want to skip the entire
pipeline. Separating agents means each failure is isolated and recoverable.

### Why Not More Agents?

Agents could be further split (e.g., separate EMA agent, separate Bollinger agent, separate
session agent), but the overhead of inter-agent communication would exceed any benefit. The
Technical Analysis agent is a single unit because all its computations share the same input data
and have no ordering dependencies between them.

---

## 4. Why Multi-Agent for Trading

Trading analysis has a natural pipeline structure where each phase has different characteristics:

```
+------------------+  +------------------+  +------------------+  +------------------+
|   DATA           |  |   COMPUTATION    |  |   REASONING      |  |   VALIDATION     |
|   COLLECTION     |  |                  |  |                  |  |                  |
|                  |  |                  |  |                  |  |                  |
| - External APIs  |  | - Pure math      |  | - LLM judgment   |  | - LLM checklist  |
| - Rate limits    |  | - Reproducible   |  | - Strategy rules |  | - Cross-ref data |
| - Network I/O    |  | - Exact values   |  | - Confluence     |  | - Price accuracy |
| - Error handling |  | - No judgment    |  | - Grading        |  | - Rule adherence |
|                  |  |                  |  |                  |  |                  |
| RELIABILITY:     |  | RELIABILITY:     |  | RELIABILITY:     |  | RELIABILITY:     |
| retry on failure |  | 100% correct     |  | ~90% per claim   |  | catches the 10%  |
+------------------+  +------------------+  +------------------+  +------------------+
```

### Separation of Concerns

**Data Collection** is I/O-bound and failure-prone (APIs go down, rate limits trigger, network
times out). These failures have nothing to do with analysis quality and should be retried
independently.

**Computation** must be 100% correct. A 21-period EMA is a mathematical formula. There is no
room for "approximately right." This is why the Technical Analysis agent is deterministic code,
not an LLM. If you ask an LLM to calculate a 21-period EMA from 252 data points, it will
approximate. In trading, approximate prices kill you.

**Reasoning** is where LLMs excel. Cross-referencing EMA levels with PDH/PDL/PDC alignment,
weighing Tokyo session bias against London session reversal, grading setups by confluence level --
this is pattern recognition and judgment that deterministic code cannot handle without becoming
an unmaintainable rule engine.

**Validation** is the safety net. The number one risk in AI-generated trading analysis is
hallucinated price levels. A model that says "Gold is approaching the 15min EMA at $2,847" when
the actual EMA is $2,831 could cause you to enter a trade 16 points early. The QA agent
cross-checks every cited number against the deterministic computation.

### The Accuracy Cascade

Without the multi-agent split, you would have a single LLM call that fetches data, computes
indicators, reasons about setups, and formats the report. If each step is 90% accurate:

```
0.9 x 0.9 x 0.9 x 0.9 x 0.9 = 0.59 (59% overall accuracy)
```

With the multi-agent split:

- Data collection: 100% (deterministic, with retries)
- Computation: 100% (deterministic math)
- Reasoning: ~90% (LLM, but working with verified data)
- Validation: catches most of the 10% errors
- Net: ~97%+ accuracy on verifiable claims

The separation does not just improve reliability -- it makes errors traceable. When a bias call
is wrong, you can look at the audit log and determine: was the data correct? Were the indicators
computed correctly? Did the LLM misinterpret the data? Was the QA agent too lenient? Each answer
points to a different fix.

---

## 5. QA Agent Design

The QA / Evidence Checker is the most important safety mechanism in the system. Its sole purpose
is to prevent hallucinated price levels from reaching the trader's inbox.

### Why This Matters

Hallucinated prices are the #1 risk in AI trading analysis. Unlike hallucinated facts in a
research paper (which are embarrassing but rarely dangerous), hallucinated price levels in a
trading brief can directly cause financial loss:

- A fabricated EMA level could trigger a premature entry
- An incorrect PDH/PDL could lead to a wrong bias assessment
- A miscalculated R:R could make a losing trade look attractive
- A missed consolidation warning could lead to a setup in a choppy market

### Validation Checks

The QA agent performs 7 specific validation checks:

**1. Price Level Accuracy (0.1% tolerance)**

Every price level cited in the analysis is compared against the corresponding value in the
Technical Analysis output. The tolerance is 0.1% -- tight enough to catch hallucinations, loose
enough to handle rounding differences.

```
Example:
  Analysis says: "Gold 15min EMA at $2,847.50"
  Technical data: ema21_15min = 2845.23
  Difference: 0.08% --> PASS (within 0.1%)

  Analysis says: "Gold 15min EMA at $2,860"
  Technical data: ema21_15min = 2845.23
  Difference: 0.52% --> FAIL (hallucinated level)
```

**2. EMA Slope Consistency**

If the analysis describes an EMA as "rising" or "bullish," the QA agent verifies that the
computed slope from the Technical Analysis agent matches. Slopes are computed from the last 3
EMA values:

- RISING: each successive EMA value is higher than the previous
- FALLING: each successive EMA value is lower than the previous
- FLAT: no consistent direction

**3. Consolidation Rule Enforcement**

This is the most critical safety check. The trading strategy explicitly states: "Do NOT take
setups if 15 min is consolidating (ATR ratio < 0.6)." If the Technical Analysis agent flags an
instrument as consolidating and the Trading Analyst still recommends an EMA retest setup for
that instrument, the QA agent must fail the analysis. This is a hard rule, not a suggestion.

**4. R:R Math Validation**

For each graded setup, the QA agent recalculates the risk/reward ratio:

```
R:R = abs(takeProfit - entry) / abs(entry - stopLoss)
```

The stated R:R must match the math within 0.1. This catches both hallucinated R:R values and
inconsistent entry/stop/target combinations.

**5. Bias Consistency**

The stated bias (BULLISH/BEARISH/NEUTRAL) must be logically consistent with the underlying
data. A "BULLISH" call on an instrument where all EMAs are falling, Tokyo and London were
bearish, and price is below PDL would be flagged as inconsistent.

**6. No Vague Language**

Setups that reference "around $X" or "near the level" instead of specific price levels are
flagged. Every setup must have exact entry, stop loss, and take profit values.

**7. Section Completeness**

The analysis must contain all 8 required sections. Missing sections indicate the LLM truncated
its output or lost track of the format.

### Retry Mechanism

When the QA agent fails the analysis, it produces a `corrections` string describing exactly what
needs to be fixed. This string is injected into the Trading Analyst's next prompt:

```
**IMPORTANT - QA CORRECTIONS FROM PREVIOUS ATTEMPT:**
{corrections}

Please fix these issues in your revised analysis.
```

The retry loop runs up to 2 times (configurable via `workflow.json`). If all retries fail, the
report is sent with a low QA confidence score so the trader knows to double-check manually.

### QA Agent Model Choice

The QA agent uses Claude Haiku (temperature 0.0) rather than Sonnet because:

- The task is constrained: compare values, check rules, validate math
- Speed matters: it runs on every attempt, including retries
- Cost matters: at 2-3 retries, QA costs add up
- Determinism matters: temperature 0.0 ensures consistent validation

---

## 6. Strategy Encoding

### The System Prompt Approach

All three trading strategies are encoded in the Trading Analyst's system prompt, stored in
`config/agents.json`. This means strategy rules can be updated without changing any code.

The three strategies encoded:

**1. NY Session -- EMA Retests**
```
- Trade retests of the 21 EMA on 10/15/60 min timeframes
- Signal candle wick touching EMA must be 25% larger than opposite wick
- Confluence: BB midline cross within one candle of retest
- Triple confluence: Both 10 and 15 min EMA retest + BB midline cross
- CRITICAL: Do NOT take setups if 15 min is consolidating (ATR ratio < 0.6)
- Stop loss: Back of signal candle
- Take profit: 3 or 15 min swing OR 2:1 RR
```

**2. Asian Session -- Swing Point Failures (SFP)**
```
- Trade SFPs in direction of trend
- Need BB midline cross + at least 1 retest as confluence
- Stop loss: Back of SFP signal candle
- Take profit: 3 or 15 min swing OR 2:1 RR
```

**3. Key Level Analysis -- PDH/PDL/PDC**
```
- PDH and PDL act as key support/resistance zones
- Price opening above PDH = bullish bias; below PDL = bearish bias
- PDC is a pivot: price above = bullish lean, below = bearish lean
- Gaps from PDC to current open often get filled
- When PDH/PDL aligns with an EMA level = HIGH confluence
```

### Setup Grading System

Setups are graded by confluence level, encoded in the user prompt template:

| Grade | Definition |
|-------|-----------|
| **A+** | Triple confluence: 10+15 EMA retest + BB midline + PDH/PDL nearby + all EMAs aligned |
| **A** | Double confluence: EMA retest + BB midline cross + trending market |
| **B** | Single confluence: EMA retest only or SFP only |
| **C** | Low confluence: skip unless nothing else available |

### Why System Prompt Over Code

Encoding strategies in the system prompt rather than as coded rules gives several advantages:

1. **Non-technical editing.** The Config UI lets you modify the system prompt directly. Adding
   a new setup type (e.g., "London Breakout Retrace") means editing text, not writing code.

2. **Nuance handling.** Trading strategies have soft rules ("BB midline cross within one candle
   of retest") that are hard to codify precisely but easy for an LLM to interpret.

3. **Evolving strategies.** As the trader refines their approach based on backtesting data, the
   prompt can be updated immediately. No deployment required.

4. **Context-dependent judgment.** An A+ setup in a trending market is different from an A+
   setup ahead of FOMC. The LLM can weigh context factors that would require an explosion of
   conditional logic in code.

### What Stays in Code

The hard rules -- the ones where there is no judgment call -- stay in deterministic code:

- EMA calculation (math)
- ATR consolidation detection (threshold comparison)
- Swing point identification (3-bar pattern)
- PDH/PDL/PDC extraction (previous day values)
- Price proximity (percentage calculation)
- R:R ratio (division)

This gives the best of both worlds: exact computation where precision matters, flexible
reasoning where judgment matters.

---

## 7. Tooling Philosophy

### Data Sources

| Service | Purpose | Why This One |
|---------|---------|-------------|
| **TwelveData** | OHLCV price data | Free tier: 800 API calls/day, 8/minute. Covers all 5 instruments (Gold via XAU/USD, Nasdaq via NQ, S&P via ES, Silver via XAG/USD, Bitcoin via BTC/USD). JSON API with clean response format. Supports all needed intervals (5min, 1h, 1day). |
| **Myfxbook** | Economic calendar | Free XML feed, no API key required. Covers all major USD events with impact levels. Well-structured data (time, title, impact, forecast, previous, actual). |
| **chart-img.com** | TradingView chart screenshots | Free tier: 100 charts/month. Generates TradingView-quality charts with indicator overlays (MACD). Dark theme support. Returns PNG that can be base64-encoded for email embedding. |
| **Anthropic Claude** | LLM analysis + QA | Claude Sonnet for the Trading Analyst (strong reasoning, good instruction following). Claude Haiku for QA (fast, cheap, sufficient for checklist validation). Both accessed via the `@anthropic-ai/sdk`. |
| **Gmail SMTP** | Email delivery | Free, no additional service needed. Uses app passwords for authentication via `nodemailer`. Supports HTML emails with embedded images. |

### Rate Limit Handling

**TwelveData** is the bottleneck. Free tier allows 8 requests/minute. Each instrument requires
3 requests (5min + 1h + daily), so 5 instruments = 15 requests. The Market Data Collector
staggers instrument fetches with 2.5-second delays:

```
Instrument 1: 3 parallel requests  --> wait 2.5s
Instrument 2: 3 parallel requests  --> wait 2.5s
Instrument 3: 3 parallel requests  --> wait 2.5s
Instrument 4: 3 parallel requests  --> wait 2.5s
Instrument 5: 3 parallel requests
```

Within each instrument, the 3 timeframe requests fire in parallel (they count as 3 against the
rate limit, but TwelveData is lenient on small bursts). Total data collection time: ~12-15
seconds.

**chart-img.com** has a 100 charts/month free tier. At 5 instruments per day, 5 trading days
per week, that is 100 charts/month exactly. The agent can be disabled via `agents.json` to save
quota during testing.

### Cost Analysis

| Component | Cost per Run | Monthly (22 trading days) |
|-----------|-------------|--------------------------|
| TwelveData | Free (15 of 800 daily calls) | $0 |
| Myfxbook | Free | $0 |
| chart-img.com | Free (5 of ~5/day quota) | $0 |
| Claude Sonnet (Trading Analyst) | ~$0.03-0.08 | ~$0.66-1.76 |
| Claude Haiku (QA, 1-3 attempts) | ~$0.005-0.015 | ~$0.11-0.33 |
| Gmail SMTP | Free | $0 |
| **Total** | **~$0.04-0.10** | **~$0.80-2.10** |

---

## 8. Data Model

The system uses SQLite (via `better-sqlite3` and `drizzle-orm`) for persistent storage. The
database file lives at `data/ofa.db`.

### Entity Relationship Diagram

```
+-------------------+
| pipeline_runs     |
|-------------------|        +------------------------+
| id (PK)           |<-------| agent_invocations      |
| started_at        |        |------------------------|
| completed_at      |        | id (PK, auto)          |
| status            |        | run_id (FK)            |
| duration_ms       |        | agent_id               |
| total_input_tkns  |        | agent_name             |
| total_output_tkns |        | stage                  |
| error_message     |        | started_at             |
| config_snapshot   |        | completed_at           |
+-------------------+        | duration_ms            |
     |                       | status                 |
     |                       | model_used             |
     |                       | input_summary          |
     |                       | output_summary         |
     |                       | full_output            |
     |                       | input_tokens           |
     |                       | output_tokens          |
     |                       | error_message          |
     |                       | retry_count            |
     |                       +------------------------+
     |
     |---+------------------------+
     |   | technical_snapshots    |
     |   |------------------------|
     |   | id (PK, auto)          |
     |   | run_id (FK)            |
     |   | instrument_id          |
     |   | current_price          |
     |   | pdh / pdl / pdc        |
     |   | ema21_10min            |
     |   | ema21_15min            |
     |   | ema21_60min            |
     |   | slope_10/15/60min      |
     |   | is_consolidating       |
     |   | atr_ratio              |
     |   | bb_midline             |
     |   | swing_highs (JSON)     |
     |   | swing_lows (JSON)      |
     |   | tokyo/london/preny_bias|
     |   | overall_bias           |
     |   | percent_change         |
     |   | full_data (JSON)       |
     |   +------------------------+
     |
     |---+------------------------+
     |   | bias_calls             |
     |   |------------------------|
     |   | id (PK, auto)          |
     |   | run_id (FK)            |
     |   | date                   |
     |   | instrument_id          |
     |   | predicted_bias         |
     |   | confidence_pct         |
     |   | reasoning              |
     |   | actual_outcome         |  <-- filled in later for backtesting
     |   | was_correct            |  <-- filled in later for backtesting
     |   | marked_at              |
     |   +------------------------+
     |
     |---+------------------------+
     |   | graded_setups          |
     |   |------------------------|
     |   | id (PK, auto)          |
     |   | run_id (FK)            |
     |   | date                   |
     |   | instrument_id          |
     |   | grade (A+/A/B/C)       |
     |   | setup_type             |
     |   | entry_zone             |
     |   | stop_loss              |
     |   | take_profit            |
     |   | estimated_rr           |
     |   | was_triggered          |  <-- filled in later for backtesting
     |   | outcome                |  <-- filled in later for backtesting
     |   +------------------------+
     |
     |---+------------------------+
     |   | qa_results             |
     |   |------------------------|
     |   | id (PK, auto)          |
     |   | run_id (FK)            |
     |   | attempt_number         |
     |   | passed (0/1)           |
     |   | confidence_score       |
     |   | sections_json (JSON)   |
     |   | corrections            |
     |   | created_at             |
     |   +------------------------+
     |
     +---+------------------------+
         | economic_events        |
         |------------------------|
         | id (PK, auto)          |
         | run_id (FK)            |
         | event_date             |
         | event_time             |
         | title                  |
         | impact (HIGH/MEDIUM)   |
         | forecast               |
         | previous               |
         | actual                 |
         +------------------------+
```

### Table Purposes

**`pipeline_runs`** -- One row per pipeline execution. Tracks overall status, duration, and
aggregate token usage. The `config_snapshot` column captures the full configuration at run time
for reproducibility.

**`agent_invocations`** -- One row per agent execution within a run. This is the audit trail.
Every agent's input, output, timing, model used, and token count is recorded. For the Trading
Analyst, there may be multiple rows (one per QA retry attempt), distinguished by `retry_count`.

**`technical_snapshots`** -- One row per instrument per run. Stores the complete technical
analysis output including all computed levels, slopes, session biases, and the full JSON data
blob. This is the ground truth that the QA agent validates against.

**`bias_calls`** -- One row per instrument per run. Stores the predicted directional bias
(BULLISH/BEARISH/NEUTRAL) with confidence percentage. The `actual_outcome` and `was_correct`
columns are left null at generation time and filled in later when backtesting results are
recorded.

**`graded_setups`** -- One row per setup per run. Stores the grade, type, entry/stop/target
levels, and estimated R:R. Like bias calls, the `was_triggered` and `outcome` columns are for
post-session backtesting.

**`qa_results`** -- One row per QA attempt per run. If the QA agent fails on the first attempt
and the Trading Analyst retries, there will be 2-3 rows for a single run. Stores the per-section
pass/fail breakdown and the corrections text.

**`economic_events`** -- One row per economic event per run. Preserves the economic calendar
snapshot for the day so that news impact can be correlated with price action during backtesting.

---

## 9. Configuration System

The system is configured through 4 JSON files in the `config/` directory and environment
variables in `.env`. All JSON files are editable through the Config UI (web interface) without
touching code.

### agents.json

Defines each agent's identity, type, model, and behavior.

```json
{
  "id": "trading-analyst",
  "name": "Trading Analyst",
  "description": "Core intelligence agent...",
  "type": "llm",
  "model": "claude-sonnet-4-20250514",
  "temperature": 0.2,
  "maxTokens": 8000,
  "systemPrompt": "You are an expert futures trader...",
  "tools": ["anthropic-messages"],
  "enabled": true,
  "retryMax": 2
}
```

Key editability:
- **model**: Swap between Claude models (e.g., switch to a newer version)
- **temperature**: Adjust creativity vs. consistency
- **systemPrompt**: Update strategy rules, add new setups, change grading criteria
- **enabled**: Toggle agents on/off (e.g., disable chart-image to save API quota)

### tools.json

Documents every tool available to agents, including parameters and which agents use them.

```json
{
  "id": "ema-calculator",
  "name": "EMA Calculator",
  "description": "Calculates Exponential Moving Average...",
  "category": "indicators",
  "parameters": {
    "closes": { "type": "number[]", "required": true },
    "period": { "type": "number", "required": true }
  },
  "usedBy": ["technical-analysis"]
}
```

This file serves dual purpose: runtime documentation and Config UI display. Non-technical users
can see exactly what tools are available and what they do.

### workflow.json

Defines the pipeline structure, schedule, and stage dependencies.

```json
{
  "name": "Overnight Futures Analyst Pipeline",
  "schedule": "30 13 * * 1-5",
  "timezone": "America/Los_Angeles",
  "stages": [
    {
      "id": "data-collection",
      "agents": ["market-data-collector", "economic-calendar", "chart-image"],
      "parallel": true,
      "dependsOn": []
    },
    {
      "id": "technical-analysis",
      "agents": ["technical-analysis"],
      "parallel": false,
      "dependsOn": ["data-collection"]
    }
  ],
  "qaMaxRetries": 2,
  "emailRecipients": []
}
```

Key editability:
- **schedule**: Change the cron expression (e.g., run at 6:00 AM instead of 5:30 AM)
- **qaMaxRetries**: Adjust how many times the QA loop retries
- **emailRecipients**: Add or remove email addresses

### instruments.json

Defines the instruments to analyze.

```json
{
  "id": "gc",
  "name": "Gold (GC)",
  "symbol": "XAU/USD",
  "chartSymbol": "COMEX:GC1!",
  "decimals": 2,
  "isUTC": true,
  "enabled": true
}
```

Key editability:
- **Add instruments**: Add Crude Oil (CL), Copper (HG), or any TwelveData-supported symbol
- **Remove instruments**: Disable BTC if you stop trading crypto
- **decimals**: Control price precision per instrument
- **chartSymbol**: TradingView symbol format for chart-img.com

### The Config UI

The Next.js web application provides form-based editing for all 4 configuration files:

- `/config/agents` -- Edit agent prompts, models, temperatures, toggle enable/disable
- `/config/instruments` -- Add/remove/edit instruments
- `/config/workflow` -- Change schedule, retries, email recipients
- `/config/tools` -- View tool documentation (read-only, since tools are code)

Changes are saved directly to the JSON files and take effect on the next pipeline run. No
restart required (the config loader reads fresh from disk on every run).

---

## 10. Backtesting

### How It Works

Every pipeline run stores two key datasets for backtesting:

1. **Bias calls** -- The predicted directional bias (BULLISH/BEARISH/NEUTRAL) and confidence
   for each instrument
2. **Graded setups** -- Specific trade setups with entry, stop, target, and R:R

Both tables have columns for actual outcomes (`actual_outcome`, `was_correct`, `was_triggered`,
`outcome`) that are left null at generation time and filled in after the trading session.

### Tracking Accuracy Over Time

The `/backtesting` dashboard provides:

**Bias Accuracy by Instrument**
```
Instrument    | Calls | Correct | Accuracy
--------------+-------+---------+---------
Gold (GC)     |   47  |    34   |  72.3%
Nasdaq (NQ)   |   47  |    38   |  80.9%
S&P 500 (ES)  |   47  |    36   |  76.6%
Silver (SI)   |   47  |    29   |  61.7%
Bitcoin (BTC)  |   47  |    31   |  66.0%
```

**Setup Grade Distribution**
- How many A+ vs A vs B vs C setups are generated daily
- Which grades have the highest hit rate
- Whether the grading system is well-calibrated

**Tuning Loop**

The backtesting data creates a feedback loop:

1. Run the pipeline for 30+ trading days to build a dataset
2. Review which instruments have low bias accuracy
3. Examine the technical data for those instruments on wrong-call days
4. Identify patterns (e.g., "Silver bias is wrong when ATR is very low" or "BTC calls are
   unreliable during weekends")
5. Update the Trading Analyst system prompt with these learnings
6. Monitor whether accuracy improves

This is a manual process by design. Automatic prompt tuning based on backtesting results is
a future enhancement, but the data collection infrastructure is in place now.

### Data Retention

All pipeline runs, technical snapshots, and bias calls are stored indefinitely in the SQLite
database. The database grows at approximately 1-2 MB per month (5 instruments x 22 trading
days x ~10KB per instrument snapshot). At this rate, years of data can be stored without
concern.

---

## 11. Deployment

### Architecture

```
+------------------------------------------+
|              VPS (Ubuntu)                |
|                                          |
|  +------------------------------------+  |
|  |          PM2 Process Manager       |  |
|  |                                    |  |
|  |  +------------------------------+  |  |
|  |  | Node.js Server (server.ts)   |  |  |
|  |  |                              |  |  |
|  |  | - Next.js App (port 3000)    |  |  |
|  |  | - node-cron scheduler        |  |  |
|  |  | - SQLite database            |  |  |
|  |  +------------------------------+  |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  |            nginx                   |  |
|  |  - Reverse proxy to :3000         |  |
|  |  - SSL via Let's Encrypt          |  |
|  |  - Static file caching            |  |
|  +------------------------------------+  |
+------------------------------------------+
```

### PM2 Configuration

PM2 keeps the Node.js process running and restarts on crash:

```bash
pm2 start server.ts --name ofa --interpreter tsx
pm2 save
pm2 startup
```

Key PM2 benefits:
- Auto-restart on crash
- Log rotation
- Process monitoring
- Startup persistence across reboots

### nginx Configuration

nginx sits in front of the Node.js server for SSL termination and static file caching:

```nginx
server {
    listen 443 ssl;
    server_name ofa.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/ofa.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ofa.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Let's Encrypt

Free SSL certificates via certbot:

```bash
sudo certbot --nginx -d ofa.yourdomain.com
```

Certbot auto-renews certificates. The cron job runs twice daily by default.

### Minimum VPS Requirements

- **CPU**: 1 vCPU (pipeline is I/O bound, not CPU bound)
- **RAM**: 1 GB (Node.js + SQLite + Next.js)
- **Disk**: 10 GB (OS + app + months of database history)
- **Providers**: DigitalOcean ($6/mo), Hetzner ($4/mo), Vultr ($5/mo)

---

## 12. Usage Guide

### Step 1: Clone and Install

```bash
git clone <repository-url> overnight-futures-analyst
cd overnight-futures-analyst
npm install
```

### Step 2: Configure Environment Variables

Copy the example and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# REQUIRED: Get from https://twelvedata.com/apikey
TWELVEDATA_API_KEY=your_key_here

# REQUIRED: Get from https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=your_key_here

# REQUIRED: Get from https://chart-img.com
CHARTIMG_API_KEY=your_key_here

# REQUIRED: Gmail app password
# Google Account > Security > 2FA > App Passwords > generate for "Mail"
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=your_app_password

# REQUIRED: Who receives the daily briefing
EMAIL_RECIPIENTS=you@gmail.com

# OPTIONAL: Protects the /api/pipeline/trigger endpoint
CRON_SECRET=change-me-to-a-random-string
```

### Step 3: Configure Instruments (Optional)

Edit `config/instruments.json` to add or remove instruments. The defaults are:

| ID | Name | TwelveData Symbol | Chart Symbol |
|----|------|-------------------|--------------|
| gc | Gold (GC) | XAU/USD | COMEX:GC1! |
| nq | Nasdaq (NQ) | NQ | CME_MINI:NQ1! |
| es | S&P 500 (ES) | ES | CME_MINI:ES1! |
| silver | Silver (SI) | XAG/USD | COMEX:SI1! |
| btc | Bitcoin (BTC) | BTC/USD | BITSTAMP:BTCUSD |

### Step 4: Start the Server

Development mode (with hot reload):

```bash
npm run dev
```

Production mode:

```bash
npm run build
npm run start
```

The server starts on `http://localhost:3000` with the cron scheduler active.

### Step 5: Run the Pipeline Manually

Open `http://localhost:3000` in your browser. Click the "Trigger Run" button, or hit the API
directly:

```bash
curl -X POST http://localhost:3000/api/pipeline/trigger \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: your-secret-here"
```

### Step 6: Monitor the Run

Watch the terminal for real-time progress:

```
============================================================
[Pipeline] Starting run: run-2026-03-01-a1b2c3d4
[Pipeline] Time: 2026-03-01T13:30:00.000Z
============================================================

--- STAGE 1: Data Collection (parallel) ---
[Market Data] Gold (GC): 252 5min bars, 24 60min bars, 5 daily bars
[Market Data] Nasdaq (NQ): 252 5min bars, 24 60min bars, 5 daily bars
[Economic Calendar] Found 4 HIGH/MEDIUM impact USD events
[Chart Image] Generated 5 chart images

--- STAGE 2: Technical Analysis ---
[Technical Analysis] Gold (GC): bias=BULLISH, consolidating=false
[Technical Analysis] Nasdaq (NQ): bias=BEARISH, consolidating=true

--- STAGE 3: AI Trading Analysis ---
[Trading Analyst] Sending to claude-sonnet-4-20250514 with 5 instruments...
[Trading Analyst] Analysis complete: 4521 input, 3200 output tokens

--- STAGE 4: QA Validation (attempt 1/3) ---
[QA Checker] Validating with claude-haiku-4-5-20251001...
[QA Checker] Result: PASSED (confidence: 92%)

--- STAGE 5: Report Generation ---
[Report Builder] HTML email generated (48KB)

--- STAGE 6: Email Delivery ---
[Delivery] Sending to 1 recipients...
[Delivery] Email sent successfully: <abc123@gmail.com>

============================================================
[Pipeline] COMPLETED in 47.3s
[Pipeline] Tokens: 4521 input, 3200 output
[Pipeline] QA: PASSED (confidence: 92%)
[Pipeline] Delivery: SENT
============================================================
```

### Step 7: Verify the Email

Check your inbox. You should receive an email with subject line like:

```
Pre-Market: GC (green circle) | NQ (red circle) | ES (green circle) | SILVER (yellow circle) | BTC (green circle) - Mar 1
```

The email contains:
- Color-coded bias summary cards
- Economic events table
- PDH/PDL/PDC key levels table
- 21 EMA retest zones table
- Overnight swing points table
- Session statistics (Tokyo/London/Pre-NY)
- Embedded chart images
- Full AI trading analysis with graded setups
- QA confidence score and model attribution

### Step 8: Review in the Web UI

Navigate to:
- `http://localhost:3000/runs` -- View all pipeline runs with status and duration
- `http://localhost:3000/runs/{runId}` -- Drill into a specific run to see each agent's input/output
- `http://localhost:3000/config` -- Edit agents, instruments, workflow, and tools
- `http://localhost:3000/backtesting` -- View bias accuracy and setup distributions
- `http://localhost:3000/rfc` -- View this document

### Step 9: Let the Cron Run

Once you have verified the manual run works, the cron scheduler will automatically trigger the
pipeline at 5:30 AM PST every weekday. The schedule is configurable in `config/workflow.json`:

```json
{
  "schedule": "30 13 * * 1-5",
  "timezone": "America/Los_Angeles"
}
```

Note: The cron expression is in UTC. `30 13 * * 1-5` = 1:30 PM UTC = 5:30 AM PST.

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No market data | TwelveData API key invalid or rate limited | Check `.env`, verify key at twelvedata.com |
| LLM agent fails | Anthropic API key invalid or insufficient credits | Check `.env`, verify at console.anthropic.com |
| No charts | chart-img.com key invalid or quota exhausted | Check `.env`, disable chart-image agent in agents.json to skip |
| Email not sent | Gmail app password wrong or 2FA not enabled | Regenerate app password in Google Account settings |
| QA always fails | System prompt too strict or data format changed | Review QA corrections in run detail, adjust prompt |
| Pipeline hangs | TwelveData rate limit causing timeouts | Wait 60 seconds, retry. Consider upgrading TwelveData plan |

---

## Appendix A: File Structure

```
overnight-futures-analyst/
|
|-- config/
|   |-- agents.json          # Agent definitions (model, prompt, tools)
|   |-- tools.json           # Tool catalog (parameters, usage)
|   |-- workflow.json         # Pipeline stages, schedule, retries
|   |-- instruments.json      # Tradeable instruments
|
|-- data/
|   |-- ofa.db               # SQLite database (auto-created)
|
|-- src/
|   |-- lib/
|   |   |-- agents/
|   |   |   |-- market-data-collector.ts
|   |   |   |-- economic-calendar.ts
|   |   |   |-- chart-image.ts
|   |   |   |-- technical-analysis.ts
|   |   |   |-- trading-analyst.ts
|   |   |   |-- qa-checker.ts
|   |   |   |-- report-builder.ts
|   |   |   |-- delivery.ts
|   |   |
|   |   |-- tools/
|   |   |   |-- twelvedata.ts
|   |   |   |-- myfxbook.ts
|   |   |   |-- chart-img.ts
|   |   |   |-- gmail-sender.ts
|   |   |   |-- bar-aggregator.ts
|   |   |   |-- session-splitter.ts
|   |   |   |-- pdh-pdl-pdc.ts
|   |   |   |-- proximity-checker.ts
|   |   |   |-- rr-calculator.ts
|   |   |   |-- indicators/
|   |   |       |-- ema.ts
|   |   |       |-- bollinger.ts
|   |   |       |-- atr.ts
|   |   |       |-- swing-points.ts
|   |   |
|   |   |-- pipeline/
|   |   |   |-- orchestrator.ts
|   |   |
|   |   |-- config/
|   |   |   |-- loader.ts
|   |   |
|   |   |-- db/
|   |   |   |-- schema.ts
|   |   |   |-- index.ts
|   |   |
|   |   |-- audit/
|   |   |   |-- logger.ts
|   |   |
|   |   |-- types/
|   |       |-- market-data.ts
|   |       |-- analysis.ts
|   |       |-- agent.ts
|   |       |-- pipeline.ts
|   |       |-- index.ts
|   |
|   |-- app/
|       |-- page.tsx                        # Dashboard home
|       |-- layout.tsx                      # App layout
|       |-- runs/
|       |   |-- page.tsx                    # Run history list
|       |   |-- [runId]/page.tsx            # Run detail view
|       |-- config/
|       |   |-- page.tsx                    # Config overview
|       |   |-- agents/page.tsx             # Agent editor
|       |   |-- instruments/page.tsx        # Instrument editor
|       |   |-- workflow/page.tsx           # Workflow editor
|       |   |-- tools/page.tsx              # Tool viewer
|       |-- backtesting/page.tsx            # Backtesting dashboard
|       |-- rfc/page.tsx                    # This document
|       |-- api/
|           |-- pipeline/trigger/route.ts   # POST: trigger pipeline
|           |-- runs/route.ts               # GET: list runs
|           |-- runs/[runId]/route.ts       # GET: run detail
|           |-- config/agents/route.ts      # GET/PUT: agents config
|           |-- config/tools/route.ts       # GET/PUT: tools config
|           |-- config/workflow/route.ts     # GET/PUT: workflow config
|           |-- config/instruments/route.ts  # GET/PUT: instruments config
|           |-- backtesting/route.ts        # GET: backtesting data
|
|-- server.ts                 # Custom server with cron scheduler
|-- .env.example              # Environment variable template
|-- .gitignore
|-- package.json
|-- tsconfig.json
|-- RFC.md                    # This document
```

## Appendix B: Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Framework | Next.js | 16.x |
| Language | TypeScript | 5.x |
| UI | React | 19.x |
| Styling | Tailwind CSS | 4.x |
| Database | SQLite via better-sqlite3 | 12.x |
| ORM | Drizzle ORM | 0.45.x |
| LLM SDK | @anthropic-ai/sdk | 0.78.x |
| Email | nodemailer | 8.x |
| Cron | node-cron | 4.x |
| XML Parsing | fast-xml-parser | 5.x |
| Charts | Recharts | 3.x |
| Forms | React Hook Form + Zod | 7.x / 4.x |
| Process Manager | PM2 | latest |
| Reverse Proxy | nginx | latest |
| SSL | Let's Encrypt / certbot | latest |
