import OpenAI from 'openai';
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

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
  });

  const userPrompt = buildUserPrompt(instruments, events, corrections);

  // Build message content with optional chart images
  const content: OpenAI.ChatCompletionContentPart[] = [
    { type: 'text', text: userPrompt },
  ];

  // Include chart images if available
  for (const img of chartImages) {
    if (img.base64) {
      const inst = instruments.find(i => i.instrumentId === img.instrumentId);
      content.push({
        type: 'text',
        text: `\n[Chart image for ${inst?.instrumentName || img.instrumentId}]:`,
      });
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${img.base64}`,
        },
      });
    }
  }

  const model = config.model || 'anthropic/claude-sonnet-4';

  console.log(`[Trading Analyst] Sending to ${model} with ${instruments.length} instruments...`);

  const response = await openai.chat.completions.create({
    model,
    max_tokens: config.maxTokens || 8000,
    temperature: config.temperature ?? 0.2,
    messages: [
      { role: 'system', content: config.systemPrompt || '' },
      { role: 'user', content },
    ],
  });

  const analysisText = response.choices[0]?.message?.content || '';
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  console.log(`[Trading Analyst] Analysis complete: ${inputTokens} input, ${outputTokens} output tokens`);

  return {
    analysis: analysisText,
    tokenUsage: {
      input: inputTokens,
      output: outputTokens,
    },
    model,
  };
}
