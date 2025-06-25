import * as vscode from "vscode";
import { LLMProviderFactory, BaseLLMProvider } from "../llmProvider";
import { ViolationStorageManager } from "../violationStorageManager";
import { debugOutputChannel, logDebug, handleError, showSuccess, showWarning } from "../utils";

export class UtilityCommands {
  constructor(
    private violationStorageManager: ViolationStorageManager
  ) {}

  public async showDebugOutput(): Promise<void> {
    try {
      debugOutputChannel.show();
      logDebug(debugOutputChannel, `[Utility] Debug output shown`);
    } catch (error) {
      handleError(error, "Showing debug output");
    }
  }

  public async showLLMStatus(): Promise<void> {
    try {
      const llmProvider = LLMProviderFactory.createProvider();
      const config = BaseLLMProvider.getConfigFromSettings();

      const status = {
        provider: llmProvider.constructor.name,
        endpoint: config.endpoint,
        model: config.model,
        authType: config.authType,
        hasToken: !!config.apiToken,
        hasCookie: !!config.cookie
      };

      const message = `LLM Provider: ${status.provider}\nEndpoint: ${status.endpoint}\nModel: ${status.model}\nAuth: ${status.authType}`;
      vscode.window.showInformationMessage(message);

      logDebug(debugOutputChannel, `[Utility] Showed LLM status`, { status });
    } catch (error) {
      handleError(error, "Showing LLM status");
    }
  }

  public async clearSavedViolations(): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        "Are you sure you want to clear all saved violations? This action cannot be undone.",
        { modal: true },
        "Yes, Clear All"
      );

      if (result === "Yes, Clear All") {
        const success = await this.violationStorageManager.clearAllResults();

        if (success) {
          showSuccess("All saved violations cleared successfully.");
          logDebug(debugOutputChannel, `[Utility] Cleared all saved violations`);
        } else {
          showWarning("Failed to clear saved violations.");
        }
      }
    } catch (error) {
      handleError(error, "Clearing saved violations");
    }
  }

  public async viewReviewHistory(): Promise<void> {
    try {
      const reviewResults = await this.violationStorageManager.loadReviewResults();

      if (reviewResults.length === 0) {
        vscode.window.showInformationMessage("No review history found.");
        return;
      }

      // Show review history in a new document
      const historyContent = reviewResults.map(result =>
        `File: ${result.file}\nTimestamp: ${new Date(result.timestamp).toLocaleString()}\nViolations: ${result.violations.length}\nStatus: ${result.status}\n---`
      ).join('\n\n');

      const document = await vscode.workspace.openTextDocument({
        content: `Review History\n\n${historyContent}`,
        language: 'markdown'
      });

      await vscode.window.showTextDocument(document);

      logDebug(debugOutputChannel, `[Utility] Viewed review history`, {
        reviewCount: reviewResults.length
      });
    } catch (error) {
      handleError(error, "Viewing review history");
    }
  }

  public async refreshAnalytics(): Promise<void> {
    try {
      const reviewResults = await this.violationStorageManager.loadReviewResults();

      const analytics = {
        totalReviews: reviewResults.length,
        totalViolations: reviewResults.reduce((sum, result) => sum + result.violations.length, 0),
        completedReviews: reviewResults.filter(r => r.status === 'completed').length,
        failedReviews: reviewResults.filter(r => r.status === 'failed').length
      };

      const message = `Analytics:\nTotal Reviews: ${analytics.totalReviews}\nTotal Violations: ${analytics.totalViolations}\nCompleted: ${analytics.completedReviews}\nFailed: ${analytics.failedReviews}`;

      vscode.window.showInformationMessage(message);

      logDebug(debugOutputChannel, `[Utility] Refreshed analytics`, analytics);
    } catch (error) {
      handleError(error, "Refreshing analytics");
    }
  }
}