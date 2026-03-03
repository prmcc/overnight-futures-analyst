export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  type: 'deterministic' | 'llm';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools: string[];
  enabled: boolean;
  retryMax?: number;
}

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required: boolean;
    default?: unknown;
  }>;
  usedBy: string[];
}

export interface WorkflowStage {
  id: string;
  name: string;
  agents: string[];
  parallel: boolean;
  dependsOn: string[];
}

export interface DeliveryChannels {
  telegram: boolean;
  email: boolean;
}

export interface WorkflowConfig {
  name: string;
  description: string;
  schedule: string;
  timezone: string;
  stages: WorkflowStage[];
  qaMaxRetries: number;
  emailRecipients: string[];
  deliveryChannels: DeliveryChannels;
}
