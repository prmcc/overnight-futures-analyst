export type PipelineStatus = 'running' | 'completed' | 'failed';
export type AgentInvocationStatus = 'running' | 'completed' | 'failed';

export interface PipelineRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: PipelineStatus;
  durationMs?: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  errorMessage?: string;
}

export interface AgentInvocation {
  id?: number;
  runId: string;
  agentId: string;
  agentName: string;
  stage: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: AgentInvocationStatus;
  modelUsed?: string;
  inputSummary?: string;
  outputSummary?: string;
  fullOutput?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  retryCount: number;
}

export interface BiasCall {
  id?: number;
  runId: string;
  date: string;
  instrumentId: string;
  predictedBias: string;
  confidencePct?: number;
  reasoning?: string;
  actualOutcome?: string;
  wasCorrect?: number;
  markedAt?: string;
}

export interface GradedSetup {
  id?: number;
  runId: string;
  date: string;
  instrumentId: string;
  grade: string;
  setupType: string;
  entryZone?: number;
  stopLoss?: number;
  takeProfit?: number;
  estimatedRR?: number;
  wasTriggered?: number;
  outcome?: string;
}
