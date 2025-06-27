import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class VSCodeUtils {
  static createProgressOptions(title: string): vscode.ProgressOptions {
    return {
      location: vscode.ProgressLocation.Notification,
      title: title,
      cancellable: false,
    };
  }

  static handleError(error: any, context: string): void {
    vscode.window.showErrorMessage(
      `${context}: ${error instanceof Error ? error.message : error}`
    );
  }

  static showSuccess(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  static showInformation(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  static showError(message: string): void {
    vscode.window.showErrorMessage(message);
  }

  static showWarning(message: string): void {
    vscode.window.showWarningMessage(message);
  }

  static formatCodeWithLineNumbers(
    code: string,
    startLineNumber: number = 1
  ): string {
    const lines = code.split("\n");
    return lines
      .map((line, index) => `${startLineNumber + index}: ${line}`)
      .join("\n");
  }

  static extractLineNumberFromFormattedLine(
    formattedLine: string
  ): number | null {
    const match = formattedLine.match(/^(\d+):/);
    return match ? parseInt(match[1], 10) : null;
  }

  static parseLineNumberFromResponse(lineReference: string): number | null {
    // Handle various line number formats
    const patterns = [
      /line\s+(\d+)/i,
      /line\s*#\s*(\d+)/i,
      /(\d+):/,
      /^(\d+)$/,
    ];

    for (const pattern of patterns) {
      const match = lineReference.match(pattern);
      if (match) {
        const lineNumber = parseInt(match[1], 10);
        if (!isNaN(lineNumber) && lineNumber > 0) {
          return lineNumber;
        }
      }
    }

    return null;
  }

  static async readFileContent(filePath: string): Promise<string> {
    try {
      const fs = require("fs");
      return fs.readFileSync(filePath, "utf8");
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  static async sendMessageWithRetry(
    webview: vscode.Webview | undefined,
    message: any,
    maxRetries: number = 3
  ): Promise<void> {
    if (!webview) {
      return;
    }

    for (let i = 0; i < maxRetries; i++) {
      try {
        webview.postMessage(message);
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

  static async getWebviewHtml(
    extensionUri: vscode.Uri,
    webview: vscode.Webview,
    htmlName: string,
    cssName: string | null,
    jsName: string | null
  ): Promise<string> {
    const htmlPath = path.join(extensionUri.fsPath, "media", htmlName);
    const cssPath = cssName
      ? path.join(extensionUri.fsPath, "media", "css", cssName)
      : null;
    const jsPath = jsName
      ? path.join(extensionUri.fsPath, "media", "js", jsName)
      : null;

    let htmlContent = await this.readFileContent(htmlPath);
    if (cssPath) {
      const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
      htmlContent = htmlContent.replace("{{styleUri}}", cssUri.toString());
    }
    if (jsPath) {
      const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));
      htmlContent = htmlContent.replace("{{scriptUri}}", jsUri.toString());
    }
    htmlContent = this.replaceRelativePaths(htmlContent, webview, extensionUri);
    return htmlContent;
  }

  private static replaceRelativePaths(
    htmlContent: string,
    webview: vscode.Webview,
    extensionUri: vscode.Uri
  ): string {
    return htmlContent.replace(
      /(src|href)=["']([^"']+)["']/g,
      (match, attr, url) => {
        if (url.startsWith("http") || url.startsWith("data:")) {
          return match;
        }
        const uri = vscode.Uri.joinPath(extensionUri, url);
        const webviewUri = webview.asWebviewUri(uri);
        return `${attr}="${webviewUri}"`;
      }
    );
  }
}
