import * as vscode from "vscode";
import { AgentPanelProvider } from "../ui/panels/AgentPanelProvider";
import { BaseAgent } from "../services/agents/BaseAgent";
import { BaseAgentContext, WorkflowStep, AgentStep, AgentWorkflow } from "../types/agent";

export abstract class BaseCommands<
  TContext extends BaseAgentContext = BaseAgentContext
> {
  protected agent: BaseAgent<TContext>;
  protected agentPanel: AgentPanelProvider;
  protected cachedWorkflowSteps: WorkflowStep[] = [];
  private lastSourceCode: string = "";

  constructor(agent: BaseAgent<TContext>, agentPanel: AgentPanelProvider) {
    this.agent = agent;
    this.agentPanel = agentPanel;

    // Subscribe to agent state changes
    this.agent.subscribe((state) => {
      this.updateAgentPanel(state);
    });
  }

  // Abstract methods that subclasses must implement
  protected abstract getCommandName(): string;
  protected abstract getWorkflowTitle(): string;
  protected abstract getSupportedLanguages(): string[];

  /**
   * Generate content for current file
   */
  async generateForCurrentFile(): Promise<void> {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      const document = editor.document;
      const supportedLanguages = this.getSupportedLanguages();

      if (!supportedLanguages.includes(document.languageId)) {
        vscode.window.showErrorMessage(
          `Current file is not supported. Supported languages: ${supportedLanguages.join(
            ", "
          )}`
        );
        return;
      }

      const sourceCode = document.getText();
      if (!sourceCode.trim()) {
        vscode.window.showErrorMessage("Current file is empty");
        return;
      }

      // Start the agent workflow
      await this.agent.start(sourceCode);

      vscode.window.showInformationMessage(
        `${this.getCommandName()} started. Check the Agent Panel for progress.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start ${this.getCommandName()}: ${error}`
      );
    }
  }

  /**
   * Generate content for selected file
   */
  async generateForSelectedFile(): Promise<void> {
    try {
      const supportedLanguages = this.getSupportedLanguages();
      const filters: { [key: string]: string[] } = {};

      // Create filters for supported languages
      supportedLanguages.forEach((lang) => {
        const extensions = this.getLanguageExtensions(lang);
        if (extensions.length > 0) {
          filters[`${lang.toUpperCase()} Files`] = extensions;
        }
      });

      const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters,
      });

      if (!files || files.length === 0) {
        return;
      }

      const fileUri = files[0];
      const document = await vscode.workspace.openTextDocument(fileUri);
      const sourceCode = document.getText();

      if (!sourceCode.trim()) {
        vscode.window.showErrorMessage("Selected file is empty");
        return;
      }

      // Start the agent workflow
      await this.agent.start(sourceCode);

      vscode.window.showInformationMessage(
        `${this.getCommandName()} started. Check the Agent Panel for progress.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start ${this.getCommandName()}: ${error}`
      );
    }
  }

  /**
   * Retry agent workflow
   */
  async retry(): Promise<void> {
    try {
      await this.agent.retry();
      vscode.window.showInformationMessage(
        `${this.getCommandName()} restarted`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to retry: ${error}`);
    }
  }

  /**
   * Reset agent to initial state
   */
  async reset(): Promise<void> {
    try {
      await this.agent.reset();
      this.clearWorkflowCache();
      vscode.window.showInformationMessage(`${this.getCommandName()} reset`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to reset: ${error}`);
    }
  }

  /**
   * Call specific tool
   */
  async callTool(toolName: string, parameters: any): Promise<any> {
    try {
      return await this.agent.callTool(toolName, parameters);
    } catch (error) {
      vscode.window.showErrorMessage(`Tool call failed: ${error}`);
      throw error;
    }
  }

  /**
   * Update Agent Panel with new state
   */
  private async updateAgentPanel(state: any): Promise<void> {
    try {
      const workflowSteps = await this.createDynamicWorkflowSteps(state);
      const agentSteps: AgentStep[] = workflowSteps.map((step) => ({
        id: step.id,
        type: this.mapCommandToStepType(step.command),
        title: step.title,
        description: step.description,
        command: step.command,
        status: step.status as
          | "pending"
          | "running"
          | "completed"
          | "failed"
          | "skipped",
        result: step.result,
        timestamp: Date.now(),
      }));

      const workflow: AgentWorkflow = {
        id: `${this.getCommandName().toLowerCase()}-generation`,
        steps: agentSteps,
        currentStep: this.getCurrentStep(state),
        summary: this.createWorkflowSummary(state),
        status: this.mapStateToStatus(state.value),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await this.agentPanel.updateAgentWorkflow(workflow);
    } catch (error) {
      console.error(
        `Failed to update agent panel for ${this.getCommandName()}:`,
        error
      );
    }
  }

  /**
   * Map command to step type
   */
  private mapCommandToStepType(
    command: string
  ): "review" | "apply" | "explain" | "refactor" | "test" | "custom" {
    const commandToType: {
      [key: string]:
        | "review"
        | "apply"
        | "explain"
        | "refactor"
        | "test"
        | "custom";
    } = {
      analyzeSourceCode: "review",
      generateUnitTests: "test",
      validateTests: "test",
      saveTestFile: "apply",
      runAllTests: "test",
      initWorkflow: "custom",
    };

    return commandToType[command] || "custom";
  }

  /**
   * Map state to workflow status
   */
  private mapStateToStatus(
    state: string
  ): "pending" | "running" | "completed" | "failed" {
    switch (state) {
      case "idle":
        return "pending";
      case "completed":
        return "completed";
      case "error":
        return "failed";
      default:
        return "running";
    }
  }

  /**
   * Get current step based on state
   */
  private getCurrentStep(state: any): number {
    const stateMap: { [key: string]: number } = {
      idle: 0,
      init_workflow: 1,
      analyzing: 2,
      generating: 3,
      validating: 4,
      saving: 5,
      running: 6,
      completed: 7,
      error: -1,
    };

    return stateMap[state.value] || 0;
  }

  /**
   * Create dynamic workflow steps
   */
  private async createDynamicWorkflowSteps(
    state: any
  ): Promise<WorkflowStep[]> {
    try {
      const context = state.context;

      // Check cache - only call LLM if source code changed
      if (
        context.sourceCode === this.lastSourceCode &&
        this.cachedWorkflowSteps.length > 0
      ) {
        console.log(`Using cached workflow steps for ${this.getCommandName()}`);
        return this.cachedWorkflowSteps.map((step: any, index: number) => ({
          ...step,
          status: this.getDynamicStepStatus(state, step, index),
          result: this.getDynamicStepResult(state, step),
        }));
      }

      // If no source code or empty, return empty array
      if (!context.sourceCode || context.sourceCode.trim() === "") {
        console.log(`No source code available for ${this.getCommandName()}`);
        return [];
      }

      // If in init_workflow state, show loading
      if (state.value === "init_workflow") {
        return [
          {
            id: "init_workflow",
            title: "Initializing Workflow",
            description:
              "Analyzing code and determining optimal workflow steps",
            status: "running",
            command: "initWorkflow",
            priority: 1,
            required: true,
            estimatedTime: 10,
            result: null,
          },
        ];
      }

      // Use cached steps from agent
      const agentSteps = this.agent.getCachedWorkflowSteps();
      if (agentSteps.length > 0) {
        this.cachedWorkflowSteps = agentSteps;
        this.lastSourceCode = context.sourceCode;

        return agentSteps.map((step: any, index: number) => ({
          ...step,
          status: this.getDynamicStepStatus(state, step, index),
          result: this.getDynamicStepResult(state, step),
        }));
      }

      return [];
    } catch (error) {
      console.error(
        `Failed to create dynamic workflow steps for ${this.getCommandName()}:`,
        error
      );
      return [];
    }
  }

  /**
   * Get dynamic step status
   */
  private getDynamicStepStatus(state: any, step: any, index: number): string {
    const currentState = state.value;

    if (currentState === "error") {
      return "failed";
    }

    if (currentState === "completed") {
      return "completed";
    }

    // Map step command to state
    const commandToState: { [key: string]: string } = {
      analyzeSourceCode: "analyzing",
      generateUnitTests: "generating",
      validateTests: "validating",
      saveTestFile: "saving",
      runAllTests: "running",
    };

    const stepState = commandToState[step.command];
    if (!stepState) {
      return "pending";
    }

    return this.getStepStatus(state, stepState);
  }

  /**
   * Get dynamic step result
   */
  private getDynamicStepResult(state: any, step: any): string | null {
    const context = state.context;

    switch (step.command) {
      case "analyzeSourceCode":
        return context.className
          ? `Found class: ${context.className} with ${
              context.methods?.length || 0
            } methods`
          : null;
      case "generateUnitTests":
        return context.testCode ? "Test code generated successfully" : null;
      case "validateTests":
        return context.testResults?.length > 0
          ? `${context.testResults.length} validation checks completed`
          : null;
      case "saveTestFile":
        return context.status === "testing"
          ? "Test file saved successfully"
          : null;
      case "runAllTests":
        return context.status === "completed"
          ? `${context.testResults?.length || 0} tests executed`
          : null;
      default:
        return null;
    }
  }

  /**
   * Get step status (legacy method)
   */
  private getStepStatus(state: any, stepName: string): string {
    const currentState = state.value;
    const stepOrder = [
      "analyzing",
      "generating",
      "validating",
      "saving",
      "running",
    ];

    if (currentState === "error") {
      return "failed";
    }

    if (currentState === "completed") {
      return "completed";
    }

    const currentIndex = stepOrder.indexOf(currentState);
    const stepIndex = stepOrder.indexOf(stepName);

    if (stepIndex < currentIndex) {
      return "completed";
    } else if (stepIndex === currentIndex) {
      return "running";
    } else {
      return "pending";
    }
  }

  /**
   * Create workflow summary
   */
  private createWorkflowSummary(state: any): string {
    const context = state.context;

    if (context.status === "completed") {
      return `Successfully completed ${this.getCommandName()}.`;
    } else if (context.status === "error") {
      return `Error: ${context.errors.join(", ")}`;
    } else if (context.className) {
      return `Generating ${this.getCommandName()} for ${context.className}...`;
    } else {
      return `Preparing to generate ${this.getCommandName()}...`;
    }
  }

  /**
   * Clear workflow cache
   */
  private clearWorkflowCache(): void {
    this.cachedWorkflowSteps = [];
    this.lastSourceCode = "";
    console.log(`Workflow cache cleared for ${this.getCommandName()}`);
  }

  /**
   * Get language extensions for file filters
   */
  private getLanguageExtensions(language: string): string[] {
    const extensions: { [key: string]: string[] } = {
      csharp: ["cs"],
      typescript: ["ts", "tsx"],
      javascript: ["js", "jsx"],
      python: ["py"],
      java: ["java"],
      go: ["go"],
      rust: ["rs"],
      php: ["php"],
      ruby: ["rb"],
      swift: ["swift"],
      kotlin: ["kt"],
      scala: ["scala"],
      cpp: ["cpp", "cc", "cxx", "h", "hpp"],
      c: ["c", "h"],
    };

    return extensions[language] || [];
  }
}
