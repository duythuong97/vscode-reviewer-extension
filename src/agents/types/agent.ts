// Types for the agent task system
export interface AgentTaskContext<T = any> {
  taskId: string;
  input: T;
  workflow: Workflow;
}

export interface Workflow {
  id: string;
  title: string;
  steps: WorkflowStep[] | [];
  currentStep: number;
  summary: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowStep {
  id: string;
  type: "llm_decision" | "tool_execution" | "user_input";
  title: string;
  description: string;
  parameters?: Record<string, any>;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: any;
  error?: string;
  timestamp?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        required?: boolean;
      }
    >;
    required?: string[];
  };
}

export interface LLMDecision {
  nextStep: "continue" | "complete" | "error";
  workflow?: WorkflowStep[];
  toolCall?: {
    tool: string;
    parameters: Record<string, any>;
  };
  message?: string;
}
