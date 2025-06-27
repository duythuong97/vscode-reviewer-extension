import * as vscode from "vscode";
import { UnitTestAgent } from "../services/agents/UnitTestAgent";
import { AgentPanelProvider } from "../ui/panels/AgentPanelProvider";
import { UnitTestContext } from "../types/agent";

export class UnitTestCommands {
  private readonly agent: UnitTestAgent;
  private readonly agentPanel: AgentPanelProvider;

  constructor(agentPanel: AgentPanelProvider) {
    this.agent = new UnitTestAgent();
    this.agentPanel = agentPanel;

    // Subscribe to agent state changes
    this.agent.subscribe((state) => {
      this.updateAgentPanel(state);
    });
  }

  /**
   * Tạo unit test cho file hiện tại
   */
  async generateUnitTestsForCurrentFile(): Promise<void> {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      const document = editor.document;
      if (document.languageId !== "csharp") {
        vscode.window.showErrorMessage("Current file is not a C# file");
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
        "Unit test generation started. Check the Agent Panel for progress."
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate unit tests: ${error}`);
    }
  }

  /**
   * Tạo unit test cho file được chọn
   */
  async generateUnitTestsForSelectedFile(): Promise<void> {
    try {
      const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          "C# Files": ["cs"],
        },
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
        "Unit test generation started. Check the Agent Panel for progress."
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate unit tests: ${error}`);
    }
  }

  /**
   * Chạy lại agent workflow
   */
  async retryUnitTestGeneration(): Promise<void> {
    try {
      await this.agent.retry();
      vscode.window.showInformationMessage("Unit test generation restarted");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to retry: ${error}`);
    }
  }

  /**
   * Reset agent về trạng thái ban đầu
   */
  async resetUnitTestAgent(): Promise<void> {
    try {
      await this.agent.reset();

      vscode.window.showInformationMessage("Unit test agent reset");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to reset agent: ${error}`);
    }
  }

  /**
   * Cập nhật Agent Panel với trạng thái mới
   */
  private async updateAgentPanel(state: any): Promise<void> {
    try {
      const workflow = {
        id: "unit-test-generation",
        title: "Unit Test Generation",
        status: state.context.status,
        currentStep: this.getCurrentStep(state),
        steps: await this.getCurrentWorkflowSteps(state),
        summary: this.createWorkflowSummary(state),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await this.agentPanel.updateAgentWorkflow(workflow);
    } catch (error) {
      console.error("Failed to update agent panel:", error);
    }
  }

  /**
   * Lấy step hiện tại dựa trên state
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
   * Tạo workflow steps động bằng LLM
   */
  private async getCurrentWorkflowSteps(state: any): Promise<any[]> {
    if (state.value === "init_workflow") {
      return [
        {
          id: "init_workflow",
          title: "Initializing Workflow",
          description: "Analyzing code and determining optimal workflow steps",
          status: "running",
          command: "initWorkflow",
          priority: 1,
          required: true,
          estimatedTime: 10,
          result: null,
        },
      ];
    } else {
      const context = state.context as UnitTestContext;
      return context.workflow.steps.map((step: any, index: number) => ({
        ...step,
        status: this.getDynamicStepStatus(state, step, index),
        result: this.getDynamicStepResult(state, step),
      }));
    }
  }

  /**
   * Lấy trạng thái động cho step
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
   * Lấy kết quả động cho step
   */
  private getDynamicStepResult(state: any, step: any): string | null {
    const context = state.context;

    switch (step.command) {
      case "analyzeSourceCode":
        return context.className
          ? `Found class: ${context.className} with ${context.methods.length} methods`
          : null;
      case "generateUnitTests":
        return context.testCode ? "Test code generated successfully" : null;
      case "validateTests":
        return context.testResults.length > 0
          ? `${context.testResults.length} validation checks completed`
          : null;
      case "saveTestFile":
        return context.status === "testing"
          ? "Test file saved successfully"
          : null;
      case "runAllTests":
        return context.status === "completed"
          ? `${context.testResults.length} tests executed`
          : null;
      default:
        return null;
    }
  }

  /**
   * Lấy trạng thái của step (legacy method)
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
   * Tạo summary cho workflow
   */
  private createWorkflowSummary(state: any): string {
    const context = state.context;

    if (context.status === "completed") {
      return `Successfully generated unit tests for ${context.className}. ${context.testResults.length} tests executed.`;
    } else if (context.status === "error") {
      return `Error: ${context.errors.join(", ")}`;
    } else if (context.className) {
      return `Generating unit tests for ${context.className} with ${context.methods.length} methods...`;
    } else {
      return "Preparing to generate unit tests...";
    }
  }
}
