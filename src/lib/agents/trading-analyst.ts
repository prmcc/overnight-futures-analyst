import Anthropic from '@anthropic-ai/sdk';
import { loadAgent } from '../config/loader';
import type { InstrumentAnalysis, EconomicEvent, ChartImage, TradingAnalystOutput } from '../types';

function buildUserPrompt(
  instruments: InstrumentAnalysis[],
  events: EconomicEvent[],
  corrections?: string
): string {
  let prompt = 'Analyze the following overnight data and provide a detailed, graded trading plan for today\'s NY session:\n\n';

  for (const inst of instruments) {
    prompt += `## ${inst.instrumentName} Overnight Data:\n${JSON.stringify(inst, null, 2)}\n\n`;
  }

  prompt += `## Economic Events Today (High & Medium Impact):\n${JSON.stringify(events, null, 2)}\n\n---\n\n`;

  if (corrections) {
    prompt += `**IMPORTANT - QA CORRECTIONS FROM PREVIOUS ATTEMPT:**\n${corrections}\n\nPlease fix these issues in your revised analysis.\n\n---\n\n`;
  }

  prompt += `Please provide your analysis in these sections:

### 1. OVERNIGHT SESSION RECAP
For each instrument, summarize what happened in Tokyo, London, and Pre-NY sessions separately. Note the bias, range, and any notable price action for each session.

### 2. PREVIOUS DAY KEY LEVELS (PDH/PDL/PDC)
For each instrument, list the PDH, PDL, and PDC. State whether current price is above/below each level and what that implies for directional bias. Note the gap from PDC to overnight open and whether gap fill is likely.

### 3. EMA RETEST ZONES (21 EMA Levels)
For each instrument, list the exact 10/15/60 min EMA levels with their slope direction (RISING/FALLING/FLAT) and distance from current price. Highlight any proximity alerts. Note where EMA levels align with PDH/PDL/PDC.

### 4. SWING POINTS (For SFP Setups)
Identify key swing highs/lows from overnight that could be swept for SFP entries during NY session.

### 5. CONSOLIDATION WARNINGS
Flag any instruments where 15min is consolidating. These MUST avoid EMA retest setups.

### 6. BIAS & CONFIDENCE
For each instrument state BULLISH/BEARISH/NEUTRAL with confidence % and brief reasoning.

### 7. GRADED TRADING PLAN
List specific setups graded A+ through C:
- **A+** = Triple confluence (10+15 EMA retest + BB midline + PDH/PDL nearby + all EMAs aligned)
- **A** = Double confluence (EMA retest + BB midline cross + trending market)
- **B** = Single confluence (EMA retest only or SFP only)
- **C** = Low confluence (skip unless nothing else)

For each setup include: Grade, Instrument, Setup type, Entry zone, Confirmation trigger, Stop loss, Take profit targets, Estimated R:R, News risk overlap.

### 8. NEWS RISK WINDOWS
List specific times to go flat or avoid new entries.`;

  return prompt;
}

export async function runTradingAnalyst(
  instruments: InstrumentAnalysis[],
  events: EconomicEvent[],
  chartImages: ChartImage[],
  corrections?: string
): Promise<TradingAnalystOutput> {
  const config = loadAgent('trading-analyst');
  if (!config) throw new Error('Trading analyst agent config not found');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const anthropic = new Anthropic({ apiKey });
  const userPrompt = buildUserPrompt(instruments, events, corrections);

  // Build message content with optional chart images
  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
    { type: 'text', text: userPrompt },
  ];

  // Include chart images if available (Claude can analyze them)
  for (const img of chartImages) {
    if (img.base64) {
      const inst = instruments.find(i => i.instrumentId === img.instrumentId);
      content.push({
        type: 'text',
        text: `\n[Chart image for ${inst?.instrumentName || img.instrumentId}]:`,
      });
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: img.base64,
        },
      });
    }
  }

  console.log(`[Trading Analyst] Sending to ${config.model} with ${instruments.length} instruments...`);

  const response = await anthropic.messages.create({
    model: config.model || 'claude-sonnet-4-20250514',
    max_tokens: config.maxTokens || 8000,
    temperature: config.temperature ?? 0.2,
    system: config.systemPrompt || '',
    messages: [{ role: 'user', content }],
  });

  const analysisText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  console.log(`[Trading Analyst] Analysis complete: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output tokens`);

  return {
    analysis: analysisText,
    tokenUsage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
    model: config.model || 'claude-sonnet-4-20250514',
  };
}
