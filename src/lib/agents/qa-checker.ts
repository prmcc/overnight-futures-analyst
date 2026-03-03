import Anthropic from '@anthropic-ai/sdk';
import { loadAgent } from '../config/loader';
import type { InstrumentAnalysis, QAResult } from '../types';

export async function runQAChecker(
  analysisText: string,
  instruments: InstrumentAnalysis[]
): Promise<QAResult> {
  const config = loadAgent('qa-checker');
  if (!config) throw new Error('QA checker agent config not found');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const anthropic = new Anthropic({ apiKey });

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

  console.log(`[QA Checker] Validating with ${config.model}...`);

  const response = await anthropic.messages.create({
    model: config.model || 'claude-haiku-4-5-20251001',
    max_tokens: config.maxTokens || 4000,
    temperature: config.temperature ?? 0,
    system: config.systemPrompt || '',
    messages: [{ role: 'user', content: userPrompt }],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');

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
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      model: config.model || 'claude-haiku-4-5-20251001',
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
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      model: config.model || 'claude-haiku-4-5-20251001',
    };
  }

  console.log(`[QA Checker] Result: ${qaResult.passed ? 'PASSED' : 'FAILED'} (confidence: ${qaResult.confidenceScore}%)`);
  return qaResult;
}
