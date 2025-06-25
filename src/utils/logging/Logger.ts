import * as vscode from "vscode";

// Create output channel for debug messages
let _debugOutputChannel: vscode.OutputChannel | undefined;

export function getDebugOutputChannel(): vscode.OutputChannel {
  if (!_debugOutputChannel) {
    _debugOutputChannel = vscode.window.createOutputChannel("AI Reviewer Debug");
  }
  return _debugOutputChannel;
}

// Lazy initialization - don't call getDebugOutputChannel() immediately
export const debugOutputChannel = {
  appendLine: (message: string) => {
    try {
      getDebugOutputChannel().appendLine(message);
    } catch (error) {
      // Fallback to console if VSCode context is not ready
      console.log(`[AI Reviewer Debug] ${message}`);
    }
  }
};

export class Logger {
  // Log debug message helper function
  static logDebug(
    channel: vscode.OutputChannel | { appendLine: (message: string) => void },
    message: string,
    data?: any
  ): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;

    try {
      if (data) {
        channel.appendLine(`${logMessage}\n${JSON.stringify(data, null, 2)}`);
      } else {
        channel.appendLine(logMessage);
      }
    } catch (error) {
      // Fallback to console if channel fails
      console.log(`[AI Reviewer Debug] ${logMessage}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }
}