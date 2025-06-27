import { Actor, AnyActorLogic, createActor } from "xstate";
import { BaseLLMProvider } from "../llm/providers/BaseLLMProvider";
import { LLMProviderFactory } from "../llm/providers";
import { JsonExtractor } from "../../utils/json";
import { BaseAgentContext, AgentTool, WorkflowStep } from "../../types/agent";

export abstract class BaseAgent<
  TContext extends BaseAgentContext = BaseAgentContext
> {
  protected readonly actor: Actor<AnyActorLogic>;
  protected llmProvider: BaseLLMProvider;
  protected cachedWorkflowSteps: WorkflowStep[] = [];
  protected lastSourceCode: string = "";

  constructor() {
    this.llmProvider = LLMProviderFactory.createProvider();
    this.actor = createActor(this.createMachine());

    // Subscribe to state changes
    this.actor.subscribe((state: any) => {
      console.log(`${this.getAgentName()} State:`, state.value);
      console.log(`${this.getAgentName()} Context:`, state.context);
    });

    this.actor.start();
  }

  // Abstract methods that subclasses must implement
  protected abstract getAgentName(): string;
  protected abstract createMachine(): any;
  protected abstract getAvailableTools(): AgentTool[];
  protected abstract getWorkflowPrompt(context: TContext): string;
  protected abstract executeStep(
    step: AgentTool,
    context: TContext
  ): Promise<any>;

  // Common workflow execution
  protected async executeWorkflow(): Promise<void> {
    try {
      const state = this.actor.getSnapshot();
      const context = state.context;

      console.log(`${this.getAgentName()} - Current state:`, state.value);
      console.log(`${this.getAgentName()} - Current context:`, context);

      switch (state.value) {
        case "init_workflow":
          await this.executeInitWorkflow(context);
          break;
        case "completed":
          console.log(
            `${this.getAgentName()} - Workflow completed successfully`
          );
          break;
        case "error":
          console.log(
            `${this.getAgentName()} - Workflow ended with error:`,
            context.errors
          );
          break;
        case "idle":
          console.log(
            `${this.getAgentName()} - Agent is idle, waiting for start command`
          );
          break;
        default:
          await this.executeCustomStep(state.value, context);
      }
    } catch (error) {
      console.error(
        `${this.getAgentName()} - Workflow execution error:`,
        error
      );
      this.actor.send({
        type: "WORKFLOW_ERROR",
        error: (error as Error).message,
      });
    }
  }

  // Initialize workflow with LLM
  protected async executeInitWorkflow(context: TContext): Promise<void> {
    try {
      console.log(`${this.getAgentName()} - Initializing workflow with LLM...`);

      const workflowSteps = await this.determineWorkflowSteps(context);

      if (workflowSteps && workflowSteps.length > 0) {
        console.log(
          `${this.getAgentName()} - Workflow steps determined:`,
          workflowSteps
        );
        this.actor.send({ type: "WORKFLOW_READY" });

        // Continue to next step
        setTimeout(() => this.executeWorkflow(), 100);
      } else {
        throw new Error("Failed to determine workflow steps");
      }
    } catch (error) {
      console.error(`${this.getAgentName()} - Init workflow error:`, error);
      this.actor.send({
        type: "WORKFLOW_ERROR",
        error: (error as Error).message,
      });
    }
  }

  // Determine workflow steps using LLM
  protected async determineWorkflowSteps(
    context: TContext
  ): Promise<WorkflowStep[]> {
    const prompt = this.getWorkflowPrompt(context);

    try {
      const response = await this.llmProvider.callLLM(prompt);
      const suggestedSteps = JsonExtractor.extractJSONFromResponse(
        response.content
      );
      console.log(`${this.getAgentName()} - Suggested steps:`, suggestedSteps);

      if (Array.isArray(suggestedSteps) && suggestedSteps.length > 0) {
        return suggestedSteps;
      }

      throw new Error("Invalid workflow steps response from LLM");
    } catch (error) {
      throw new Error(`Failed to determine workflow steps: ${error}`);
    }
  }

  // Execute custom step (to be overridden by subclasses)
  protected async executeCustomStep(
    stepName: string,
    context: TContext
  ): Promise<void> {
    console.log(`${this.getAgentName()} - Executing custom step: ${stepName}`);
    // Subclasses should override this method
  }

  // Public API methods
  public async start(sourceCode: string): Promise<void> {
    // Reset state first to ensure clean start
    this.actor.send({ type: "RESET" });

    // Wait a bit for reset to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start new workflow
    this.actor.send({ type: "START", sourceCode });

    // Start the workflow
    await this.executeWorkflow();
  }

  public async reset(): Promise<void> {
    this.actor.send({ type: "RESET" });
    this.clearCache();
  }

  public async retry(): Promise<void> {
    this.actor.send({ type: "RETRY" });
  }

  public getState(): any {
    return this.actor.getSnapshot();
  }

  public subscribe(callback: (state: any) => void): () => void {
    return this.actor.subscribe(callback).unsubscribe;
  }

  // Cache management
  protected clearCache(): void {
    this.cachedWorkflowSteps = [];
    this.lastSourceCode = "";
    console.log(`${this.getAgentName()} - Cache cleared`);
  }

  public getCachedWorkflowSteps(): WorkflowStep[] {
    return this.cachedWorkflowSteps;
  }

  protected setCachedWorkflowSteps(steps: WorkflowStep[]): void {
    this.cachedWorkflowSteps = steps;
  }

  // Tool calling interface
  public async callTool(toolName: string, parameters: any): Promise<any> {
    const availableTools = this.getAvailableTools();
    const tool = availableTools.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    return await this.executeStep(tool, parameters);
  }

  // Get available tools for LLM prompt
  protected getToolsForPrompt(): string {
    const tools = this.getAvailableTools();
    return tools
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");
  }
}
