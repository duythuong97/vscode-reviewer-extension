// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Logger, debugOutputChannel } from "../utils/logging/Logger";

// Import from new structure
import { ConfigManager } from "./managers/ConfigManager";
import { ChatPanelProvider } from "../ui/panels/ChatPanelProvider";
import { ReviewPanelProvider } from "../ui/panels/ReviewPanelProvider";
import { SettingsPanelProvider } from "../ui/panels/SettingsPanelProvider";
import { GhostTextProvider } from "../ui/ghostText/GhostTextProvider";
import { CommandManager } from "../commands/index.legacy";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  Logger.logDebug(debugOutputChannel, "AI Reviewer extension is now active!");

  try {
    // Initialize ConfigManager
    const configManager = ConfigManager.getInstance();

    // Validate configuration
    const validation = configManager.validateConfig();
    if (!validation.isValid) {
      Logger.logDebug(
        debugOutputChannel,
        "Configuration validation failed",
        validation.errors
      );
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

    // Register commands using CommandManager
    const commandManager = CommandManager.getInstance(chatPanelProvider, reviewPanelProvider);
    commandManager.registerCommands(context);

    // Initialize ghost text provider if enabled
    const uiConfig = configManager.getUIConfig();
    if (uiConfig.ghostTextEnabled) {
      const ghostTextProvider = new GhostTextProvider();
      context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
          { pattern: "**" },
          ghostTextProvider
        )
      );
    }

    Logger.logDebug(
      debugOutputChannel,
      "AI Reviewer extension initialized successfully"
    );
  } catch (error) {
    Logger.logDebug(debugOutputChannel, "Extension activation failed:", error);
    vscode.window.showErrorMessage(
      `Extension activation failed: ${error instanceof Error ? error.message : error}`
    );
  }
}

export function deactivate() {
  Logger.logDebug(debugOutputChannel, "AI Reviewer extension is now deactivated");
}