import * as vscode from "vscode";
import { logDebug } from "./helper";
import { LLMProviderFactory } from "./llmProvider";
import { debugOutputChannel } from "./extension";
import * as path from 'path';
import * as fs from 'fs';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aiReviewer.chatPanel";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
    const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'chatPanel.html');
    let htmlContent = '';

    try {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
      console.error('Error reading chatPanel.html:', error);
      htmlContent = this.getFallbackHtml();
    }

    // Replace any relative paths with webview URIs
    htmlContent = this.replaceRelativePaths(htmlContent, webviewView.webview);

    webviewView.webview.html = htmlContent;

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "sendMessage":
          try {
            const config = vscode.workspace.getConfiguration("aiReviewer");
            const apiToken = config.get<string>("apiToken", "");
            const llmEndpoint = config.get<string>(
              "llmEndpoint",
              "http://localhost:11434/api/generate"
            );
            const llmModel = config.get<string>("llmModel", "llama3");

            // Get all accumulated code selections
            const codeSelections = data.codeSelections || [];
            let selectedCode = "";
            let fileName = "";
            let lineStart = 0;
            let lineEnd = 0;

            if (codeSelections.length > 0) {
              // Combine all code selections
              selectedCode = codeSelections
                .map(
                  (selection: any) =>
                    `File: ${selection.fileName} (lines ${selection.lineStart}-${selection.lineEnd})\n\`\`\`\n${selection.selectedCode}\n\`\`\`
  `
                )
                .join("\n\n");

              // Use the first selection for metadata
              fileName = codeSelections[0].fileName;
              lineStart = codeSelections[0].lineStart;
              lineEnd = codeSelections[codeSelections.length - 1].lineEnd;
            }

            // Prepare prompt with selected code and user message
            let prompt = data.message;
            if (selectedCode) {
              prompt = `${selectedCode}\n\nUser Question: ${data.message}`;
            }

            // Debug: Log the prompt to console
            logDebug(
              debugOutputChannel,
              "=== AI Reviewer Chat - Prompt Debug ===",
              {
                selectedCode: selectedCode
                  ? `Yes (${codeSelections.length} selections)`
                  : "No",
                userMessage: data.message,
                prompt:
                  prompt.substring(0, 300) + (prompt.length > 300 ? "..." : ""),
              }
            );

            // Send initial response message to create the AI message bubble
            webviewView.webview.postMessage({
              type: "startStreaming",
              codeSelections: codeSelections,
              fileName: fileName,
              lineStart: lineStart,
              lineEnd: lineEnd,
            });

            // Create a cancellation token for this request
            const cancellationTokenSource =
              new vscode.CancellationTokenSource();

            // Store the cancellation token source so it can be cancelled from the webview
            (webviewView as any).currentCancellationTokenSource =
              cancellationTokenSource;

            // Use cancellable streaming LLM call with raw text streaming
            try {
              const llmProvider = LLMProviderFactory.createProvider();
              await llmProvider.callLLMStream(
                prompt,
                cancellationTokenSource.token,
                async (chunk: string) => {
                  // Send raw text chunk for smooth streaming
                  webviewView.webview.postMessage({
                    type: "streamChunk",
                    chunk: chunk,
                    isHtml: false,
                  });
                }
              );

              // Send completion message
              webviewView.webview.postMessage({
                type: "streamComplete",
              });
            } catch (error) {
              if (
                error instanceof Error &&
                error.message === "Request cancelled by user"
              ) {
                webviewView.webview.postMessage({
                  type: "streamCancelled",
                });
              } else {
                throw error;
              }
            } finally {
              // Clean up the cancellation token source
              (webviewView as any).currentCancellationTokenSource = undefined;
              cancellationTokenSource.dispose();
            }
          } catch (error) {
            webviewView.webview.postMessage({
              type: "error",
              content:
                "Error: " +
                (error instanceof Error ? error.message : "Unknown error"),
            });
          }
          break;
        case "cancelStreaming":
          // Handle cancellation request from webview
          const currentCancellationTokenSource = (webviewView as any)
            .currentCancellationTokenSource;
          if (currentCancellationTokenSource) {
            currentCancellationTokenSource.cancel();
            (webviewView as any).currentCancellationTokenSource = undefined;
          }
          break;
        case "addCodeSelection":
          // Handle adding a new code selection
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor && !activeEditor.selection.isEmpty) {
            const selectedCode = activeEditor.document.getText(
              activeEditor.selection
            );
            const fileName =
              activeEditor.document.fileName.split(/[\\/]/).pop() || "";
            const lineStart = activeEditor.selection.start.line + 1;
            const lineEnd = activeEditor.selection.end.line + 1;

            webviewView.webview.postMessage({
              type: "codeSelectionAdded",
              selection: {
                selectedCode: selectedCode,
                fileName: fileName,
                lineStart: lineStart,
                lineEnd: lineEnd,
              },
            });
          }
          break;
        case "clearCodeSelections":
          // Handle clearing all code selections
          webviewView.webview.postMessage({
            type: "codeSelectionsCleared",
          });
          break;
        case "applyCodeChange":
          // Handle applying code changes from review results
          try {
            const { fileName, lineNumber, newCode, originalCode } = data;

            // Find the document by file name
            const documents = vscode.workspace.textDocuments;
            const targetDocument = documents.find(doc =>
              doc.fileName.endsWith(fileName) || doc.fileName.includes(fileName)
            );

            if (!targetDocument) {
              webviewView.webview.postMessage({
                type: "applyError",
                message: `File ${fileName} not found or not open`
              });
              return;
            }

            // Open the document if it's not already open
            const editor = await vscode.window.showTextDocument(targetDocument);

            // Find the line to replace
            const lineIndex = lineNumber - 1; // Convert to 0-based index
            if (lineIndex < 0 || lineIndex >= targetDocument.lineCount) {
              webviewView.webview.postMessage({
                type: "applyError",
                message: `Line ${lineNumber} is out of range`
              });
              return;
            }

            const line = targetDocument.lineAt(lineIndex);
            const lineRange = new vscode.Range(line.range.start, line.range.end);

            // Apply the edit
            await editor.edit(editBuilder => {
              editBuilder.replace(lineRange, newCode);
            });

            // Highlight the changed line
            editor.selection = new vscode.Selection(lineRange.start, lineRange.end);
            editor.revealRange(lineRange, vscode.TextEditorRevealType.InCenter);

            webviewView.webview.postMessage({
              type: "applySuccess",
              fileName: fileName,
              lineNumber: lineNumber
            });

            vscode.window.showInformationMessage(`Applied change to ${fileName} line ${lineNumber}`);

          } catch (error) {
            webviewView.webview.postMessage({
              type: "applyError",
              message: error instanceof Error ? error.message : "Unknown error"
            });
          }
          break;
        case "showReviewResults":
          // Handle displaying review results in chat
          try {
            const { reviewData, fileName } = data;

            // Send review results to chat panel
            await this.sendReviewResults(reviewData, fileName);

          } catch (error) {
            webviewView.webview.postMessage({
              type: "error",
              content: "Error displaying review results: " +
                (error instanceof Error ? error.message : "Unknown error")
            });
          }
          break;
        case "getSelectedCode":
          const currentEditor = vscode.window.activeTextEditor;
          if (currentEditor && !currentEditor.selection.isEmpty) {
            const selectedCode = currentEditor.document.getText(
              currentEditor.selection
            );
            const fileName =
              currentEditor.document.fileName.split(/[\\/]/).pop() || "";
            const lineStart = currentEditor.selection.start.line + 1;
            const lineEnd = currentEditor.selection.end.line + 1;

            webviewView.webview.postMessage({
              type: "selectedCode",
              selectedCode: selectedCode,
              fileName: fileName,
              lineStart: lineStart,
              lineEnd: lineEnd,
            });
          } else {
            webviewView.webview.postMessage({
              type: "selectedCode",
              selectedCode: "",
              fileName: "",
              lineStart: 0,
              lineEnd: 0,
            });
          }
          break;
        case "applyCodeBlock": {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            await activeEditor.edit((editBuilder) => {
              editBuilder.replace(activeEditor.selection, data.code);
            });
            vscode.window.showInformationMessage(
              "Code block applied to editor."
            );
          } else {
            vscode.window.showErrorMessage(
              "No active editor to apply code block."
            );
          }
          break;
        }
      }
    });

    // Listen for text selection changes
    vscode.window.onDidChangeTextEditorSelection(() => {
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        const selectedCode = editor.document.getText(editor.selection);
        const fileName = editor.document.fileName.split(/[\\/]/).pop() || "";
        const lineStart = editor.selection.start.line + 1;
        const lineEnd = editor.selection.end.line + 1;

        webviewView.webview.postMessage({
          type: "selectedCode",
          selectedCode: selectedCode,
          fileName: fileName,
          lineStart: lineStart,
          lineEnd: lineEnd,
        });
      } else {
        webviewView.webview.postMessage({
          type: "selectedCode",
          selectedCode: "",
          fileName: "",
          lineStart: 0,
          lineEnd: 0,
        });
      }
    });
  }

  private replaceRelativePaths(htmlContent: string, webview: vscode.Webview): string {
    // Convert any relative paths to webview URIs
    // This is a simple implementation - you might need more sophisticated path handling
    return htmlContent;
  }

  private getFallbackHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
          <head>
              <meta charset="UTF-8">
          <title>Chat Panel</title>
          </head>
          <body>
          <h3>Chat Panel</h3>
          <p>Error loading chat panel. Please check the extension configuration.</p>
      </body>
      </html>
    `;
  }

  public async sendReviewResults(reviewData: any, fileName: string) {
    // Ensure chat panel is visible
    await this.ensureChatPanelVisible();

    // Send the review results
    this._view?.webview.postMessage({
      type: 'reviewResults',
      reviewData: reviewData,
      fileName: fileName
    });
  }

  private async ensureChatPanelVisible(): Promise<void> {
    // Check if chat panel is already visible
    if (this._view && this._view.visible) {
      return;
    }

    // Try to show the chat panel
    try {
      await vscode.commands.executeCommand('aiReviewer.chatPanel.focus');
    } catch (error) {
      console.warn('Failed to focus chat panel:', error);
      // Fallback: try to show the sidebar
      try {
        await vscode.commands.executeCommand('workbench.view.extension.ai-reviewer-sidebar');
      } catch (fallbackError) {
        console.warn('Failed to show sidebar:', fallbackError);
      }
    }
  }

  public updateCodeSelection(fileName: string, lineStart: number, lineEnd: number) {
    this._view?.webview.postMessage({
      type: 'selectedCode',
      fileName: fileName,
      lineStart: lineStart,
      lineEnd: lineEnd,
      selectedCode: true
    });
  }

  public clearCodeSelection() {
    this._view?.webview.postMessage({
      type: 'selectedCode',
      selectedCode: false
    });
  }
}
