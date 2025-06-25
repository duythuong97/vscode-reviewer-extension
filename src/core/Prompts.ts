import * as vscode from "vscode";
import { ConfigManager } from "../core/managers/ConfigManager";
import { WorkspaceFileTemplate } from "../core/workspaceFileTemplate";
import { VSCodeUtils } from "../utils";
import * as path from "path";

export class PromptManager {
  private static instance: PromptManager;
  private configManager: ConfigManager;
  private workspaceFileTemplate: WorkspaceFileTemplate;

  private constructor() {
    this.configManager = ConfigManager.getInstance();
    this.workspaceFileTemplate = WorkspaceFileTemplate.getInstance();
  }

  public static getInstance(): PromptManager {
    if (!PromptManager.instance) {
      PromptManager.instance = new PromptManager();
    }
    return PromptManager.instance;
  }

  private getWorkspacePath(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].uri.fsPath;
    }
    throw new Error("No workspace folder found");
  }

  private readPromptFile(filePath: string): string {
    return this.workspaceFileTemplate.readFile(filePath);
  }

  public getCodeReviewPrompt(
    document: vscode.TextDocument,
    code: string
  ): string {
    const promptTemplate = this.readPromptFile(
      ".vscode/ai-reviewer-code-review-prompt.md"
    );
    const codingConvention = this.configManager.getConfig().codingConvention;

    // Format code with line numbers for better LLM understanding
    const formattedCode = VSCodeUtils.formatCodeWithLineNumbers(code);

    return promptTemplate
      .replace("{language}", document.languageId)
      .replace("{code}", formattedCode)
      .replace("{codingConvention}", codingConvention);
  }

  public getGhostTextPrompt(
    document: vscode.TextDocument,
    context: string
  ): string {
    const promptTemplate = this.readPromptFile(
      ".vscode/ai-reviewer-ghost-text-prompt.md"
    );
    const codingConvention = this.configManager.getConfig().codingConvention;

    return promptTemplate
      .replace("{language}", document.languageId)
      .replace("{context}", context)
      .replace("{codingConvention}", codingConvention);
  }

  public getCustomPrompt(document: vscode.TextDocument, code: string): string {
    const customPromptTemplate = this.readPromptFile(
      ".vscode/ai-reviewer-custom-prompt.md"
    );
    const codingConvention = this.configManager.getConfig().codingConvention;

    if (!customPromptTemplate.trim()) {
      // Fallback to code review prompt if custom prompt is empty
      return this.getCodeReviewPrompt(document, code);
    }

    return customPromptTemplate
      .replace("{language}", document.languageId)
      .replace("{code}", code)
      .replace("{codingConvention}", codingConvention);
  }

  // Method to get file paths for editing
  public getPromptFilePaths(): { [key: string]: string } {
    const workspacePath = this.getWorkspacePath();
    return {
      codeReview: path.join(
        workspacePath,
        ".vscode/ai-reviewer-code-review-prompt.md"
      ),
      ghostText: path.join(
        workspacePath,
        ".vscode/ai-reviewer-ghost-text-prompt.md"
      ),
      codingConvention: path.join(
        workspacePath,
        ".vscode/ai-reviewer-coding-convention.md"
      ),
      customPrompt: path.join(
        workspacePath,
        ".vscode/ai-reviewer-custom-prompt.md"
      ),
    };
  }

  // Method to reset all prompt files to defaults
  public resetAllPromptsToDefaults(): void {
    this.workspaceFileTemplate.resetAllFiles();
  }

  // Method to reset specific prompt file to default
  public resetPromptToDefault(filePath: string): void {
    this.workspaceFileTemplate.resetFile(filePath);
  }

  // Method to get all prompt file infos
  public getAllPromptFileInfos() {
    return this.workspaceFileTemplate.getAllFileInfos();
  }
}
