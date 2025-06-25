import * as vscode from "vscode";
import { PromptManager } from "../prompts";
import { debugOutputChannel, logDebug, handleError } from "../utils";

export class TemplateCommands {
  constructor(
    private promptManager: PromptManager
  ) {}

  public async useTemplate(): Promise<void> {
    try {
      // This would typically show template selection UI
      // For now, just log the action
      vscode.window.showInformationMessage("Use template (placeholder)");
    } catch (error) {
      handleError(error, "Using template");
    }
  }

  public async editTemplate(): Promise<void> {
    try {
      const promptFilePaths = this.promptManager.getPromptFilePaths();

      // Show quick pick to select which template to edit
      const templateOptions = [
        { label: "Code Review Prompt", value: "codeReview" },
        { label: "Ghost Text Prompt", value: "ghostText" },
        { label: "Custom Prompt", value: "customPrompt" },
        { label: "Coding Convention", value: "codingConvention" }
      ];

      const selected = await vscode.window.showQuickPick(templateOptions, {
        placeHolder: "Select template to edit"
      });

      if (selected) {
        const filePath = promptFilePaths[selected.value];
        if (filePath) {
          const document = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(document);

          logDebug(debugOutputChannel, `[Template] Editing template`, { template: selected.value, filePath });
        }
      }
    } catch (error) {
      handleError(error, "Editing template");
    }
  }

  public async addTemplate(): Promise<void> {
    try {
      // This would typically show template creation UI
      // For now, just log the action
      vscode.window.showInformationMessage("Add template (placeholder)");
    } catch (error) {
      handleError(error, "Adding template");
    }
  }

  public async showRightPanel(): Promise<void> {
    try {
      // This would typically show the right panel
      // For now, just log the action
      vscode.window.showInformationMessage("Show right panel (placeholder)");
    } catch (error) {
      handleError(error, "Showing right panel");
    }
  }
}