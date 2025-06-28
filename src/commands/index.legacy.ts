import * as vscode from "vscode";
import { ChatPanelProvider } from "../ui/panels/ChatPanelProvider";
import { ReviewPanelProvider } from "../ui/panels/ReviewPanelProvider";
import { AgentPanelProvider } from "../ui/panels/AgentPanelProvider";
import { ConfigManager } from "../core/managers/ConfigManager";
import { PromptManager } from "../core/Prompts";
import { ChatHistoryManager } from "../core/managers/ChatHistoryManager";
import { ViolationStorageManager } from "../services/storage/managers/ViolationStorageManager";
import { SettingsPanelProvider } from "../ui/panels/SettingsPanelProvider";
import { ReviewCommands } from "./ReviewCommands";
import { SettingsCommands } from "./SettingsCommands";
import { ChatCommands } from "./ChatCommands";
import { GhostTextCommands } from "./GhostTextCommands";
import { TemplateCommands } from "./TemplateCommands";
import { UtilityCommands } from "./UtilityCommands";
import { UnitTestGeneratorTask } from "../agents/tasks";

import { AgentTaskContext } from "../agents/types/agent";

export class CommandManager {
  private static instance: CommandManager;
  private readonly reviewCommands: ReviewCommands;
  private readonly settingsCommands: SettingsCommands;
  private readonly chatCommands: ChatCommands;
  private readonly ghostTextCommands: GhostTextCommands;
  private readonly templateCommands: TemplateCommands;
  private readonly utilityCommands: UtilityCommands;
  private readonly unitTestGeneratorTask: UnitTestGeneratorTask;

  private constructor(
    chatPanelProvider: ChatPanelProvider,
    reviewPanelProvider: ReviewPanelProvider,
    agentPanelProvider: AgentPanelProvider
  ) {
    const configManager = ConfigManager.getInstance();
    const promptManager = PromptManager.getInstance();
    const chatHistoryManager = ChatHistoryManager.getInstance();
    const violationStorageManager = ViolationStorageManager.getInstance();
    const settingsPanelProvider = new SettingsPanelProvider(
      vscode.Uri.file(__dirname)
    );

    this.reviewCommands = new ReviewCommands(
      reviewPanelProvider,
      configManager,
      promptManager,
      violationStorageManager
    );

    this.settingsCommands = new SettingsCommands(
      configManager,
      settingsPanelProvider
    );

    this.chatCommands = new ChatCommands(
      chatPanelProvider,
      chatHistoryManager,
      violationStorageManager
    );

    this.ghostTextCommands = new GhostTextCommands();

    this.templateCommands = new TemplateCommands(promptManager);

    this.utilityCommands = new UtilityCommands(violationStorageManager);
    this.unitTestGeneratorTask = new UnitTestGeneratorTask(
      "UT Generator",
      (context: AgentTaskContext<any>) => {
        console.log("Unit Test Generator Task State:", context);
        agentPanelProvider.rendertWorkflow(context.workflow);
      }
    );
  }

  public static getInstance(
    chatPanelProvider: ChatPanelProvider,
    reviewPanelProvider: ReviewPanelProvider,
    agentPanelProvider: AgentPanelProvider
  ): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager(
        chatPanelProvider,
        reviewPanelProvider,
        agentPanelProvider
      );
    }
    return CommandManager.instance;
  }

  public registerCommands(context: vscode.ExtensionContext): void {
    // Register review commands
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.reviewFile", () =>
        this.reviewCommands.reviewCurrentFile()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.reviewPR", () =>
        this.reviewCommands.reviewPR()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.reReviewWithFeedback", () =>
        this.reviewCommands.reReviewWithFeedback()
      )
    );

    // Register settings commands
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.showSettings", () =>
        this.settingsCommands.openSettings()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.openSettingsPanel", () =>
        this.settingsCommands.openSettings()
      )
    );

    // Register chat commands
    context.subscriptions.push(
      vscode.commands.registerCommand("aiReviewer.chatPanel.focus", () =>
        this.chatCommands.focusChatPanel()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.viewChatHistory", () =>
        this.chatCommands.viewChatHistory()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.clearChatHistory", () =>
        this.chatCommands.clearChatHistory()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.newChatSession", () =>
        this.chatCommands.newChatSession()
      )
    );

    // Register review panel command
    context.subscriptions.push(
      vscode.commands.registerCommand("aiReviewer.reviewPanel.focus", () =>
        this.focusReviewPanel()
      )
    );

    // Register settings panel command
    context.subscriptions.push(
      vscode.commands.registerCommand("aiReviewer.settingsPanel.focus", () =>
        this.focusSettingsPanel()
      )
    );

    // Register ghost text commands
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.acceptGhostSuggestion", () =>
        this.ghostTextCommands.acceptGhostSuggestion()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.toggleGhostText", () =>
        this.ghostTextCommands.toggleGhostText()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.aiPromptPopup", () =>
        this.ghostTextCommands.aiPromptPopup()
      )
    );

    // Register template commands
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.useTemplate", () =>
        this.templateCommands.useTemplate()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.editTemplate", () =>
        this.templateCommands.editTemplate()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.addTemplate", () =>
        this.templateCommands.addTemplate()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.showRightPanel", () =>
        this.templateCommands.showRightPanel()
      )
    );

    // Register utility commands
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.showDebugOutput", () =>
        this.utilityCommands.showDebugOutput()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.viewReviewHistory", () =>
        this.utilityCommands.viewReviewHistory()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.refreshAnalytics", () =>
        this.utilityCommands.refreshAnalytics()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.showLLMStatus", () =>
        this.utilityCommands.showLLMStatus()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.clearSavedViolations", () =>
        this.utilityCommands.clearSavedViolations()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("ai-reviewer.generateUnitTests", () =>
        this.unitTestGeneratorTask.start({
          filePath: vscode.window.activeTextEditor?.document.uri.fsPath || "",
        })
      )
    );
  }

  private async focusReviewPanel(): Promise<void> {
    try {
      await vscode.commands.executeCommand(
        "workbench.view.extension.ai-reviewer-review-sidebar"
      );
    } catch (error) {
      console.warn("Failed to focus review panel:", error);
    }
  }

  private async focusSettingsPanel(): Promise<void> {
    try {
      await vscode.commands.executeCommand(
        "workbench.view.extension.ai-reviewer-settings-sidebar"
      );
    } catch (error) {
      console.warn("Failed to focus settings panel:", error);
    }
  }
}
