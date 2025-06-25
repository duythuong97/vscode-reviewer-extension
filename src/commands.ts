import * as vscode from "vscode";
import { marked } from "marked";
import { LLMProviderFactory } from "./llmProvider";
import { PromptManager } from "./prompts";
import { GitHelper } from "./gitHelper";
import { ChatPanelProvider } from "./chatPanelProvider";
import { ConfigManager } from "./configManager";
import { ChatHistoryManager } from "./chatHistoryManager";
import {
  debugOutputChannel,
  logDebug,
  extractJSONFromResponse,
  readFileContent,
  createProgressOptions,
  handleError,
  showSuccess,
  showWarning
} from "./utils";

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
      vscode.commands.registerCommand("aiReviewer.chatPanel.focus", () =>
        this.focusChatPanel()
      )
    );

    // Register chat history management commands
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.viewChatHistory", () =>
        this.viewChatHistory()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.clearChatHistory", () =>
        this.clearChatHistory()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.newChatSession", () =>
        this.newChatSession()
      )
    );

    // Register show LLM connection status command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.showLLMStatus", () =>
        this.showLLMStatus()
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
      showSuccess("Starting code review...");

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

        // Use improved JSON extraction
        violations = extractJSONFromResponse(response.content);
      } catch (error) {
        handleError(error, `Failed to review file ${document.fileName}`);
        return;
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
        showWarning(`Failed to send review results to chat for file ${document.fileName}: ${error}`);
      }
    } catch (error) {
      handleError(error, "Code review failed");
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
    let changedFiles: { name: string; path: string }[] = [];
    try {
      changedFiles = await GitHelper.getChangedFiles(repoPath, baseBranch);
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

    // Show progress with progress bar
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AI Reviewer - Reviewing PR",
        cancellable: false,
      },
      async (progress) => {
        const llmProvider = LLMProviderFactory.createProvider();
        const promptManager = PromptManager.getInstance();

        progress.report({
          message: `Found ${changedFiles.length} files to review`,
          increment: 0,
        });

        let reviewedCount = 0;
        let successCount = 0;
        let errorCount = 0;

        for (const file of changedFiles) {
          reviewedCount++;
          const filePath = file.path;

          progress.report({
            message: `${reviewedCount}/${changedFiles.length}: ${filePath}`,
            increment: (100 / changedFiles.length),
          });

          let fileContent = "";
          try {
            const fs = require("fs");
            const absPath = require("path").join(repoPath, filePath);
            if (fs.existsSync(absPath)) {
              fileContent = fs.readFileSync(absPath, "utf8");
            } else {
              vscode.window.showWarningMessage(`File not found: ${filePath}`);
              errorCount++;
              continue;
            }
          } catch (error) {
            vscode.window.showWarningMessage(
              `Failed to read file ${filePath}: ${error}`
            );
            errorCount++;
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

            // Use improved JSON extraction
            violations = extractJSONFromResponse(response.content);
          } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(
              `Failed to review file ${filePath}: ${error}`
            );
            errorCount++;
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
            successCount++;
          } catch (error) {
            vscode.window.showWarningMessage(
              `Failed to send review results to chat for file ${filePath}: ${error}`
            );
            errorCount++;
          }
        }

        // Final progress report
        progress.report({
          message: `Review completed: ${successCount} successful, ${errorCount} errors`,
          increment: 100,
        });

        // Show final summary
        const summaryMessage = `Reviewed ${changedFiles.length} files: ${successCount} successful, ${errorCount} errors. Results sent to chat panel.`;
        if (errorCount === 0) {
          vscode.window.showInformationMessage(summaryMessage);
        } else {
          vscode.window.showWarningMessage(summaryMessage);
        }
      }
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
      await vscode.commands.executeCommand(
        "workbench.view.extension.ai-reviewer-sidebar"
      );

      // Give some time for the panel to load, then try to focus the chat view
      setTimeout(async () => {
        await vscode.commands.executeCommand(
          "workbench.action.focusFirstEditorGroup"
        );

        // Load chat history when panel is focused
        await this.chatPanelProvider.loadChatHistory();
      }, 200);
    } catch (error) {
      console.warn("Failed to focus chat panel:", error);
    }
  }

  private async viewChatHistory(): Promise<void> {
    try {
      const chatHistoryManager = ChatHistoryManager.getInstance();
      const sessions = await chatHistoryManager.getAllSessions();

      if (sessions.length === 0) {
        showSuccess("No chat history found.");
        return;
      }

      // Create quick pick items for sessions
      const items = sessions.map(session => ({
        label: session.title,
        description: `${session.messages.length} messages • ${new Date(session.timestamp).toLocaleString()}`,
        detail: session.id
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a chat session to view"
      });

      if (selected) {
        // Load the selected session
        const session = await chatHistoryManager.loadSession(selected.detail);
        if (session) {
          showSuccess(`Loaded chat session: ${session.title}`);
          // Load chat history into panel
          await this.chatPanelProvider.loadChatHistory();
          // Focus chat panel to show the loaded session
          await this.focusChatPanel();
        }
      }
    } catch (error) {
      handleError(error, "Failed to view chat history");
    }
  }

  private async clearChatHistory(): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      "Are you sure you want to clear all chat history? This action cannot be undone.",
      "Yes, Clear All",
      "Cancel"
    );

    if (result === "Yes, Clear All") {
      try {
        const chatHistoryManager = ChatHistoryManager.getInstance();
        const success = await chatHistoryManager.clearAllHistory();

        if (success) {
          // Clear the chat panel as well
          await this.chatPanelProvider.clearChatPanel();
          showSuccess("Chat history cleared successfully.");
        } else {
          showWarning("Failed to clear chat history.");
        }
      } catch (error) {
        handleError(error, "Failed to clear chat history");
      }
    }
  }

  private async newChatSession(): Promise<void> {
    try {
      const chatHistoryManager = ChatHistoryManager.getInstance();
      const sessionId = chatHistoryManager.startNewSession();

      // Clear the chat panel for new session
      await this.chatPanelProvider.clearChatPanel();

      showSuccess("Started new chat session.");

      // Focus chat panel
      await this.focusChatPanel();
    } catch (error) {
      handleError(error, "Failed to start new chat session");
    }
  }

  private async showLLMStatus(): Promise<void> {
    try {
      const config = this.configManager.getConfig();
      const llmConfig = this.configManager.getLLMConfig();

      // Test connection
      const llmProvider = LLMProviderFactory.createProvider();

      const statusInfo = {
        providerType: config.providerType,
        endpoint: llmConfig.endpoint,
        model: llmConfig.model,
        authType: llmConfig.authType,
        hasApiToken: !!llmConfig.apiToken,
        hasCookie: !!llmConfig.cookie,
        maxTokens: llmConfig.maxTokens,
        temperature: llmConfig.temperature,
        debugMode: config.debugMode
      };

      logDebug(debugOutputChannel, `[LLM Status] Configuration:`, statusInfo);

      // Show status in notification
      const statusMessage = `LLM Status:
Provider: ${statusInfo.providerType}
Endpoint: ${statusInfo.endpoint}
Model: ${statusInfo.model}
Auth: ${statusInfo.authType} ${statusInfo.authType === 'token' ? (statusInfo.hasApiToken ? '✓' : '✗') : (statusInfo.hasCookie ? '✓' : '✗')}
Max Tokens: ${statusInfo.maxTokens || 'default'}
Temperature: ${statusInfo.temperature || 'default'}
Debug Mode: ${statusInfo.debugMode ? 'enabled' : 'disabled'}`;

      vscode.window.showInformationMessage(statusMessage, { modal: false });

      // Test connection with a simple ping
      try {
        const testPrompt = "Hello, this is a connection test. Please respond with 'OK' if you can see this message.";
        logDebug(debugOutputChannel, `[LLM Status] Testing connection with ping...`);

        const response = await llmProvider.callLLM(testPrompt);
        logDebug(debugOutputChannel, `[LLM Status] Connection test successful:`, response.content);

        vscode.window.showInformationMessage(
          `✅ LLM connection successful! Response: ${response.content.substring(0, 100)}${response.content.length > 100 ? '...' : ''}`,
          { modal: false }
        );
      } catch (error) {
        logDebug(debugOutputChannel, `[LLM Status] Connection test failed:`, error);
        vscode.window.showWarningMessage(
          `⚠️ LLM connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { modal: false }
        );
      }

    } catch (error) {
      logDebug(debugOutputChannel, `[LLM Status] Error getting status:`, error);
      vscode.window.showErrorMessage(
        `Failed to get LLM status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}