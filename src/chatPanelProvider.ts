import * as vscode from "vscode";
import { debugOutputChannel, logDebug, parseLineNumberFromResponse } from "./utils";
import { LLMProviderFactory } from "./llmProvider";
import * as path from 'path';
import * as fs from 'fs';
import { marked } from "marked";
import { ChatHistoryManager } from "./chatHistoryManager";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aiReviewer.chatPanel";
  private _view?: vscode.WebviewView;
  private chatHistoryManager: ChatHistoryManager;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.chatHistoryManager = ChatHistoryManager.getInstance();
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

    // Load chat history if available - with longer timeout to ensure webview is ready
    setTimeout(() => {
      this.loadChatHistory();
    }, 500);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "webviewReady":
          // Webview is ready, load chat history
          this.loadChatHistory();
          break;
        case "sendMessage":
          try {
            const config = vscode.workspace.getConfiguration("aiReviewer");


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

            // Save user message to chat history
            this.chatHistoryManager.addMessage(
              data.message,
              true, // isUser
              codeSelections,
              fileName,
              lineStart,
              lineEnd
            );

            // Get conversation context for LLM
            const conversationContext = this.chatHistoryManager.getConversationContext(5);

            // Prepare prompt with conversation context, selected code and user message
            let prompt = data.message;
            if (conversationContext) {
              prompt = `${conversationContext}\n\nCurrent Question: ${data.message}`;
            }
            if (selectedCode) {
              prompt = `${selectedCode}\n\n${prompt}`;
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
                hasContext: conversationContext ? "Yes" : "No",
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
              let accumulatedText = "";

              await llmProvider.callLLMStream(
                prompt,
                cancellationTokenSource.token,
                async (chunk: string) => {
                  // Accumulate text and parse markdown in extension
                  accumulatedText += chunk;

                  // Parse markdown to HTML
                  const htmlContent = marked.parse(accumulatedText);

                  // Send HTML chunk for smooth streaming
                  webviewView.webview.postMessage({
                    type: "streamChunk",
                    chunk: htmlContent,
                    isHtml: true,
                  });
                }
              );

              // Save AI response to chat history (save raw markdown text)
              this.chatHistoryManager.addMessage(
                accumulatedText,
                false, // isUser = false (AI response)
                codeSelections,
                fileName,
                lineStart,
                lineEnd
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

            // Parse line number if it's a string or needs parsing
            let parsedLineNumber = lineNumber;
            if (typeof lineNumber === 'string') {
              const extractedLineNumber = parseLineNumberFromResponse(lineNumber);
              if (extractedLineNumber !== null) {
                parsedLineNumber = extractedLineNumber;
                logDebug(debugOutputChannel, `[ApplyCode] Parsed line number from "${lineNumber}" to ${parsedLineNumber}`);
              } else {
                logDebug(debugOutputChannel, `[ApplyCode] Could not parse line number from "${lineNumber}"`);
              }
            }

            // Find the document by file name - improved logic
            const documents = vscode.workspace.textDocuments;
            let targetDocument = documents.find(doc =>
              doc.fileName.endsWith(fileName) ||
              doc.fileName.includes(fileName) ||
              doc.fileName.split(/[\\/]/).pop() === fileName
            );

            // If not found in open documents, try to find in workspace
            if (!targetDocument) {
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
              if (workspaceFolder) {
                const possiblePaths = [
                  path.join(workspaceFolder.uri.fsPath, fileName),
                  path.join(workspaceFolder.uri.fsPath, 'src', fileName),
                  path.join(workspaceFolder.uri.fsPath, 'lib', fileName),
                  path.join(workspaceFolder.uri.fsPath, 'app', fileName)
                ];

                for (const filePath of possiblePaths) {
                  try {
                    if (fs.existsSync(filePath)) {
                      targetDocument = await vscode.workspace.openTextDocument(filePath);
                      break;
                    }
                  } catch (error) {
                    // Continue to next path
                  }
                }
              }
            }

            if (!targetDocument) {
              webviewView.webview.postMessage({
                type: "applyError",
                message: `File ${fileName} not found. Please make sure the file is open or exists in the workspace.`
              });
              return;
            }

            // Open the document if it's not already open
            const editor = await vscode.window.showTextDocument(targetDocument);

            // Find the line to replace
            const lineIndex = parsedLineNumber - 1; // Convert to 0-based index
            if (lineIndex < 0 || lineIndex >= targetDocument.lineCount) {
              webviewView.webview.postMessage({
                type: "applyError",
                message: `Line ${parsedLineNumber} is out of range (document has ${targetDocument.lineCount} lines)`
              });
              return;
            }

            const line = targetDocument.lineAt(lineIndex);
            const lineRange = new vscode.Range(line.range.start, line.range.end);

            // Verify the original code matches (optional safety check)
            const currentLineText = targetDocument.getText(lineRange);
            if (originalCode && currentLineText.trim() !== originalCode.trim()) {
              logDebug(debugOutputChannel, `[ApplyCode] Original code mismatch. Expected: "${originalCode}", Found: "${currentLineText}"`);
              // Continue anyway, but log the mismatch
            }

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
              lineNumber: parsedLineNumber
            });

            vscode.window.showInformationMessage(`Applied change to ${fileName} line ${parsedLineNumber}`);

          } catch (error) {
            logDebug(debugOutputChannel, `[ApplyCode] Error: ${error}`);
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

  public async loadChatHistory() {
    if (!this._view) {
      logDebug(debugOutputChannel, "[ChatHistory] No webview available for loading history");
      return;
    }

    const currentSession = this.chatHistoryManager.getCurrentSession();
    if (!currentSession || currentSession.messages.length === 0) {
      logDebug(debugOutputChannel, "[ChatHistory] No current session or messages to load");
      return;
    }

    logDebug(debugOutputChannel, `[ChatHistory] Loading ${currentSession.messages.length} messages from session ${currentSession.id}`);

    // Parse markdown for AI messages before sending to webview
    const processedMessages = currentSession.messages.map(msg => {
      if (msg.isUser) {
        // User messages: keep as is
        return msg;
      } else {
        // AI messages: parse markdown to HTML
        try {
          const parsedContent = marked.parse(msg.content);
          return {
            ...msg,
            content: parsedContent,
            isHtml: true // Flag to indicate this is HTML content
          };
        } catch (error) {
          logDebug(debugOutputChannel, `[ChatHistory] Error parsing markdown: ${error}`);
          return msg; // Return original if parsing fails
        }
      }
    });

    // Send all messages from current session to chat panel
    this._view.webview.postMessage({
      type: 'loadChatHistory',
      messages: processedMessages
    });
  }

  public async clearChatPanel() {
    if (!this._view) {
      return;
    }

    // Clear the chat panel
    this._view.webview.postMessage({
      type: 'clearChatPanel'
    });
  }

  public isWebviewAvailable(): boolean {
    return !!this._view;
  }

  public async testApplyCodeChange(fileName: string, lineNumber: number, newCode: string, originalCode: string): Promise<void> {
    if (!this._view) {
      throw new Error("Webview not available");
    }

    this._view.webview.postMessage({
      type: "applyCodeChange",
      fileName: fileName,
      lineNumber: lineNumber,
      newCode: newCode,
      originalCode: originalCode
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
