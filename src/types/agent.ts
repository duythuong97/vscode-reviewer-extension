export interface AgentStep {
  id: string;
  type: "review" | "apply" | "explain" | "refactor" | "test" | "custom";
  title: string;
  description: string;
  command: string;
  parameters?: Record<string, any>;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: any;
  error?: string;
  timestamp?: number;
}

export interface AgentWorkflow {
  id: string;
  steps: AgentStep[];
  currentStep: number;
  summary: string;
  status: "pending" | "running" | "completed" | "failed";
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
  category: "review" | "code" | "analysis" | "utility";
}

export interface TestResult {
  methodName: string;
  testName: string;
  status: "pass" | "fail" | "error";
  message?: string;
  executionTime?: number;
}

// Base context interface that all agents should extend
export interface BaseAgentContext {
  sourceCode: string;
  status: string;
  errors: string[];
  [key: string]: any; // Allow additional properties
}

// Base event interface
export interface BaseAgentEvent {
  type: string;
  [key: string]: any;
}

// Base tool interface
export interface AgentTool {
  name: string;
  description: string;
  parameters?: any;
}

// Base workflow step interface
export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  command: string;
  priority: number;
  required: boolean;
  estimatedTime: number;
  status?: string;
  result?: string | null;
}

export class UnitTestContext implements BaseAgentContext {
  sourceCode: string = "";
  className: string = "";
  methods: string[] = [];
  testCode: string = "";
  currentMethod: string = "";
  testResults: TestResult[] = [];
  errors: string[] = [];
  workflow: AgentWorkflow = {
    id: "",
    steps: [],
    currentStep: 0,
    summary: "",
    status: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
  status: string = "idle";
}
