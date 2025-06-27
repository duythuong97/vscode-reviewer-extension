// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// Import from new structure
import { ConfigManager } from "./managers/ConfigManager";
import { ChatPanelProvider } from "../ui/panels/ChatPanelProvider";
import { ReviewPanelProvider } from "../ui/panels/ReviewPanelProvider";
import { AgentPanelProvider } from "../ui/panels/AgentPanelProvider";
import { SettingsPanelProvider } from "../ui/panels/SettingsPanelProvider";
import { WorkspaceCommandsPanel } from "../ui/panels/WorkspaceCommandsPanel";
import { GhostTextProvider } from "../ui/ghostText/GhostTextProvider";
import { CommandManager } from "../commands/index.legacy";
import { WorkspaceCommands } from "../commands/WorkspaceCommands";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  try {
    // Initialize ConfigManager
    const configManager = ConfigManager.getInstance();

    // Validate configuration
    const validation = configManager.validateConfig();
    if (!validation.isValid) {
      vscode.window.showWarningMessage(
        `AI Reviewer configuration has issues: ${validation.errors.join(", ")}`
      );
    }

    // Create and register settings panel provider
    const settingsPanelProvider = new SettingsPanelProvider(
      context.extensionUri
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SettingsPanelProvider.viewType,
        settingsPanelProvider
      )
    );

    // Create chat panel provider
    const chatPanelProvider = new ChatPanelProvider(context.extensionUri);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        ChatPanelProvider.viewType,
        chatPanelProvider
      )
    );

    // Create review panel provider
    const reviewPanelProvider = new ReviewPanelProvider(context.extensionUri);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        ReviewPanelProvider.viewType,
        reviewPanelProvider
      )
    );

    // Create agent panel provider
    const agentPanelProvider = new AgentPanelProvider(context.extensionUri);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        AgentPanelProvider.viewType,
        agentPanelProvider
      )
    );

    // Register commands using CommandManager
    const commandManager = CommandManager.getInstance(
      chatPanelProvider,
      reviewPanelProvider,
      agentPanelProvider
    );
    commandManager.registerCommands(context);

    // Initialize workspace indexing
    const workspaceCommands = WorkspaceCommands.getInstance();

    // Register workspace commands
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.indexWorkspace", () => {
        workspaceCommands.indexWorkspace();
      }),
      vscode.commands.registerCommand("ai-reviewer.refreshCurrentFile", () => {
        workspaceCommands.refreshCurrentFile();
      }),
      vscode.commands.registerCommand("ai-reviewer.showWorkspaceInfo", () => {
        workspaceCommands.showWorkspaceInfo();
      }),
      vscode.commands.registerCommand("ai-reviewer.saveIndex", () => {
        workspaceCommands.saveIndex();
      }),
      vscode.commands.registerCommand("ai-reviewer.loadIndex", () => {
        workspaceCommands.loadIndex();
      }),
      vscode.commands.registerCommand("ai-reviewer.clearIndex", () => {
        workspaceCommands.clearIndex();
      }),
      vscode.commands.registerCommand("ai-reviewer.searchInWorkspace", () => {
        workspaceCommands.searchInWorkspace();
      }),
      vscode.commands.registerCommand(
        "ai-reviewer.openWorkspaceCommands",
        () => {
          WorkspaceCommandsPanel.createOrShow(context.extensionUri);
        }
      )
    );

    // Start workspace indexing on activation (optional)
    const uiConfig = configManager.getUIConfig();
    if (uiConfig.autoIndexWorkspace !== false) {
      // Delay indexing to avoid blocking extension activation
      setTimeout(() => {
        workspaceCommands.indexWorkspaceOnOpen().catch((error) => {});
      }, 2000);
    }

    // Initialize ghost text provider if enabled
    const uiConfig2 = configManager.getUIConfig();
    if (uiConfig2.ghostTextEnabled) {
      const ghostTextProvider = new GhostTextProvider();
      context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
          { pattern: "**" },
          ghostTextProvider
        )
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Extension activation failed: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}

export function deactivate() {}
