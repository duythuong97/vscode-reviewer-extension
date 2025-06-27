import * as vscode from "vscode";

import { TemplateRenderer } from "../../utils/template/TemplateRenderer";
import * as path from "path";
import * as fs from "fs";
import { marked } from "marked";
import { ViolationStorageManager } from "../../services/storage/managers/ViolationStorageManager";

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
    const cssPath = path.join(this._extensionUri.fsPath, "media", "css");
    const cssUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(cssPath, "agentPanel.css"))
    );

    try {
      htmlContent = fs.readFileSync(htmlPath, "utf8");
      htmlContent = htmlContent.replace("{{styleUri}}", cssUri.toString());
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
          } catch (error) {
            webviewView.webview.postMessage({
              type: "error",
              content: `Error triggering re-review: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
      }
    });
  }

  public async sendReviewResults(
    reviewData: any,
    fileName: string
  ): Promise<void> {
    if (!this._view) {
      return;
    }

    await this.ensureReviewPanelVisible();

    // Process violations and create HTML
    const violations = reviewData.violations || [];
    const summary = reviewData.summary || "No summary available";

    // Create violation HTML
    const violationHtml = violations
      .map((violation: any, index: number) => {
        const severityClass = violation.severity || "medium";
        const status = violation.status || "pending";
        const statusClass =
          status === "approved"
            ? "approved"
            : status === "rejected"
            ? "rejected"
            : "pending";

        return `
          <div class="violation-item ${severityClass} ${statusClass}" data-violation-index="${index}">
            <div class="violation-header">
              <span class="severity-badge ${severityClass}">${
          violation.severity || "medium"
        }</span>
              <span class="line-number">Line ${violation.line}</span>
              <span class="status-badge ${statusClass}">${status}</span>
            </div>
            <div class="violation-message">${marked(violation.message)}</div>
            ${
              violation.originalCode
                ? `
              <div class="code-block">
                <div class="code-header">Original Code:</div>
                <pre><code>${this.escapeHtml(
                  violation.originalCode
                )}</code></pre>
              </div>
            `
                : ""
            }
            ${
              violation.suggestion
                ? `
              <div class="code-block suggestion">
                <div class="code-header">Suggestion:</div>
                <pre><code>${this.escapeHtml(violation.suggestion)}</code></pre>
                <button class="apply-button" onclick="applyCodeChange('${fileName}', ${
                    violation.line
                  }, \`${this.escapeHtml(
                    violation.suggestion
                  )}\`, \`${this.escapeHtml(
                    violation.originalCode || ""
                  )}\`)">Apply Fix</button>
              </div>
            `
                : ""
            }
            <div class="violation-actions">
              <button class="action-button approve" onclick="updateViolationStatus('${
                reviewData.id || "unknown"
              }', ${index}, 'approved')">Approve</button>
              <button class="action-button reject" onclick="updateViolationStatus('${
                reviewData.id || "unknown"
              }', ${index}, 'rejected')">Reject</button>
              <button class="action-button note" onclick="addViolationNote('${
                reviewData.id || "unknown"
              }', ${index})">Add Note</button>
            </div>
          </div>
        `;
      })
      .join("");

    // Create the complete review HTML
    const reviewHtml = `
      <div class="review-container">
        <div class="review-header">
          <h3>Review Results for ${fileName}</h3>
          <div class="review-summary">
            <span class="violation-count">${
              violations.length
            } violations found</span>
            <span class="severity-breakdown">
              ${this.getSeverityBreakdown(violations)}
            </span>
          </div>
        </div>
        <div class="review-summary-text">
          <h4>Summary:</h4>
          <div class="summary-content">${marked(summary)}</div>
        </div>
        <div class="violations-list">
          ${violationHtml}
        </div>
      </div>
    `;

    // Send the review results to the webview
    await this.sendMessageWithRetry({
      type: "reviewResults",
      content: reviewHtml,
      fileName: fileName,
      violations: violations,
      summary: summary,
    });
  }

  private async sendMessageWithRetry(
    message: any,
    maxRetries: number = 3
  ): Promise<void> {
    if (!this._view) {
      return;
    }

    for (let i = 0; i < maxRetries; i++) {
      try {
        this._view.webview.postMessage(message);
        return;
      } catch (error) {
        if (i === maxRetries - 1) {
          console.error("Failed to send message after retries:", error);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
        }
      }
    }
  }

  public async loadReviewResults(): Promise<void> {
    if (!this._view) {
      return;
    }

    try {
      const results = await this.violationStorageManager.loadReviewResults();
      await this.sendMessageWithRetry({
        type: "reviewHistory",
        results: results,
      });
    } catch (error) {
      console.error("Error loading review results:", error);
    }
  }

  public async clearReviewPanel(): Promise<void> {
    if (!this._view) {
      return;
    }

    await this.sendMessageWithRetry({
      type: "clearReviewPanel",
    });
  }

  public isWebviewAvailable(): boolean {
    return this._view !== undefined;
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
      return success;
    } catch (error) {
      console.error("Error updating violation status:", error);
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
      // Find the file in the workspace
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error("No workspace folder found");
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document);

      // Find the line to replace
      const line = document.lineAt(lineNumber - 1);
      const range = new vscode.Range(line.range.start, line.range.end);

      // Apply the edit
      await editor.edit((editBuilder) => {
        editBuilder.replace(range, newCode);
      });

      // Show success message
      vscode.window.showInformationMessage(
        `Applied code change to ${fileName} at line ${lineNumber}`
      );
    } catch (error) {
      console.error("Error applying code change:", error);
      vscode.window.showErrorMessage(
        `Failed to apply code change: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async openFile(fileName: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error("No workspace folder found");
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      console.error("Error opening file:", error);
      vscode.window.showErrorMessage(
        `Failed to open file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async ensureReviewPanelVisible(): Promise<void> {
    // Focus the review panel
    await vscode.commands.executeCommand("aiReviewer.reviewPanel.focus");
  }

  private replaceRelativePaths(
    htmlContent: string,
    webview: vscode.Webview
  ): string {
    return htmlContent.replace(
      /(src|href)=["']([^"']+)["']/g,
      (match, attr, url) => {
        if (url.startsWith("http") || url.startsWith("data:")) {
          return match;
        }
        const uri = vscode.Uri.joinPath(this._extensionUri, url);
        const webviewUri = webview.asWebviewUri(uri);
        return `${attr}="${webviewUri}"`;
      }
    );
  }

  private getFallbackHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Review Panel</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .error { color: red; }
        </style>
      </head>
      <body>
        <h2>Review Panel</h2>
        <p class="error">Failed to load review panel template.</p>
      </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private getSeverityBreakdown(violations: any[]): string {
    const breakdown = violations.reduce((acc: any, violation: any) => {
      const severity = violation.severity || "medium";
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(breakdown)
      .map(([severity, count]) => `${severity}: ${count}`)
      .join(", ");
  }
}
