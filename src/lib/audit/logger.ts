import { db } from '../db';
import { agentInvocations } from '../db/schema';
import type { AgentInvocationStatus } from '../types';

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '... [truncated]';
}

export async function logAgentStart(
  runId: string,
  agentId: string,
  agentName: string,
  stage: number,
  input: unknown,
  retryCount = 0
): Promise<number> {
  const result = db.insert(agentInvocations).values({
    runId,
    agentId,
    agentName,
    stage,
    startedAt: new Date().toISOString(),
    status: 'running',
    inputSummary: truncate(JSON.stringify(input), 2000),
    retryCount,
  }).returning({ id: agentInvocations.id }).get();

  return result.id;
}

export async function logAgentComplete(
  invocationId: number,
  output: unknown,
  options?: {
    modelUsed?: string;
    inputTokens?: number;
    outputTokens?: number;
  }
): Promise<void> {
  const completedAt = new Date().toISOString();
  const outputStr = JSON.stringify(output);

  db.update(agentInvocations)
    .set({
      completedAt,
      status: 'completed' as AgentInvocationStatus,
      outputSummary: truncate(outputStr, 5000),
      fullOutput: outputStr,
      modelUsed: options?.modelUsed,
      inputTokens: options?.inputTokens,
      outputTokens: options?.outputTokens,
    })
    .where(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agentInvocations.id as any).equals
        ? undefined as never
        : undefined as never
    );

  // Use raw SQL for simplicity with better-sqlite3
  const stmt = db.$client.prepare(
    `UPDATE agent_invocations SET
      completed_at = ?, status = 'completed',
      output_summary = ?, full_output = ?,
      model_used = ?, input_tokens = ?, output_tokens = ?,
      duration_ms = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)
    WHERE id = ?`
  );
  stmt.run(
    completedAt,
    truncate(outputStr, 5000),
    outputStr,
    options?.modelUsed ?? null,
    options?.inputTokens ?? null,
    options?.outputTokens ?? null,
    completedAt,
    invocationId
  );
}

export async function logAgentError(
  invocationId: number,
  error: string
): Promise<void> {
  const completedAt = new Date().toISOString();
  const stmt = db.$client.prepare(
    `UPDATE agent_invocations SET
      completed_at = ?, status = 'failed',
      error_message = ?,
      duration_ms = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)
    WHERE id = ?`
  );
  stmt.run(completedAt, error, completedAt, invocationId);
}
