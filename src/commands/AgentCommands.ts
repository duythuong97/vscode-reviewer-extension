import * as vscode from "vscode";
import { Logger, VSCodeUtils, debugOutputChannel } from "../utils";
import { AgentManager } from "../core/managers/AgentManager";
import { AgentPanelProvider } from "../ui/panels/AgentPanelProvider";

export class AgentCommands {
  constructor(
    private agentPanelProvider: AgentPanelProvider
  ) {}

  /**
   * Tạo và thực thi AI Agent workflow
   */
  public async createAgentWorkflow(): Promise<void> {
    try {
      const agentManager = AgentManager.getInstance();

      // Tạo prompt cho LLM để tạo workflow
      const prompt = this.createWorkflowPrompt();

      // Tạo workflow từ LLM
      const workflow = await agentManager.createWorkflowFromLLM(prompt);

      // Hiển thị workflow trong review panel
      await this.agentPanelProvider.sendAgentWorkflow(workflow);

      VSCodeUtils.showSuccess(`AI Agent workflow created with ${workflow.steps.length} steps`);
    } catch (error) {
      VSCodeUtils.handleError(error, "Creating AI Agent workflow");
    }
  }

  /**
   * Thực thi step hiện tại
   */
  public async executeCurrentStep(): Promise<void> {
    try {
      const agentManager = AgentManager.getInstance();

      // Thực thi step hiện tại
      const result = await agentManager.executeCurrentStep();

      // Cập nhật UI với kết quả
      await this.agentPanelProvider.updateAgentStepResult(result);

      if (result.success) {
        VSCodeUtils.showSuccess(`Step completed: ${result.stepId}`);
      } else {
        VSCodeUtils.showError(`Step failed: ${result.error}`);
      }
    } catch (error) {
      VSCodeUtils.handleError(error, "Executing AI Agent step");
    }
  }

  /**
   * Thực thi step cụ thể theo stepId
   */
  public async executeStep(stepId: string): Promise<void> {
    try {
      const agentManager = AgentManager.getInstance();
      const workflow = agentManager.getCurrentWorkflow();

      if (!workflow) {
        VSCodeUtils.showError("No active workflow to execute step");
        return;
      }

      // Tìm step theo stepId
      const stepIndex = workflow.steps.findIndex(step => step.id === stepId);
      if (stepIndex === -1) {
        VSCodeUtils.showError(`Step with ID '${stepId}' not found`);
        return;
      }

      // Lưu step hiện tại
      const currentStepIndex = workflow.currentStep;

      // Chuyển đến step cần thực thi
      workflow.currentStep = stepIndex;

      // Thực thi step
      const result = await agentManager.executeCurrentStep();

      // Cập nhật UI với kết quả
      await this.agentPanelProvider.updateAgentStepResult(result);

      // Khôi phục step hiện tại
      workflow.currentStep = currentStepIndex;

      // Cập nhật UI với workflow
      await this.agentPanelProvider.updateAgentWorkflow(workflow);

      if (result.success) {
        VSCodeUtils.showSuccess(`Step '${stepId}' completed successfully`);
      } else {
        VSCodeUtils.showError(`Step '${stepId}' failed: ${result.error}`);
      }
    } catch (error) {
      VSCodeUtils.handleError(error, `Executing AI Agent step ${stepId}`);
    }
  }

  /**
   * Chuyển sang step tiếp theo
   */
  public async nextStep(): Promise<void> {
    try {
      const agentManager = AgentManager.getInstance();

      // Chuyển sang step tiếp theo
      const hasNext = await agentManager.nextStep();

      if (hasNext) {
        // Cập nhật UI với step mới
        await this.agentPanelProvider.updateAgentWorkflow(agentManager.getCurrentWorkflow());
        VSCodeUtils.showSuccess("Moved to next step");
      } else {
        // Workflow completed
        await this.agentPanelProvider.completeAgentWorkflow();
        VSCodeUtils.showSuccess("AI Agent workflow completed!");
      }
    } catch (error) {
      VSCodeUtils.handleError(error, "Moving to next AI Agent step");
    }
  }

  /**
   * Thực thi toàn bộ workflow
   */
  public async executeFullWorkflow(): Promise<void> {
    try {
      const agentManager = AgentManager.getInstance();
      const workflow = agentManager.getCurrentWorkflow();

      if (!workflow) {
        VSCodeUtils.showError("No active workflow to execute");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "AI Agent - Executing Workflow",
          cancellable: true,
        },
        async (progress, cancellationToken) => {
          for (let i = 0; i < workflow.steps.length; i++) {
            if (cancellationToken.isCancellationRequested) {
              break;
            }

            const step = workflow.steps[i];
            progress.report({
              message: `Step ${i + 1}/${workflow.steps.length}: ${step.title}`,
              increment: 100 / workflow.steps.length,
            });

            try {
              // Thực thi step
              const result = await agentManager.executeCurrentStep();

              // Cập nhật UI
              await this.agentPanelProvider.updateAgentStepResult(result);

              // Chuyển sang step tiếp theo (trừ step cuối)
              if (i < workflow.steps.length - 1) {
                await agentManager.nextStep();
                await this.agentPanelProvider.updateAgentWorkflow(workflow);
              }

              // Delay nhỏ để user có thể theo dõi
              await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
              VSCodeUtils.showError(`Step ${i + 1} failed: ${error}`);
              break;
            }
          }
        }
      );

      VSCodeUtils.showSuccess("AI Agent workflow execution completed");

    } catch (error) {
      VSCodeUtils.handleError(error, "Executing AI Agent workflow");
    }
  }

  /**
   * Clear workflow hiện tại
   */
  public async clearWorkflow(): Promise<void> {
    try {
      const agentManager = AgentManager.getInstance();
      const workflow = agentManager.getCurrentWorkflow();

      if (workflow) {
        agentManager.clearWorkflow(workflow.id);
        await this.agentPanelProvider.clearAgentWorkflow();
        VSCodeUtils.showSuccess("AI Agent workflow cleared");
      } else {
        VSCodeUtils.showWarning("No active workflow to clear");
      }
    } catch (error) {
      VSCodeUtils.handleError(error, "Clearing AI Agent workflow");
    }
  }

  /**
   * Tạo prompt cho LLM để tạo workflow
   */
  private createWorkflowPrompt(): string {
    return `You are an AI coding assistant. Create a workflow to help with code review and improvement.

Available commands:
- ai-reviewer.reviewFile: Review current file for issues
- ai-reviewer.reviewPR: Review all changed files in PR
- ai-reviewer.applyFixes: Apply suggested fixes to violations
- ai-reviewer.explainCode: Explain code functionality
- ai-reviewer.refactorCode: Refactor code for better structure
- ai-reviewer.generateTests: Generate unit tests

Please create a JSON workflow with steps. Each step should have:
- id: unique identifier
- type: review, apply, explain, refactor, test, or custom
- title: human readable title
- description: what this step does
- command: the command to execute
- parameters: optional parameters for the command

Example response format:
{
  "steps": [
    {
      "id": "step1",
      "type": "review",
      "title": "Review Code Quality",
      "description": "Analyze current file for code quality issues",
      "command": "ai-reviewer.reviewFile",
      "parameters": {}
    },
    {
      "id": "step2",
      "type": "apply",
      "title": "Apply Suggested Fixes",
      "description": "Apply the suggested code improvements",
      "command": "ai-reviewer.applyFixes",
      "parameters": {
        "autoApply": true
      }
    }
  ],
  "currentStep": 0,
  "summary": "Code review and improvement workflow"
}

Create a workflow that makes sense for code review and improvement.`;
  }
}