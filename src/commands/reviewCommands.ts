import * as vscode from "vscode";
import { marked } from "marked";
import { LLMProviderFactory } from "../llmProvider";
import { PromptManager } from "../prompts";
import { GitHelper } from "../gitHelper";
import { ReviewPanelProvider } from "../reviewPanelProvider";
import { ConfigManager } from "../configManager";
import { ChatHistoryManager } from "../chatHistoryManager";
import { ViolationStorageManager } from "../violationStorageManager";
import {
  debugOutputChannel,
  logDebug,
  extractJSONFromResponse,
  readFileContent,
  createProgressOptions,
  handleError,
  showSuccess,
  showWarning,
} from "../utils";

export class ReviewCommands {
  constructor(
    private reviewPanelProvider: ReviewPanelProvider,
    private configManager: ConfigManager,
    private promptManager: PromptManager,
    private violationStorageManager: ViolationStorageManager
  ) {}

  public async reviewCurrentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found.");
      return;
    }

    const document = editor.document;
    const fileName =
      document.fileName.split(/[\\/]/).pop() || document.fileName;

    logDebug(
      debugOutputChannel,
      `[Review] Starting review for file: ${fileName}`
    );

    await vscode.window.withProgress(
      createProgressOptions(`Reviewing ${fileName}...`),
      async (progress) => {
        try {
          progress.report({ message: "Reading file content..." });
          const fileContent = document.getText();
          logDebug(
            debugOutputChannel,
            `[Review] File content length: ${fileContent.length}`
          );

          progress.report({ message: "Preparing review prompt..." });
          const prompt = await this.promptManager.getCodeReviewPrompt(
            document,
            fileContent
          );
          logDebug(
            debugOutputChannel,
            `[Review] Prompt length: ${prompt.length}`
          );

          progress.report({ message: "Sending to AI for review..." });
          const llmProvider = LLMProviderFactory.createProvider();

          // Use streaming for faster response
          let responseContent = "";
          await llmProvider.callLLMStream(
            prompt,
            new vscode.CancellationTokenSource().token,
            (chunk: string) => {
              responseContent += chunk;
            }
          );

          const response = { content: responseContent };
          logDebug(
            debugOutputChannel,
            `[Review] AI response received, length: ${response.content.length}`
          );

          progress.report({ message: "Processing review results..." });
          const reviewData = extractJSONFromResponse(response.content);
          logDebug(
            debugOutputChannel,
            `[Review] Extracted review data:`,
            reviewData
          );

          if (!reviewData) {
            throw new Error("Failed to parse review results from AI response");
          }

          // Ensure reviewData has required structure
          if (!reviewData.violations) {
            reviewData.violations = [];
          }
          if (!reviewData.summary) {
            reviewData.summary = "Review completed";
          }

          logDebug(debugOutputChannel, `[Review] Processed review data:`, {
            violationsCount: reviewData.violations.length,
            hasSummary: !!reviewData.summary,
            violations: reviewData.violations,
          });

          // Save review results
          const reviewId = await this.violationStorageManager.saveReviewResult({
            id: Date.now().toString(),
            file: fileName,
            violations: reviewData.violations || [],
            summary: reviewData.summary || "",
            timestamp: Date.now(),
            status: "completed",
          });

          logDebug(
            debugOutputChannel,
            `[Review] Saved review result with ID: ${reviewId}`
          );

          // Show results in review panel
          await this.reviewPanelProvider.sendReviewResults(
            reviewData,
            fileName
          );

          showSuccess(`Review completed for ${fileName}`);
          logDebug(
            debugOutputChannel,
            `[Review] Completed review for ${fileName}`,
            {
              reviewId,
              violationsCount: reviewData.violations?.length || 0,
            }
          );
        } catch (error) {
          logDebug(debugOutputChannel, `[Review] Error during review:`, error);
          handleError(error, `Reviewing ${fileName}`);
        }
      }
    );
  }

  public async reviewPR(): Promise<void> {
    const config = this.configManager.getConfig();
    const baseBranch = config.baseBranch;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    logDebug(debugOutputChannel, `[ReviewPR] Starting PR review:`, {
      baseBranch: baseBranch,
      workspaceFolder: workspaceFolder?.uri.fsPath,
      config: config
    });

    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found!");
      return;
    }
    const repoPath = workspaceFolder.uri.fsPath;
    let changedFiles: { name: string; path: string }[] = [];
    try {
      changedFiles = await GitHelper.getChangedFiles(repoPath, baseBranch);
      logDebug(debugOutputChannel, `[ReviewPR] Found changed files:`, {
        count: changedFiles.length,
        files: changedFiles.map(f => f.path)
      });
    } catch (error) {
      logDebug(debugOutputChannel, `[ReviewPR] Error getting changed files:`, error);
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
            increment: 100 / changedFiles.length,
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
            // Use streaming for faster response
            let responseContent = "";
            await llmProvider.callLLMStream(
              prompt,
              new vscode.CancellationTokenSource().token,
              (chunk: string) => {
                responseContent += chunk;
              }
            );
            response = { content: responseContent };

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

          // Normalize violations - handle both single violation object and violations array
          let violationsArray = [];
          let summary = "";

          if (violations) {
            if (Array.isArray(violations)) {
              violationsArray = violations;
            } else if (
              violations.violations &&
              Array.isArray(violations.violations)
            ) {
              violationsArray = violations.violations;
              summary = violations.summary || "";
            } else if (violations.line && violations.message) {
              // Single violation object
              violationsArray = [violations];
              summary = violations.summary || "";
            } else if (Array.isArray(violations.violations)) {
              violationsArray = violations.violations;
              summary = violations.summary || "";
            }
          }

          logDebug(
            debugOutputChannel,
            `[ReviewPR] Normalized violations for ${filePath}:`,
            {
              originalViolations: violations,
              violationsArray: violationsArray,
              summary: summary,
            }
          );

          // Send violations to chat panel
          try {
            logDebug(debugOutputChannel, `[ReviewPR] Sending review results to Review panel:`, {
              file: filePath,
              violationsCount: violationsArray.length,
              summary: summary
            });

            // Ensure review panel is focused before sending results
            await vscode.commands.executeCommand("aiReviewer.reviewPanel.focus");

            // Small delay to ensure webview is ready
            await new Promise(resolve => setTimeout(resolve, 200));

            this.reviewPanelProvider.sendReviewResults(
              {
                file: filePath,
                violations: violationsArray,
                summary: summary,
              },
              filePath
            );

            logDebug(debugOutputChannel, `[ReviewPR] Successfully sent review results for ${filePath}`);

            // Save review result to storage
            const reviewResult =
              this.violationStorageManager.createReviewResult(
                filePath,
                violationsArray,
                summary,
                "completed"
              );

            const saveSuccess =
              await this.violationStorageManager.saveReviewResult(reviewResult);
            if (!saveSuccess) {
              logDebug(
                debugOutputChannel,
                `[ReviewPR] Failed to save review result for ${filePath}`
              );
            }

            successCount++;
          } catch (error) {
            logDebug(debugOutputChannel, `[ReviewPR] Error sending review results:`, error);
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

  public async reReviewWithFeedback(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found.");
      return;
    }

    const document = editor.document;
    const fileName =
      document.fileName.split(/[\\/]/).pop() || document.fileName;

    // Get previous review feedback
    const previousReviews =
      await this.violationStorageManager.loadReviewResults();
    const previousReview = previousReviews.find(
      (review) => review.file === fileName || review.file.endsWith(fileName)
    );

    if (!previousReview) {
      vscode.window.showWarningMessage(
        `No previous review found for ${fileName}. Performing regular review instead.`
      );
      await this.reviewCurrentFile();
      return;
    }

    await vscode.window.withProgress(
      createProgressOptions(`Re-reviewing ${fileName} with feedback...`),
      async (progress) => {
        try {
          progress.report({ message: "Reading file content..." });
          const fileContent = document.getText();

          progress.report({
            message: "Preparing re-review prompt with feedback...",
          });
          const feedbackContext = JSON.stringify(
            previousReview.violations,
            null,
            2
          );
          // Use regular review prompt for now since getReReviewPrompt doesn't exist
          const prompt = await this.promptManager.getCodeReviewPrompt(
            document,
            fileContent
          );

          progress.report({ message: "Sending to AI for re-review..." });
          const llmProvider = LLMProviderFactory.createProvider();

          // Use streaming for faster response
          let responseContent = "";
          await llmProvider.callLLMStream(
            prompt,
            new vscode.CancellationTokenSource().token,
            (chunk: string) => {
              responseContent += chunk;
            }
          );
          const response = { content: responseContent };

          progress.report({ message: "Processing re-review results..." });
          const reviewData = extractJSONFromResponse(response.content);

          if (!reviewData) {
            throw new Error(
              "Failed to parse re-review results from AI response"
            );
          }

          // Add feedback context to review data
          reviewData.feedbackContext = feedbackContext;

          // Save re-review results
          const reviewId = await this.violationStorageManager.saveReviewResult({
            id: Date.now().toString(),
            file: fileName,
            violations: reviewData.violations || [],
            summary: reviewData.summary || "",
            timestamp: Date.now(),
            status: "completed",
          });

          // Show results in review panel
          await this.reviewPanelProvider.sendReviewResults(
            reviewData,
            fileName
          );

          showSuccess(`Re-review completed for ${fileName}`);
          logDebug(
            debugOutputChannel,
            `[ReReview] Completed re-review for ${fileName}`,
            {
              reviewId,
              previousReviewId: previousReview.id,
              violationsCount: reviewData.violations?.length || 0,
            }
          );
        } catch (error) {
          handleError(error, `Re-reviewing ${fileName}`);
        }
      }
    );
  }
}
