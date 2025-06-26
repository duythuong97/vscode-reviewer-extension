export interface AgentStep {
  id: string;
  type: 'review' | 'apply' | 'explain' | 'refactor' | 'test' | 'custom';
  title: string;
  description: string;
  command: string;
  parameters?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  timestamp?: number;
}

export interface AgentWorkflow {
  id: string;
  steps: AgentStep[];
  currentStep: number;
  summary: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface AgentStepResult {
  stepId: string;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

export interface AgentCommand {
  command: string;
  parameters?: Record<string, any>;
  description: string;
  category: 'review' | 'code' | 'analysis' | 'utility';
}