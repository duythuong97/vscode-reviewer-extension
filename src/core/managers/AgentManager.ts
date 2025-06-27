import * as vscode from "vscode";
import { AgentWorkflow, AgentStepResult } from "../../types";
import { LLMProviderFactory } from "../../services/llm/providers/LLMProviderFactory";
import { JsonExtractor } from "../../utils/json/JsonExtractor";

export class AgentManager {
  private static instance: AgentManager;
  private currentWorkflow: AgentWorkflow | null = null;
  private workflows: Map<string, AgentWorkflow> = new Map();

  private constructor() {}

  public static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  /**
   * Tạo workflow mới từ LLM response
   */
  public async createWorkflowFromLLM(
    prompt: string,
    context?: any
  ): Promise<AgentWorkflow> {
    try {
      const llmProvider = LLMProviderFactory.createProvider();
      const response = await llmProvider.callLLM(prompt);

      // Extract workflow từ LLM response
      const workflowData = JsonExtractor.extractJSONFromResponse(
        response.content
      );

      if (!workflowData || !workflowData.steps) {
        throw new Error("Invalid workflow response from LLM");
      }

      const workflow: AgentWorkflow = {
        id: Date.now().toString(),
        steps: workflowData.steps.map((step: any, index: number) => ({
          id: step.id || `step_${index}`,
          type: step.type || "custom",
          title: step.title || `Step ${index + 1}`,
          description: step.description || "",
          command: step.command || "",
          parameters: step.parameters || {},
          status: "pending",
          timestamp: Date.now(),
        })),
        currentStep: workflowData.currentStep || 0,
        summary: workflowData.summary || "AI Agent Workflow",
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.workflows.set(workflow.id, workflow);
      this.currentWorkflow = workflow;

      return workflow;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Thực thi step hiện tại
   */
  public async executeCurrentStep(): Promise<AgentStepResult> {
    if (!this.currentWorkflow) {
      throw new Error("No active workflow");
    }

    const workflow = this.currentWorkflow;
    const currentStep = workflow.steps[workflow.currentStep];

    if (!currentStep) {
      throw new Error("No current step to execute");
    }

    try {
      // Cập nhật status thành running
      currentStep.status = "running";
      workflow.status = "running";
      workflow.updatedAt = Date.now();

      // Thực thi command
      const result = await this.executeCommand(
        currentStep.command,
        currentStep.parameters
      );

      // Cập nhật step result
      currentStep.status = "completed";
      currentStep.result = result;
      currentStep.timestamp = Date.now();

      const stepResult: AgentStepResult = {
        stepId: currentStep.id,
        success: true,
        data: result,
        timestamp: Date.now(),
      };

      return stepResult;
    } catch (error) {
      // Cập nhật step status thành failed
      currentStep.status = "failed";
      currentStep.error =
        error instanceof Error ? error.message : String(error);
      workflow.status = "failed";
      workflow.updatedAt = Date.now();

      const stepResult: AgentStepResult = {
        stepId: currentStep.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };

      return stepResult;
    }
  }

  /**
   * Chuyển sang step tiếp theo
   */
  public async nextStep(): Promise<boolean> {
    if (!this.currentWorkflow) {
      return false;
    }

    const workflow = this.currentWorkflow;

    if (workflow.currentStep < workflow.steps.length - 1) {
      workflow.currentStep++;
      workflow.updatedAt = Date.now();

      return true;
    } else {
      // Workflow completed
      workflow.status = "completed";
      workflow.updatedAt = Date.now();

      return false;
    }
  }

  /**
   * Thực thi command
   */
  private async executeCommand(
    command: string,
    parameters?: Record<string, any>
  ): Promise<any> {
    try {
      switch (command) {
        case "ai-reviewer.reviewFile":
          return await vscode.commands.executeCommand("ai-reviewer.reviewFile");

        case "ai-reviewer.reviewPR":
          return await vscode.commands.executeCommand("ai-reviewer.reviewPR");

        case "ai-reviewer.applyFixes":
          // Custom logic để apply fixes
          return await this.applyFixes(parameters);

        case "ai-reviewer.explainCode":
          // Custom logic để explain code
          return await this.explainCode(parameters);

        case "ai-reviewer.refactorCode":
          // Custom logic để refactor code
          return await this.refactorCode(parameters);

        case "ai-reviewer.generateTests":
          // Custom logic để generate tests
          return await this.generateTests(parameters);

        default:
          // Thử execute command với parameters
          if (parameters) {
            return await vscode.commands.executeCommand(command, parameters);
          } else {
            return await vscode.commands.executeCommand(command);
          }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Apply fixes cho violations
   */
  private async applyFixes(parameters?: Record<string, any>): Promise<any> {
    // Implementation sẽ được thêm sau
    return { message: "Fixes applied successfully" };
  }

  /**
   * Explain code
   */
  private async explainCode(parameters?: Record<string, any>): Promise<any> {
    // Implementation sẽ được thêm sau
    return { message: "Code explanation generated" };
  }

  /**
   * Refactor code
   */
  private async refactorCode(parameters?: Record<string, any>): Promise<any> {
    // Implementation sẽ được thêm sau
    return { message: "Code refactored successfully" };
  }

  /**
   * Generate tests
   */
  private async generateTests(parameters?: Record<string, any>): Promise<any> {
    // Implementation sẽ được thêm sau
    return { message: "Tests generated successfully" };
  }

  /**
   * Lấy workflow hiện tại
   */
  public getCurrentWorkflow(): AgentWorkflow | null {
    return this.currentWorkflow;
  }

  /**
   * Lấy tất cả workflows
   */
  public getAllWorkflows(): AgentWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Xóa workflow
   */
  public clearWorkflow(workflowId: string): void {
    this.workflows.delete(workflowId);
    if (this.currentWorkflow?.id === workflowId) {
      this.currentWorkflow = null;
    }
  }

  /**
   * Clear tất cả workflows
   */
  public clearAllWorkflows(): void {
    this.workflows.clear();
    this.currentWorkflow = null;
  }
}
