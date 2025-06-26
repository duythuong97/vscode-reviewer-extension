import * as vscode from "vscode";
import { Logger, debugOutputChannel } from "../../utils";
import { TemplateRenderer } from "../../utils/template/TemplateRenderer";
import * as path from "path";
import * as fs from "fs";
import { marked } from "marked";
import { ViolationStorageManager } from "../../services/storage/managers/ViolationStorageManager";
import { AgentWorkflow, AgentStepResult } from "../../types";

export class ReviewPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aiReviewer.reviewPanel";
  private _view?: vscode.WebviewView;
  private violationStorageManager: ViolationStorageManager;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.violationStorageManager = ViolationStorageManager.getInstance();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    Logger.logDebug(
      debugOutputChannel,
      `[ReviewPanel] Resolving webview view:`,
      {
        viewType: webviewView.viewType,
        visible: webviewView.visible,
        context: context,
      }
    );

    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Get the HTML content from the external file
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "media",
      "reviewPanel.html"
    );
    let htmlContent = "";

    try {
      htmlContent = fs.readFileSync(htmlPath, "utf8");
    } catch (error) {
      console.error("Error reading reviewPanel.html:", error);
      htmlContent = this.getFallbackHtml();
    }

    // Replace any relative paths with webview URIs
    htmlContent = this.replaceRelativePaths(htmlContent, webviewView.webview);

    webviewView.webview.html = htmlContent;

    // Load review results when webview becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        setTimeout(() => {
          this.loadReviewResults();
        }, 100);
      }
    });

    // Load review results initially
    setTimeout(() => {
      this.loadReviewResults();
    }, 500);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "webviewReady":
          this.loadReviewResults();
          break;
        case "updateViolationStatus":
          try {
            const { reviewId, violationIndex, status, note } = data;
            const success = await this.updateViolationStatus(
              reviewId,
              violationIndex,
              status,
              note
            );

            if (success) {
              webviewView.webview.postMessage({
                type: "violationStatusUpdateSuccess",
                reviewId: reviewId,
                violationIndex: violationIndex,
                status: status,
              });
            } else {
              webviewView.webview.postMessage({
                type: "violationStatusUpdateError",
                message: "Failed to update violation status",
              });
            }
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error updating violation status:`,
              error
            );
            webviewView.webview.postMessage({
              type: "violationStatusUpdateError",
              message: `Error updating violation status: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "applyCodeChange":
          try {
            const { fileName, lineNumber, newCode, originalCode } = data;
            await this.applyCodeChange(
              fileName,
              lineNumber,
              newCode,
              originalCode
            );
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error applying code change:`,
              error
            );
            webviewView.webview.postMessage({
              type: "applyError",
              message: `Failed to apply code change: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "openFile":
          try {
            const { fileName } = data;
            await this.openFile(fileName);
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error opening file:`,
              error
            );
            webviewView.webview.postMessage({
              type: "error",
              content: `Error opening file: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "clearReviewHistory":
          try {
            const success =
              await this.violationStorageManager.clearAllResults();
            if (success) {
              webviewView.webview.postMessage({
                type: "showMessage",
                message: "Cleared all review history!",
                level: "success",
              });
              this.loadReviewResults();
            } else {
              webviewView.webview.postMessage({
                type: "showMessage",
                message: "Failed to clear review history!",
                level: "error",
              });
            }
          } catch (error) {
            webviewView.webview.postMessage({
              type: "showMessage",
              message: `Error: ${
                error instanceof Error ? error.message : error
              }`,
              level: "error",
            });
          }
          break;
        case "reReviewWithFeedback":
          // Handle re-review with feedback
          try {
            const { fileName } = data;

            // Execute the re-review command
            await vscode.commands.executeCommand(
              "ai-reviewer.reReviewWithFeedback"
            );

            Logger.logDebug(
              debugOutputChannel,
              `[ChatPanel] Triggered re-review for ${fileName}`
            );
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ChatPanel] Error triggering re-review:`,
              error
            );
            webviewView.webview.postMessage({
              type: "error",
              content: `Error triggering re-review: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "executeCurrentStep":
          try {
            await vscode.commands.executeCommand("ai-reviewer.executeCurrentStep");
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error executing current step:`,
              error
            );
            webviewView.webview.postMessage({
              type: "error",
              content: `Error executing current step: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "executeStep":
          try {
            const { stepId } = data;
            await vscode.commands.executeCommand("ai-reviewer.executeStep", stepId);
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error executing step ${data.stepId}:`,
              error
            );
            webviewView.webview.postMessage({
              type: "error",
              content: `Error executing step: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "nextStep":
          try {
            await vscode.commands.executeCommand("ai-reviewer.nextStep");
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error moving to next step:`,
              error
            );
            webviewView.webview.postMessage({
              type: "error",
              content: `Error moving to next step: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "executeFullWorkflow":
          try {
            await vscode.commands.executeCommand("ai-reviewer.executeFullWorkflow");
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error executing full workflow:`,
              error
            );
            webviewView.webview.postMessage({
              type: "error",
              content: `Error executing full workflow: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "clearWorkflow":
          try {
            await vscode.commands.executeCommand("ai-reviewer.clearWorkflow");
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error clearing workflow:`,
              error
            );
            webviewView.webview.postMessage({
              type: "error",
              content: `Error clearing workflow: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "createAgentWorkflow":
          try {
            await vscode.commands.executeCommand("ai-reviewer.createAgentWorkflow");
          } catch (error) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Error creating agent workflow:`,
              error
            );
            webviewView.webview.postMessage({
              type: "error",
              content: `Error creating agent workflow: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "error":
          // Send error to webview
          webviewView.webview.postMessage({
            type: "error",
            content: data.content
          });
          break;
        case "agentWorkflow":
          console.log('[ReviewPanel] Received agent workflow:', data.workflow);
          // Send to webview to handle
          webviewView.webview.postMessage({
            type: "agentWorkflow",
            workflow: data.workflow
          });
          break;
        case "agentStepResult":
          console.log('[ReviewPanel] Received agent step result:', data.result);
          // Send to webview to handle
          webviewView.webview.postMessage({
            type: "agentStepResult",
            result: data.result
          });
          break;
        case "updateAgentWorkflow":
          console.log('[ReviewPanel] Received update agent workflow:', data.workflow);
          // Send to webview to handle
          webviewView.webview.postMessage({
            type: "updateAgentWorkflow",
            workflow: data.workflow
          });
          break;
        case "completeAgentWorkflow":
          console.log('[ReviewPanel] Agent workflow completed');
          // Send to webview to handle
          webviewView.webview.postMessage({
            type: "completeAgentWorkflow"
          });
          break;
        case "clearAgentWorkflow":
          console.log('[ReviewPanel] Agent workflow cleared');
          // Send to webview to handle
          webviewView.webview.postMessage({
            type: "clearAgentWorkflow"
          });
          break;
      }
    });
  }

  public async sendReviewResults(
    reviewData: any,
    fileName: string
  ): Promise<void> {
    let renderedHtml = "";
    let templateData: any = {};

    try {
      // Ensure review panel is visible and focused
      await this.ensureReviewPanelVisible();

      // Longer delay to ensure webview is fully ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Sending review results for ${fileName}:`,
        {
          violationsCount: reviewData.violations?.length || 0,
          hasSummary: !!reviewData.summary,
          reviewId: reviewData.id,
        }
      );

      // Process violations for template
      const violations = (reviewData.violations || []).map(
        (violation: any) => ({
          ...violation,
          originalCode: violation.originalCode
            ? marked.parse(violation.originalCode)
            : "",
        })
      );
      const summary = reviewData.summary
        ? marked.parse(reviewData.summary)
        : "";
      const feedbackContext = reviewData.feedbackContext
        ? marked.parse(reviewData.feedbackContext)
        : "";

      // Prepare data for template
      templateData = {
        fileName: fileName,
        violations: violations,
        summary: summary,
        feedbackContext: feedbackContext,
        isSavedResult: false,
        reviewId: reviewData.id || "unknown",
        stats: {
          total: violations.length,
          high: violations.filter((v: any) => v.severity === "high").length,
          medium: violations.filter((v: any) => v.severity === "medium").length,
          low: violations.filter((v: any) => v.severity === "low").length,
        },
      };

      // Process violations for template
      templateData.violations = templateData.violations.map(
        (violation: any) => ({
          ...violation,
          status: violation.status || "pending",
          statusClass:
            violation.status === "approved"
              ? "approved"
              : violation.status === "rejected"
              ? "rejected"
              : "pending",
          originalCode: violation.originalCode || "",
          escapedSuggestion: (violation.suggestion || "").replace(/'/g, "\\'"),
          escapedOriginalCode: (violation.originalCode || "").replace(
            /'/g,
            "\\'"
          ),
          showApproveReject:
            !violation.status ||
            violation.status === "pending" ||
            violation.status === "undefined" ||
            violation.status === "null",
        })
      );

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Template data prepared:`,
        {
          fileName: templateData.fileName,
          violationsCount: templateData.violations.length,
          stats: templateData.stats,
          hasSummary: !!templateData.summary,
        }
      );

      // Get template path
      const templatePath = path.join(
        this._extensionUri.fsPath,
        "media",
        "reviewResultsTemplate.html"
      );
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Template path:`,
        templatePath
      );

      // Render template
      renderedHtml = TemplateRenderer.renderTemplate(
        templatePath,
        templateData
      );
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Template rendered successfully, length:`,
        renderedHtml.length
      );
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Error rendering review results:`,
        { error, reviewData, templateData }
      );
      renderedHtml = `<div class='error'>Error rendering review results: ${
        error instanceof Error ? error.message : error
      }</div>`;
    }

    // Send the rendered review results with retry mechanism
    await this.sendMessageWithRetry({
      type: "reviewResults",
      reviewData: reviewData,
      fileName: fileName,
      renderedHtml: renderedHtml,
    });

    Logger.logDebug(
      debugOutputChannel,
      `[ReviewPanel] Sent review results for ${fileName}`
    );
  }

  private async sendMessageWithRetry(
    message: any,
    maxRetries: number = 3
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        Logger.logDebug(
          debugOutputChannel,
          `[ReviewPanel] Attempt ${attempt}/${maxRetries} to send message:`,
          {
            hasView: !!this._view,
            isVisible: this._view?.visible,
            webviewReady: !!this._view?.webview,
            messageType: message.type,
          }
        );

        if (!this._view?.webview) {
          throw new Error("Webview not available");
        }

        this._view.webview.postMessage(message);

        Logger.logDebug(
          debugOutputChannel,
          `[ReviewPanel] Message sent successfully on attempt ${attempt}`
        );
        return; // Success, exit retry loop
      } catch (error) {
        Logger.logDebug(
          debugOutputChannel,
          `[ReviewPanel] Attempt ${attempt} failed:`,
          error
        );

        if (attempt === maxRetries) {
          Logger.logDebug(
            debugOutputChannel,
            `[ReviewPanel] All ${maxRetries} attempts failed to send message`
          );
          throw error;
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Try to ensure panel is visible again before retry
        if (attempt < maxRetries) {
          try {
            await this.ensureReviewPanelVisible();
            await new Promise((resolve) => setTimeout(resolve, 200));
          } catch (focusError) {
            Logger.logDebug(
              debugOutputChannel,
              `[ReviewPanel] Failed to refocus panel on attempt ${attempt}:`,
              focusError
            );
          }
        }
      }
    }
  }

  public async loadReviewResults(): Promise<void> {
    try {
      if (!this._view) {
        Logger.logDebug(
          debugOutputChannel,
          `[ReviewPanel] No webview available for loadReviewResults`
        );
        return;
      }

      const reviewResults =
        await this.violationStorageManager.loadReviewResults();

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Loaded review results from storage:`,
        {
          count: reviewResults.length,
          results: reviewResults.map((r) => ({
            id: r.id,
            file: r.file,
            violationsCount: r.violations?.length || 0,
            hasSummary: !!r.summary,
            timestamp: r.timestamp,
          })),
        }
      );

      await this.sendMessageWithRetry({
        type: "loadReviewResults",
        reviewResults: reviewResults,
      });

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Sent ${reviewResults.length} review results to webview`
      );
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Failed to load review results:`,
        error
      );
    }
  }

  public async clearReviewPanel(): Promise<void> {
    try {
      this._view?.webview.postMessage({
        type: "clearReviewPanel",
      });
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Failed to clear review panel:`,
        error
      );
    }
  }

  public isWebviewAvailable(): boolean {
    return !!this._view;
  }

  private async updateViolationStatus(
    reviewId: string,
    violationIndex: number,
    status: "approved" | "rejected",
    note?: string
  ): Promise<boolean> {
    try {
      const success = await this.violationStorageManager.updateViolationStatus(
        reviewId,
        violationIndex,
        status,
        note
      );

      if (success) {
        this._view?.webview.postMessage({
          type: "violationStatusUpdated",
          reviewId: reviewId,
          violationIndex: violationIndex,
          status: status,
          note: note,
        });
      }

      return success;
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Failed to update violation status:`,
        error
      );
      return false;
    }
  }

  private async applyCodeChange(
    fileName: string,
    lineNumber: number,
    newCode: string,
    originalCode: string
  ): Promise<void> {
    try {
      const vscode = require("vscode");
      const path = require("path");
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let fullPath = fileName;
      if (workspaceFolders && workspaceFolders.length > 0) {
        if (!path.isAbsolute(fileName)) {
          fullPath = path.join(workspaceFolders[0].uri.fsPath, fileName);
        }
      }
      const uri = vscode.Uri.file(fullPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
      });

      // Tìm vị trí đoạn code gốc trong toàn bộ file
      const fileText = document.getText();
      const originalCodeTrimmed = originalCode.trim();
      const newCodeTrimmed = newCode.trim();

      const startIdx = fileText.indexOf(originalCodeTrimmed);

      if (originalCode && startIdx === -1) {
        vscode.window.showWarningMessage(
          `Original code does not match anywhere in ${fileName}.`
        );
        return;
      }

      if (startIdx !== -1) {
        const endIdx = startIdx + originalCodeTrimmed.length;
        const startPos = document.positionAt(startIdx);
        const endPos = document.positionAt(endIdx);

        await editor.edit((editBuilder: import("vscode").TextEditorEdit) => {
          editBuilder.replace(new vscode.Range(startPos, endPos), newCodeTrimmed);
        });

        // Scroll tới dòng sau khi apply fix thành công
        const targetLine = startPos.line;
        const targetPosition = new vscode.Position(targetLine, 0);

        // Reveal the line in the editor
        editor.revealRange(
          new vscode.Range(targetPosition, targetPosition),
          vscode.TextEditorRevealType.InCenter
        );

        // Set cursor position to the line
        editor.selection = new vscode.Selection(targetPosition, targetPosition);

        vscode.window.showInformationMessage(
          `Code change applied to ${fileName} at line ${targetLine + 1} and scrolled to position`
        );
      } else {
        vscode.window.showWarningMessage(
          `Original code does not match anywhere in ${fileName}.`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to apply code change: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  private async openFile(fileName: string): Promise<void> {
    try {
      const vscode = require("vscode");
      const path = require("path");
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let fullPath = fileName;
      if (workspaceFolders && workspaceFolders.length > 0) {
        // Nếu fileName đã là path tuyệt đối thì giữ nguyên, nếu không thì ghép với workspace
        if (!path.isAbsolute(fileName)) {
          fullPath = path.join(workspaceFolders[0].uri.fsPath, fileName);
        }
      }
      const uri = vscode.Uri.file(fullPath);
      await vscode.window.showTextDocument(uri, { preview: false });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${fileName}`);
    }
  }

  private async ensureReviewPanelVisible(): Promise<void> {
    Logger.logDebug(
      debugOutputChannel,
      `[ReviewPanel] Ensuring review panel visible:`,
      {
        hasView: !!this._view,
        isVisible: this._view?.visible,
        viewType: this._view?.viewType,
      }
    );

    if (this._view && this._view.visible) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Review panel already visible`
      );
      return;
    }

    try {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Attempting to focus review panel`
      );
      await vscode.commands.executeCommand("aiReviewer.reviewPanel.focus");
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Successfully focused review panel`
      );
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Failed to focus review panel:`,
        error
      );
      console.warn("Failed to focus review panel:", error);
    }
  }

  private replaceRelativePaths(
    htmlContent: string,
    webview: vscode.Webview
  ): string {
    return htmlContent;
  }

  private getFallbackHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
          <head>
              <meta charset="UTF-8">
          <title>Review Panel</title>
          </head>
          <body>
          <h3>Review Panel</h3>
          <p>Error loading review panel. Please check the extension configuration.</p>
      </body>
      </html>
    `;
  }

  // AI Agent Workflow Methods
  public async sendAgentWorkflow(workflow: AgentWorkflow): Promise<void> {
    try {
      await this.sendMessageWithRetry({
        type: "agentWorkflow",
        workflow: workflow,
      });

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Sent agent workflow:`,
        {
          id: workflow.id,
          stepsCount: workflow.steps.length,
          currentStep: workflow.currentStep,
        }
      );
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Error sending agent workflow:`,
        error
      );
    }
  }

  public async updateAgentStepResult(result: AgentStepResult): Promise<void> {
    try {
      await this.sendMessageWithRetry({
        type: "agentStepResult",
        result: result,
      });

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Sent agent step result:`,
        {
          stepId: result.stepId,
          success: result.success,
          hasError: !!result.error,
        }
      );
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Error sending agent step result:`,
        error
      );
    }
  }

  public async updateAgentWorkflow(workflow: AgentWorkflow | null): Promise<void> {
    try {
      await this.sendMessageWithRetry({
        type: "updateAgentWorkflow",
        workflow: workflow,
      });

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Updated agent workflow:`,
        {
          hasWorkflow: !!workflow,
          currentStep: workflow?.currentStep,
          status: workflow?.status,
        }
      );
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Error updating agent workflow:`,
        error
      );
    }
  }

  public async completeAgentWorkflow(): Promise<void> {
    try {
      await this.sendMessageWithRetry({
        type: "completeAgentWorkflow",
      });

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Completed agent workflow`
      );
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Error completing agent workflow:`,
        error
      );
    }
  }

  public async clearAgentWorkflow(): Promise<void> {
    try {
      await this.sendMessageWithRetry({
        type: "clearAgentWorkflow",
      });

      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Cleared agent workflow`
      );
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[ReviewPanel] Error clearing agent workflow:`,
        error
      );
    }
  }
}
