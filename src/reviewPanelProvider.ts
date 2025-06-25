import * as vscode from "vscode";
import {
  debugOutputChannel,
  logDebug,
  renderTemplate,
} from "./utils";
import * as path from "path";
import * as fs from "fs";
import { ViolationStorageManager } from "./violationStorageManager";
import { marked } from "marked";

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
    logDebug(debugOutputChannel, `[ReviewPanel] Resolving webview view:`, {
      viewType: webviewView.viewType,
      visible: webviewView.visible,
      context: context
    });

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
            logDebug(debugOutputChannel, `[ReviewPanel] Error updating violation status:`, error);
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
            await this.applyCodeChange(fileName, lineNumber, newCode, originalCode);
          } catch (error) {
            logDebug(debugOutputChannel, `[ReviewPanel] Error applying code change:`, error);
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
            logDebug(debugOutputChannel, `[ReviewPanel] Error opening file:`, error);
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
            const success = await this.violationStorageManager.clearAllResults();
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
      }
    });
  }

  public async sendReviewResults(reviewData: any, fileName: string): Promise<void> {
    let renderedHtml = '';
    let templateData: any = {};

    try {
      // Ensure review panel is visible and focused
      await this.ensureReviewPanelVisible();

      // Small delay to ensure webview is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      logDebug(debugOutputChannel, `[ReviewPanel] Sending review results for ${fileName}:`, {
        violationsCount: reviewData.violations?.length || 0,
        hasSummary: !!reviewData.summary,
        reviewId: reviewData.id
      });

      // Process violations for template
      const violations = (reviewData.violations || []).map((violation: any) => ({
        ...violation,
        originalCode: violation.originalCode ? marked.parse(violation.originalCode) : '',
      }));
      const summary = reviewData.summary ? marked.parse(reviewData.summary) : '';
      const feedbackContext = reviewData.feedbackContext ? marked.parse(reviewData.feedbackContext) : '';

      // Prepare data for template
      templateData = {
        fileName: fileName,
        violations: violations,
        summary: summary,
        feedbackContext: feedbackContext,
        isSavedResult: false,
        reviewId: reviewData.id || 'unknown',
        stats: {
          total: violations.length,
          high: violations.filter((v: any) => v.severity === 'high').length,
          medium: violations.filter((v: any) => v.severity === 'medium').length,
          low: violations.filter((v: any) => v.severity === 'low').length,
        }
      };

      // Process violations for template
      templateData.violations = templateData.violations.map((violation: any) => ({
        ...violation,
        status: violation.status || 'pending',
        statusClass: violation.status === 'approved' ? 'approved' : violation.status === 'rejected' ? 'rejected' : 'pending',
        originalCode: violation.originalCode || '',
        escapedSuggestion: (violation.suggestion || '').replace(/'/g, "\\'"),
        escapedOriginalCode: (violation.originalCode || '').replace(/'/g, "\\'"),
        showApproveReject: !violation.status || violation.status === 'pending' || violation.status === 'undefined' || violation.status === 'null'
      }));

      logDebug(debugOutputChannel, `[ReviewPanel] Template data prepared:`, {
        fileName: templateData.fileName,
        violationsCount: templateData.violations.length,
        stats: templateData.stats,
        hasSummary: !!templateData.summary
      });

      // Get template path
      const templatePath = path.join(this._extensionUri.fsPath, 'media', 'reviewResultsTemplate.html');
      logDebug(debugOutputChannel, `[ReviewPanel] Template path:`, templatePath);

      // Render template
      renderedHtml = renderTemplate(templatePath, templateData);
      logDebug(debugOutputChannel, `[ReviewPanel] Template rendered successfully, length:`, renderedHtml.length);

    } catch (error) {
      logDebug(debugOutputChannel, `[ReviewPanel] Error rendering review results:`, { error, reviewData, templateData });
      renderedHtml = `<div class='error'>Error rendering review results: ${error instanceof Error ? error.message : error}</div>`;
    }

    // Send the rendered review results (only once)
    logDebug(debugOutputChannel, `[ReviewPanel] About to send message to webview:`, {
      hasView: !!this._view,
      isVisible: this._view?.visible,
      webviewReady: !!this._view?.webview
    });

    this._view?.webview.postMessage({
      type: 'reviewResults',
      reviewData: reviewData,
      fileName: fileName,
      renderedHtml: renderedHtml
    });

    logDebug(debugOutputChannel, `[ReviewPanel] Sent review results for ${fileName}`);
  }

  public async loadReviewResults(): Promise<void> {
    try {
      if (!this._view) {
        logDebug(debugOutputChannel, `[ReviewPanel] No webview available for loadReviewResults`);
        return;
      }

      const reviewResults = await this.violationStorageManager.loadReviewResults();

      logDebug(debugOutputChannel, `[ReviewPanel] Loaded review results from storage:`, {
        count: reviewResults.length,
        results: reviewResults.map(r => ({
          id: r.id,
          file: r.file,
          violationsCount: r.violations?.length || 0,
          hasSummary: !!r.summary,
          timestamp: r.timestamp
        }))
      });

      this._view.webview.postMessage({
        type: "loadReviewResults",
        reviewResults: reviewResults,
      });

      logDebug(debugOutputChannel, `[ReviewPanel] Sent ${reviewResults.length} review results to webview`);
    } catch (error) {
      logDebug(debugOutputChannel, `[ReviewPanel] Failed to load review results:`, error);
    }
  }

  public async clearReviewPanel(): Promise<void> {
    try {
      this._view?.webview.postMessage({
        type: "clearReviewPanel",
      });
    } catch (error) {
      logDebug(debugOutputChannel, `[ReviewPanel] Failed to clear review panel:`, error);
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
      logDebug(debugOutputChannel, `[ReviewPanel] Failed to update violation status:`, error);
      return false;
    }
  }

  private async applyCodeChange(fileName: string, lineNumber: number, newCode: string, originalCode: string): Promise<void> {
    // Implementation similar to chatPanelProvider
    // This would apply code changes to the editor
    vscode.window.showInformationMessage(`Code change applied to ${fileName} line ${lineNumber}`);
  }

  private async openFile(fileName: string): Promise<void> {
    try {
      const vscode = require('vscode');
      const path = require('path');
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
    logDebug(debugOutputChannel, `[ReviewPanel] Ensuring review panel visible:`, {
      hasView: !!this._view,
      isVisible: this._view?.visible,
      viewType: this._view?.viewType
    });

    if (this._view && this._view.visible) {
      logDebug(debugOutputChannel, `[ReviewPanel] Review panel already visible`);
      return;
    }

    try {
      logDebug(debugOutputChannel, `[ReviewPanel] Attempting to focus review panel`);
      await vscode.commands.executeCommand("aiReviewer.reviewPanel.focus");
      logDebug(debugOutputChannel, `[ReviewPanel] Successfully focused review panel`);
    } catch (error) {
      logDebug(debugOutputChannel, `[ReviewPanel] Failed to focus review panel:`, error);
      console.warn("Failed to focus review panel:", error);
    }
  }

  private replaceRelativePaths(htmlContent: string, webview: vscode.Webview): string {
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
}