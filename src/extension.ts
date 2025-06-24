// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SecondarySidebarManager } from "./secondarySidebarManager";
import { CommandManager } from "./commands";
import { GhostTextProvider } from "./ghostTextProvider";
import { ConfigManager } from "./configManager";
import { ChatPanelProvider } from "./chatPanelProvider";
import { SettingsPanelProvider } from "./settingsPanelProvider";

// Create output channel for debug messages
export const debugOutputChannel =
  vscode.window.createOutputChannel("AI Reviewer Debug");

// Log debug message helper function
export function logDebug(
  channel: vscode.OutputChannel,
  message: string,
  data?: any
): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  if (data) {
    channel.appendLine(`${logMessage}\n${JSON.stringify(data, null, 2)}`);
  } else {
    channel.appendLine(logMessage);
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  logDebug(debugOutputChannel, "AI Reviewer extension is now active!");

  try {
    // Initialize ConfigManager
    const configManager = ConfigManager.getInstance();

    // Validate configuration
    const validation = configManager.validateConfig();
    if (!validation.isValid) {
      logDebug(
        debugOutputChannel,
        "Configuration validation failed",
        validation.errors
      );
      vscode.window.showWarningMessage(
        `AI Reviewer configuration has issues: ${validation.errors.join(", ")}`
      );
    }

    // Initialize secondary sidebar manager
    const sidebarManager = SecondarySidebarManager.getInstance();
    sidebarManager.loadData();

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

    // Initialize command manager with chat panel provider
    const commandManager = CommandManager.getInstance(chatPanelProvider);
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

    logDebug(
      debugOutputChannel,
      "AI Reviewer extension initialized successfully"
    );
  } catch (error) {
    logDebug(debugOutputChannel, "Error during extension activation", error);
    vscode.window.showErrorMessage(
      `Failed to activate AI Reviewer extension: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export function deactivate() {
  logDebug(debugOutputChannel, "AI Reviewer extension is now deactivated");
}
