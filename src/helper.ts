import * as vscode from "vscode";
import { debugOutputChannel } from "./extension";

export function logDebug(
  debugOutputChannel: vscode.OutputChannel,
  message: string,
  data?: any
) {
  // Debug logger using VS Code output channel

  if (!debugOutputChannel) {
    debugOutputChannel = vscode.window.createOutputChannel("AI Reviewer Debug");
  }

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  debugOutputChannel.appendLine(logMessage);

  if (data) {
    if (typeof data === "object") {
      debugOutputChannel.appendLine(JSON.stringify(data, null, 2));
    } else {
      debugOutputChannel.appendLine(String(data));
    }
  }

  debugOutputChannel.appendLine(""); // Empty line for readability
}

export function getDebugOutputChannel() {
  const debugOutputChannel =
    vscode.window.createOutputChannel("AI Reviewer Debug");

  return debugOutputChannel;
}
