import * as vscode from "vscode";
import { Logger, debugOutputChannel } from '../logging/Logger';

export class VSCodeUtils {
  static createProgressOptions(title: string): vscode.ProgressOptions {
    return {
      location: vscode.ProgressLocation.Notification,
      title: title,
      cancellable: false,
    };
  }

  static handleError(error: any, context: string): void {
    Logger.logDebug(debugOutputChannel, `[${context}] Error:`, error);
    vscode.window.showErrorMessage(
      `${context}: ${error instanceof Error ? error.message : error}`
    );
  }

  static showSuccess(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  static showWarning(message: string): void {
    vscode.window.showWarningMessage(message);
  }

  static formatCodeWithLineNumbers(code: string, startLineNumber: number = 1): string {
    const lines = code.split('\n');
    return lines
      .map((line, index) => `${startLineNumber + index}: ${line}`)
      .join('\n');
  }

  static extractLineNumberFromFormattedLine(formattedLine: string): number | null {
    const match = formattedLine.match(/^(\d+):/);
    return match ? parseInt(match[1], 10) : null;
  }

  static parseLineNumberFromResponse(lineReference: string): number | null {
    // Handle various line number formats
    const patterns = [
      /line\s+(\d+)/i,
      /line\s*#\s*(\d+)/i,
      /(\d+):/,
      /^(\d+)$/
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
      const fs = require('fs');
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }
}