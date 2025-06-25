import * as vscode from "vscode";
import { ChatPanelProvider } from "../chatPanelProvider";
import { ChatHistoryManager } from "../chatHistoryManager";
import { ViolationStorageManager } from "../violationStorageManager";
import { debugOutputChannel, logDebug, handleError, showSuccess, showWarning } from "../utils";

export class ChatCommands {
  constructor(
    private chatPanelProvider: ChatPanelProvider,
    private chatHistoryManager: ChatHistoryManager,
    private violationStorageManager: ViolationStorageManager
  ) {}

  public async focusChatPanel(): Promise<void> {
    try {
      // Check if chat panel is already visible
      if (this.chatPanelProvider.isWebviewAvailable()) {
        await vscode.commands.executeCommand("aiReviewer.chatPanel.focus");
      } else {
        // Try to show the chat panel
        await vscode.commands.executeCommand("workbench.view.extension.ai-reviewer-sidebar");
      }

      logDebug(debugOutputChannel, `[Chat] Focused chat panel`);
    } catch (error) {
      handleError(error, "Focusing chat panel");
    }
  }

  public async viewChatHistory(): Promise<void> {
    try {
      const history = await this.chatHistoryManager.getCurrentSession();

      if (!history || history.messages.length === 0) {
        vscode.window.showInformationMessage("No chat history found.");
        return;
      }

      // Show chat history in a new document
      const historyContent = history.messages.map(msg =>
        `[${msg.isUser ? 'User' : 'AI'}] ${msg.content}`
      ).join('\n\n');

      const document = await vscode.workspace.openTextDocument({
        content: `Chat History - ${history.title || 'Session'}\n\n${historyContent}`,
        language: 'markdown'
      });

      await vscode.window.showTextDocument(document);

      logDebug(debugOutputChannel, `[Chat] Viewed chat history`, {
        messageCount: history.messages.length,
        sessionId: history.id
      });
    } catch (error) {
      handleError(error, "Viewing chat history");
    }
  }

  public async clearChatHistory(): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        "Are you sure you want to clear all chat history? This action cannot be undone.",
        { modal: true },
        "Yes, Clear All"
      );

      if (result === "Yes, Clear All") {
        await this.chatHistoryManager.clearAllHistory();
        await this.chatPanelProvider.clearChatPanel();

        showSuccess("Chat history cleared successfully.");
        logDebug(debugOutputChannel, `[Chat] Cleared all chat history`);
      }
    } catch (error) {
      handleError(error, "Clearing chat history");
    }
  }

  public async newChatSession(): Promise<void> {
    try {
      await this.chatHistoryManager.startNewSession();
      await this.chatPanelProvider.clearChatPanel();

      showSuccess("New chat session created.");
      logDebug(debugOutputChannel, `[Chat] Created new chat session`);
    } catch (error) {
      handleError(error, "Creating new chat session");
    }
  }
}