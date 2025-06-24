import * as vscode from "vscode";
import { marked } from "marked";
import { logDebug } from "./helper";
import { LLMProviderFactory } from "./llmProvider";
import { PromptManager } from "./prompts";
import { GitHelper } from "./gitHelper";
import { ChatPanelProvider } from "./chatPanelProvider";
import { debugOutputChannel } from "./extension";
import { ConfigManager } from "./configManager";

export class CommandManager {
  private static instance: CommandManager;
  private chatPanelProvider: ChatPanelProvider;
  private configManager: ConfigManager;
  private promptManager: PromptManager;

  private constructor(chatPanelProvider: ChatPanelProvider) {
    this.chatPanelProvider = chatPanelProvider;
    this.configManager = ConfigManager.getInstance();
    this.promptManager = PromptManager.getInstance();
  }

  public static getInstance(
    chatPanelProvider: ChatPanelProvider
  ): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager(chatPanelProvider);
    }
    return CommandManager.instance;
  }

  public registerCommands(context: vscode.ExtensionContext): void {
    // Register review file command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.reviewFile", () =>
        this.reviewCurrentFile()
      )
    );

    // Register review PR command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.reviewPR", () =>
        this.reviewPR()
      )
    );

    // Register show debug output command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.showDebugOutput", () =>
        this.showDebugOutput()
      )
    );

    // Register show settings command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.showSettings", () =>
        this.openSettings()
      )
    );

    // Register open settings panel command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.openSettingsPanel", () =>
        this.openSettings()
      )
    );

    // Register accept ghost suggestion command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.acceptGhostSuggestion", () =>
        this.acceptGhostSuggestion()
      )
    );

    // Register toggle ghost text command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.toggleGhostText", () =>
        this.toggleGhostText()
      )
    );

    // Register test ghost text command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.testGhostText", () =>
        this.testGhostText()
      )
    );

    // Register AI prompt popup command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.aiPromptPopup", () =>
        this.aiPromptPopup()
      )
    );

    // Register view review history command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.viewReviewHistory", () =>
        this.viewReviewHistory()
      )
    );

    // Register refresh analytics command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.refreshAnalytics", () =>
        this.refreshAnalytics()
      )
    );

    // Register use template command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.useTemplate", () =>
        this.useTemplate()
      )
    );

    // Register edit template command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.editTemplate", () =>
        this.editTemplate()
      )
    );

    // Register add template command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.addTemplate", () =>
        this.addTemplate()
      )
    );

    // Register show right panel command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.showRightPanel", () =>
        this.showRightPanel()
      )
    );

    // Register show review results in chat command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "ai-reviewer.showReviewResultsInChat",
        () => this.showReviewResultsInChat()
      )
    );

    // Register focus chat panel command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "aiReviewer.chatPanel.focus",
        () => this.focusChatPanel()
      )
    );
  }

  public async reviewCurrentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found");
      return;
    }

    const document = editor.document;
    const text = document.getText();

    try {
      const llmProvider = LLMProviderFactory.createProvider();
      const prompt = this.promptManager.getCodeReviewPrompt(document, text);
      logDebug(debugOutputChannel, `[Prompt] reviewCurrentFile`, prompt);
      vscode.window.showInformationMessage("Starting code review...");

      let violations;
      let response;
      try {
        response = await llmProvider.callLLM(prompt);
        // Log LLM response if debugMode is enabled
        if (this.configManager.getConfig().debugMode) {
          logDebug(
            debugOutputChannel,
            `[LLM Response] reviewCurrentFile for ${document.fileName}`,
            response.content
          );
        }
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          violations = JSON.parse(jsonMatch[0]);
        } else {
          vscode.window.showErrorMessage(
            `LLM did not return valid JSON for file ${document.fileName}. Raw response: ${response.content}`
          );
          return;
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to review file ${document.fileName}: ${error}`
        );
      }
      // Send violations to chat panel
      try {
        this.chatPanelProvider.sendReviewResults(
          {
            file: document.fileName,
            violations: violations.violations || [],
            summary: violations.summary || "",
          },
          document.fileName
        );
      } catch (error) {
        vscode.window.showWarningMessage(
          `Failed to send review results to chat for file ${document.fileName}: ${error}`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Code review failed: ${error}`);
    }
  }

  public async reviewPR(): Promise<void> {
    const config = this.configManager.getConfig();
    const baseBranch = config.baseBranch;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found!");
      return;
    }
    const repoPath = workspaceFolder.uri.fsPath;
    let changedFiles: string[] = [];
    try {
      const { execSync } = require("child_process");
      const diffOutput = execSync(`git diff --name-only ${baseBranch}...`, {
        cwd: repoPath,
        encoding: "utf8",
      });
      changedFiles = diffOutput
        .split("\n")
        .filter((f: string) => f.trim() !== "");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to get changed files: ${error}`);
      return;
    }
    if (changedFiles.length === 0) {
      vscode.window.showInformationMessage(
        "No changed files found compared to the base branch."
      );
      return;
    }
    const llmProvider = LLMProviderFactory.createProvider();
    const promptManager = PromptManager.getInstance();
    for (const filePath of changedFiles) {
      let fileContent = "";
      try {
        const fs = require("fs");
        const absPath = require("path").join(repoPath, filePath);
        if (fs.existsSync(absPath)) {
          fileContent = fs.readFileSync(absPath, "utf8");
        } else {
          vscode.window.showWarningMessage(`File not found: ${filePath}`);
          continue;
        }
      } catch (error) {
        vscode.window.showWarningMessage(
          `Failed to read file ${filePath}: ${error}`
        );
        continue;
      }
      const languageId = filePath.split(".").pop() || "";
      const prompt = promptManager.getCodeReviewPrompt(
        { languageId } as any,
        fileContent
      );
      let violations;
      let response;
      try {
        response = await llmProvider.callLLM(prompt);
        // Log LLM response if debugMode is enabled
        if (this.configManager.getConfig().debugMode) {
          logDebug(
            debugOutputChannel,
            `[LLM Response] reviewPR for ${filePath}`,
            response.content
          );
        }
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          violations = JSON.parse(jsonMatch[0]);
        } else {
          vscode.window.showErrorMessage(
            `LLM did not return valid JSON for file ${filePath}. Raw response: ${response.content}`
          );
          continue;
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to review file ${filePath}: ${error}`
        );
        continue;
      }
      // Send violations to chat panel
      try {
        this.chatPanelProvider.sendReviewResults(
          {
            file: filePath,
            violations: violations.violations || [],
            summary: violations.summary || "",
          },
          filePath
        );
      } catch (error) {
        vscode.window.showWarningMessage(
          `Failed to send review results to chat for file ${filePath}: ${error}`
        );
      }
    }
    vscode.window.showInformationMessage(
      `Reviewed ${changedFiles.length} files. Results sent to chat panel.`
    );
  }

  public async openSettings(): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:aiReviewer"
    );
  }

  public async resetSettings(): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      "Are you sure you want to reset all AI Reviewer settings to defaults?",
      "Yes",
      "No"
    );

    if (result === "Yes") {
      await this.configManager.resetToDefaults();
      vscode.window.showInformationMessage("Settings reset to defaults");
    }
  }

  public async validateSettings(): Promise<void> {
    const validation = this.configManager.validateConfig();

    if (validation.isValid) {
      vscode.window.showInformationMessage("All settings are valid!");
    } else {
      const errorMessage = validation.errors.join("\n");
      vscode.window.showErrorMessage(
        `Configuration errors found:\n${errorMessage}`
      );
    }
  }

  private async showDebugOutput(): Promise<void> {
    debugOutputChannel.show();
  }

  private acceptGhostSuggestion(): void {
    // Implementation for accepting ghost suggestion
  }

  private toggleGhostText(): void {
    // Implementation for toggling ghost text
  }

  private testGhostText(): void {
    // Implementation for testing ghost text
  }

  private aiPromptPopup(): void {
    // Implementation for AI prompt popup
  }

  private viewReviewHistory(): void {
    // Implementation for viewing review history
  }

  private refreshAnalytics(): void {
    // Implementation for refreshing analytics
  }

  private useTemplate(): void {
    // Implementation for using template
  }

  private editTemplate(): void {
    // Implementation for editing template
  }

  private addTemplate(): void {
    // Implementation for adding template
  }

  private showRightPanel(): void {
    // Implementation for showing right panel
  }

  private showReviewResultsInChat(): void {
    // Implementation for showing review results in chat
  }

  private async focusChatPanel(): Promise<void> {
    try {
      // Try to focus the chat panel by showing the sidebar
      await vscode.commands.executeCommand('workbench.view.extension.ai-reviewer-sidebar');

      // Give some time for the panel to load, then try to focus the chat view
      setTimeout(() => {
        vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
      }, 100);
    } catch (error) {
      console.warn('Failed to focus chat panel:', error);
    }
  }
}
