import { createMachine, assign, fromPromise, createActor } from "xstate";
import { BaseLLMProvider } from "../../services/llm/providers/BaseLLMProvider";
import { Logger, debugOutputChannel } from "../../utils/logging/Logger";
import { JsonExtractor } from "../../utils";
import {
  AgentTaskContext,
  ToolDefinition,
  WorkflowStep,
  LLMDecision,
} from "../types/agent";
import { LLMProviderFactory } from "../../services/llm/providers";
// Abstract base class for AI Agent Tasks
export abstract class AgentTaskBase<T = any> {
  protected context: AgentTaskContext<T>;
  protected tools: Map<string, ToolDefinition> = new Map();
  protected actor: any;
  private readonly llmProvider: BaseLLMProvider;
  private readonly onStateChange: (context: AgentTaskContext<T>) => void;

  constructor(
    taskId: string,
    onStateChange: (context: AgentTaskContext<T>) => void
  ) {
    this.context = {
      taskId,
      input: {} as T,
      workflow: {
        id: "",
        title: `${taskId}`,
        steps: [],
        currentStep: 0,
        summary: "",
        status: "pending",
        createdAt: 0,
        updatedAt: 0,
      },
    };

    this.initializeTools();
    this.createStateMachine();
    this.onStateChange = onStateChange;
    this.llmProvider = LLMProviderFactory.createProvider();
  }

  // Abstract methods that must be implemented by concrete classes
  protected abstract initializeTools(): void;
  protected abstract getSystemPrompt(): string;
  protected abstract validateInput(input: T): boolean;

  // Tool registration method
  protected registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  // Abstract method for tool execution - must be implemented by concrete classes
  protected abstract executeTool(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any>;

  // Create the XState state machine
  private createStateMachine(): void {
    const stateMachine = createMachine({
      /** @xstate-layout N4IgpgJg5mDOIC5QEMYDsAuAVZsDWAdAJYQA2YAxAJIByVWA+gOoDyASgNIBiAMi0wG0ADAF1EoAA4B7WEQxEpacSAAeiAIwBmIQQCsQg0IDsANiP6hJgCwAaEAE9EAJnMET6gJxHzmgBxCnD2sTAF8Qu1QwTBx8YjQ5BgB3KQAnPAAzUilEighFMDiANyk8Asjo3EIieIwk1IysxIRq4oBjZHlFYRFu5WlZTqUkVUQrXycCTV0PP18jJ19PIztHBCcAgicrDx3NI01AsIj0bEq4hOS0zOyKMBSU1IIJUg701IBbAnLT2OqL+uuTRaUnag26vWG-TkCiGoDUCDGEymM18cwWSxWzg8ugIRiEmnUWnmTi2YyOIG+MUIlwa2QYKQArmh4mgoLl8kUSmUTlSCDTAfSmSyoM00G0OjDwaI+jJoYplPDfNpJh5LDMPOpFr5dJi1r4PAR1EYgjN1CYTLpdJpyZSzvzGoLmdU2XcHikni8MG8Up9bbF7XTGU7WaLxWDRBDJLLBgqNGbfAQrE5PDt1EJFvtdVZ8YnLCTiUrvKFwhSeXaAQ6g8KKJGQFCY8N4YSTAmkymNemjZpdVMjLmTPmW5oTEJdFYrDay7EMFIpKQGGAVGBWgzBuy0AVgaUvlPCDO5wulyvBqGQRKuhHpZDozDYwjxpNprN5osvD39YbdAPNHtCbp9Zak5RD8e6zvOi7LquMK3PcjzPK8Hw7sBvL7uBR5QYop6gpKl5iNeAy3o2owPsiz7om+DiIJaJhuAcRhok42i6EBFSxK6qQUGwACiADKXFYLW9aEXCGiaDsiYeIxfjmCSni6osEk7B44xWlszHkmgUgQHAyh+ngMoEfKREIAAtCYupmQQhjWTZBhGCxIHEGQYAGXKsIjAiTi6oE6hWVoBi+Bapgki4Dm8n8tQBokrkNiJCAEgmgQtqiZjGqq5jeQOehBAcLhCFYX5WD+YXllclZCs6MXCR56WGkYni6PR2piQV759iYByLASlr6vRJXTmBh6QbFdY3kZcUJZsQSooF3g7MYOqUQgY46NqMwFWOujqIxvj9YQrRSO8zxgBgkBVeNHnqLo6yGl2hLNvsZo9mO-brMmY5Kto9klnpBDsSk53uU2106ISj33WYBLmUtX40ZaknJh445aJ4YRhEAA */
      id: "agentTask",
      initial: "idle",
      context: this.context,
      states: {
        idle: {
          on: {
            INIT_WORKFLOW: {
              target: "init_workflow",
              description: "Initialize workflow",
              actions: assign({
                workflow: {
                  id: "",
                  title: `${this.context.taskId}`,
                  steps: [
                    {
                      id: "step1",
                      type: "llm_decision",
                      title: "Initialize workflow",
                      description: "Call LLM to initialize workflow",
                      status: "running",
                    },
                  ],
                  currentStep: 0,
                  summary: `${this.context.taskId}`,
                  status: "pending",
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
                input: ({ event }) => event.input,
              }),
            },
          },
        },
        init_workflow: {
          entry: assign({
            workflow: ({ context }) => ({
              ...context.workflow,
              currentStep: 0,
            }),
          }),
          invoke: {
            src: fromPromise(async ({ input }) => {
              // input here is the context passed from the machine
              return await this.initializeWorkflow(input.input);
            }),
            input: ({ context }) => context,
            onDone: {
              target: "workflow_running",
              actions: assign({
                workflow: ({ context, event }) => ({
                  ...context.workflow,
                  steps: [
                    ...(context.workflow?.steps ?? []),
                    ...(event.output as WorkflowStep[]),
                  ].map((step, index) =>
                    index === context.workflow.currentStep
                      ? {
                          ...step,
                          result: "LLM generated workflow",
                          status: "completed" as const,
                          timestamp: Date.now(),
                        }
                      : step
                  ),
                  currentStep: context.workflow.currentStep + 1,
                }),
              }),
            },
            onError: {
              target: "error",
              actions: assign({
                workflow: ({ context, event }) => ({
                  ...context.workflow,
                  steps: context.workflow.steps.map((step, index) =>
                    index === context.workflow.currentStep
                      ? { ...step, error: (event.error as Error).message }
                      : step
                  ),
                }),
              }),
            },
          },
        },
        workflow_running: {
          always: [
            {
              guard: ({ context }) =>
                context.workflow.currentStep >= context.workflow?.steps?.length,
              target: "completed",
              description: "Workflow completed",
            },
          ],
          invoke: {
            src: fromPromise(async ({ input }) => {
              // input here is the context passed from the machine
              const context = input as AgentTaskContext<T>;
              const currentStep =
                context.workflow?.steps[context.workflow.currentStep];
              return await this.executeStep(currentStep, context);
            }),
            input: ({ context }) => context,
            onDone: {
              target: "workflow_running",
              actions: assign({
                workflow: ({ context, event }) => ({
                  ...context.workflow,
                  currentStep: context.workflow.currentStep + 1,
                  steps: context.workflow.steps.map((step, index) =>
                    index === context.workflow.currentStep
                      ? { ...step, result: event.output }
                      : step
                  ),
                }),
              }),
            },
            onError: {
              target: "error",
              actions: assign({
                workflow: ({ context, event }) => ({
                  ...context.workflow,
                  steps: context.workflow.steps.map((step, index) =>
                    index === context.workflow.currentStep
                      ? { ...step, error: (event.error as Error).message }
                      : step
                  ),
                }),
              }),
            },
          },
        },
        tool_execution: {
          invoke: {
            src: fromPromise(async ({ input }) => {
              // input here is the context passed from the machine
              const context = input as AgentTaskContext<T>;
              const currentStep =
                context.workflow?.steps[context.workflow.currentStep];
              if (
                currentStep.type === "tool_execution" &&
                currentStep.parameters
              ) {
                return await this.executeTool(
                  currentStep.parameters.toolName,
                  currentStep.parameters.parameters
                );
              }
              throw new Error("Invalid tool execution step");
            }),
            input: ({ context }) => context,
            onDone: {
              target: "workflow_running",
              actions: assign({
                workflow: ({ context, event }) => ({
                  ...context.workflow,
                  currentStep: context.workflow.currentStep + 1,
                  steps: context.workflow.steps.map((step, index) =>
                    index === context.workflow.currentStep
                      ? { ...step, result: event.output }
                      : step
                  ),
                }),
              }),
            },
            onError: {
              target: "error",
              actions: assign({
                workflow: ({ context, event }) => ({
                  ...context.workflow,
                  steps: context.workflow.steps.map((step, index) =>
                    index === context.workflow.currentStep
                      ? { ...step, error: (event.error as Error).message }
                      : step
                  ),
                }),
              }),
            },
          },
        },
        completed: {
          type: "final",
        },
        error: {
          on: {
            RESET: {
              target: "idle",
              actions: assign({
                workflow: {
                  id: "",
                  title: "",
                  steps: [],
                  currentStep: 0,
                  summary: "",
                  status: "pending" as const,
                  createdAt: 0,
                  updatedAt: 0,
                },
              }),
            },
          },
        },
      },
    });

    // Create actor from the machine
    this.actor = createActor(stateMachine);
    this.actor.start();
    this.actor.subscribe((state: any) => {
      console.log("Task State:", state.value);
      console.log("Task Context:", state.context);
      this.onStateChange(state.context);
    });
  }

  // Initialize workflow using LLM
  private async initializeWorkflow(input: T): Promise<WorkflowStep[]> {
    console.log("Initializing workflow", input);
    if (!input || !this.validateInput(input)) {
      throw new Error("Invalid input for task");
    }

    const systemPrompt = this.getSystemPrompt();
    const toolsDescription = this.getToolsDescription();

    const prompt = `
${systemPrompt}

Available tools:
${toolsDescription}

Task input: ${JSON.stringify(input, null, 2)}

Please create a workflow to complete this task. Return a JSON array of workflow steps.
Each step should have:
- id: unique identifier
- type: "llm_decision", "tool_execution", or "user_input"
- title: brief description
- description: detailed description
- parameters: any required parameters

Example format:
[
  {
    "id": "step1",
    "type": "tool_execution",
    "title": "Read file content",
    "description": "Read the content of the specified source code file to analyze its structure",
    "parameters": {
      "toolName": "readFile",
      "parameters": {
        "filePath": "src/example.ts"
      }
    }
  },
  {
    "id": "step2",
    "type": "tool_execution",
    "title": "Generate unit tests",
    "description": "Generate unit tests for the specified file",
    "parameters": {
      "toolName": "generateUnitTests",
      "parameters": {
        "filePath": "src/example.ts"
      }
    }
  }
]
`;

    try {
      const response = await this.llmProvider.callLLM(prompt);
      const workflow = JsonExtractor.extractJSONFromResponse(response.content);

      if (!Array.isArray(workflow)) {
        throw new Error("LLM response is not a valid workflow array");
      }

      return workflow.map((step, index) => ({
        ...step,
        status: "pending" as const,
      }));
    } catch (error) {
      throw new Error(
        `Failed to initialize workflow: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Execute a single workflow step
  private async executeStep(
    step: WorkflowStep,
    context: AgentTaskContext<T>
  ): Promise<any> {
    step.status = "running";

    try {
      switch (step.type) {
        case "llm_decision":
          return await this.executeLLMDecision(step, context);
        case "tool_execution":
          return await this.executeToolStep(step, context);
        case "user_input":
          return await this.executeUserInputStep(step, context);
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }
    } catch (error) {
      step.status = "failed";
      step.error = error instanceof Error ? error.message : "Unknown error";
      throw error;
    }
  }

  // Execute LLM decision step
  private async executeLLMDecision(
    step: WorkflowStep,
    context: AgentTaskContext<T>
  ): Promise<any> {
    const prompt = `
${this.getSystemPrompt()}

Current context:
- Task ID: ${context.taskId}
- Current step: ${step.title}
- Previous results: ${this.getResults()}

Step description: ${step.description}

Please analyze the current state and decide the next action. Return a JSON object with:
- nextStep: "continue", "complete", or "error"
- id: unique identifier
- type: "llm_decision", "tool_execution", or "user_input"
- title: brief description
- description: detailed description
- parameters: any required parameters

Available tools:
${this.getToolsDescription()}
`;

    const response = await this.llmProvider.callLLM(prompt);
    const decision: LLMDecision = JsonExtractor.extractJSONFromResponse(
      response.content
    );

    step.status = "completed";
    step.result = decision;

    return decision;
  }

  // Execute tool step
  private async executeToolStep(
    step: WorkflowStep,
    context: AgentTaskContext<T>
  ): Promise<any> {
    if (!step.parameters?.toolName) {
      throw new Error("Tool name is required for tool execution step");
    }

    const toolName = step.parameters.toolName;
    const parameters = step.parameters.parameters || {};

    if (!this.tools.has(toolName)) {
      throw new Error(`Tool '${toolName}' is not registered`);
    }

    const result = await this.executeTool(toolName, parameters);

    step.status = "completed";
    step.result = result;

    return result;
  }

  // Execute user input step
  private async executeUserInputStep(
    step: WorkflowStep,
    context: AgentTaskContext<T>
  ): Promise<any> {
    // This would typically wait for user input
    // For now, we'll mark it as completed and return the step description
    step.status = "completed";
    step.result = {
      message: "User input step completed",
      description: step.description,
    };

    return step.result;
  }

  // Get tools description for LLM
  private getToolsDescription(): string {
    return Array.from(this.tools.values())
      .map(
        (tool) => `
Tool: ${tool.name}
Description: ${tool.description}
Parameters: ${JSON.stringify(tool.parameters, null, 2)}
      `
      )
      .join("\n");
  }

  // #region Public methods for task management
  public async start(input: T): Promise<void> {
    this.actor.send({ type: "RESET" });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Starting task", this.context.taskId, input);
    this.actor.send({ type: "INIT_WORKFLOW", input });
  }

  public getState(): any {
    return this.actor.getSnapshot();
  }

  public getResults(): string {
    return this.context.workflow.steps
      .map((step) => step.result)
      .map((result) => JSON.stringify(result, null, 2))
      .join("\n");
  }

  public getErrors(): string[] {
    return this.context.workflow.steps.map((step) => step.error ?? "");
  }

  public reset(): void {
    this.actor.send({ type: "RESET" });
  }

  // #endregion

  // Method to handle user input during workflow
  public async handleUserInput(input: any): Promise<void> {
    this.actor.send({ type: "USER_INPUT", input });
  }
}
