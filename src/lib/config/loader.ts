import fs from 'fs';
import path from 'path';
import type { AgentConfig, ToolConfig, WorkflowConfig, InstrumentConfig } from '../types';

const CONFIG_DIR = path.join(process.cwd(), 'config');

function readJsonFile<T>(filename: string): T {
  const filePath = path.join(CONFIG_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function writeJsonFile<T>(filename: string, data: T): void {
  const filePath = path.join(CONFIG_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadAgents(): AgentConfig[] {
  return readJsonFile<AgentConfig[]>('agents.json');
}

export function saveAgents(agents: AgentConfig[]): void {
  writeJsonFile('agents.json', agents);
}

export function loadAgent(id: string): AgentConfig | undefined {
  return loadAgents().find(a => a.id === id);
}

export function loadTools(): ToolConfig[] {
  return readJsonFile<ToolConfig[]>('tools.json');
}

export function saveTools(tools: ToolConfig[]): void {
  writeJsonFile('tools.json', tools);
}

export function loadWorkflow(): WorkflowConfig {
  return readJsonFile<WorkflowConfig>('workflow.json');
}

export function saveWorkflow(workflow: WorkflowConfig): void {
  writeJsonFile('workflow.json', workflow);
}

export function loadInstruments(): InstrumentConfig[] {
  return readJsonFile<InstrumentConfig[]>('instruments.json');
}

export function saveInstruments(instruments: InstrumentConfig[]): void {
  writeJsonFile('instruments.json', instruments);
}

export function getEnabledInstruments(): InstrumentConfig[] {
  return loadInstruments().filter(i => i.enabled);
}

export function getEnabledAgents(): AgentConfig[] {
  return loadAgents().filter(a => a.enabled);
}
