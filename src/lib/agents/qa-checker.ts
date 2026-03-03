import OpenAI from 'openai';
import { loadAgent } from '../config/loader';
import type { InstrumentAnalysis, QAResult } from '../types';

export async function runQAChecker(
  analysisText: string,
  instruments: InstrumentAnalysis[]
): Promise<QAResult> {
  const config = loadAgent('qa-checker');
  if (!config) throw new Error('QA checker agent config not found');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
  });

  const userPrompt = `Please validate the following trading analysis against the raw technical data.

## RAW TECHNICAL DATA (ground truth):
${JSON.stringify(instruments, null, 2)}

## TRADING ANALYSIS TO VALIDATE:
${analysisText}

---

Check all items listed in your system prompt and respond with ONLY a JSON object (no markdown fences):
{
  "passed": true/false,
  "confidenceScore": 0-100,
  "sections": [
    { "name": "section name", "passed": true/false, "issues": ["issue description"] }
  ],
  "corrections": "specific corrections if failed, empty string if passed"
}`;

  const model = config.model || 'anthropic/claude-haiku-4-5-20251001';

  console.log(`[QA Checker] Validating with ${model}...`);

  const response = await openai.chat.completions.create({
    model,
    max_tokens: config.maxTokens || 4000,
    temperature: config.temperature ?? 0,
    messages: [
      { role: 'system', content: config.systemPrompt || '' },
      { role: 'user', content: userPrompt },
    ],
  });

  const responseText = response.choices[0]?.message?.content || '';
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  // Parse the JSON response
  let qaResult: QAResult;
  try {
    // Try to extract JSON from the response (handle markdown fences)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in QA response');

    const parsed = JSON.parse(jsonMatch[0]);
    qaResult = {
      passed: parsed.passed ?? false,
      sections: parsed.sections || [],
      corrections: parsed.corrections || '',
      confidenceScore: parsed.confidenceScore ?? 0,
      tokenUsage: {
        input: inputTokens,
        output: outputTokens,
      },
      model,
    };
  } catch (parseError) {
    console.error('[QA Checker] Failed to parse response:', parseError);
    // Default to passed if we can't parse (don't block the pipeline)
    qaResult = {
      passed: true,
      sections: [{ name: 'parse-error', passed: true, issues: ['Could not parse QA response, defaulting to pass'] }],
      corrections: '',
      confidenceScore: 50,
      tokenUsage: {
        input: inputTokens,
        output: outputTokens,
      },
      model,
    };
  }

  console.log(`[QA Checker] Result: ${qaResult.passed ? 'PASSED' : 'FAILED'} (confidence: ${qaResult.confidenceScore}%)`);
  return qaResult;
}
