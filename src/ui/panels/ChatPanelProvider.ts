import * as vscode from "vscode";
import { Logger, debugOutputChannel, VSCodeUtils } from "../../utils";
import { LLMProviderFactory } from "../../services/llm/providers";
import * as path from "path";
import * as fs from "fs";
import { marked } from "marked";
import { ChatHistoryManager } from "../../core/managers/ChatHistoryManager";
import { ViolationStorageManager } from "../../services/storage/managers/ViolationStorageManager";
import { TemplateRenderer } from "../../utils/template/TemplateRenderer";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aiReviewer.chatPanel";
  private _view?: vscode.WebviewView;
  private chatHistoryManager: ChatHistoryManager;
  private violationStorageManager: ViolationStorageManager;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.chatHistoryManager = ChatHistoryManager.getInstance();
    this.violationStorageManager = ViolationStorageManager.getInstance();

    // Listen for workspace changes to refresh chat history
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (this._view && this._view.visible) {
        setTimeout(() => {
          this.loadChatHistory();
        }, 100);
      }
    });
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
      "chatPanelRefactored.html"
    );
    let htmlContent = "";

    try {
      htmlContent = fs.readFileSync(htmlPath, "utf8");
    } catch (error) {
      console.error("Error reading chatPanelRefactored.html:", error);
      htmlContent = this.getFallbackHtml();
    }

    // Replace any relative paths with webview URIs
    htmlContent = this.replaceRelativePaths(htmlContent, webviewView.webview);

    webviewView.webview.html = htmlContent;

    // Load chat history when webview becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        // Small delay to ensure webview is fully ready
        setTimeout(() => {
          this.loadChatHistory();
        }, 100);
      }
    });

    // Load chat history initially with longer timeout to ensure webview is ready
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
            const conversationContext =
              this.chatHistoryManager.getConversationContext(5);

            // Prepare prompt with conversation context, selected code and user message
            let prompt = data.message;
            if (conversationContext) {
              prompt = `${conversationContext}\n\nCurrent Question: ${data.message}`;
            }
            if (selectedCode) {
              prompt = `${selectedCode}\n\n${prompt}`;
            }

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
            if (typeof lineNumber === "string") {
              const extractedLineNumber =
                VSCodeUtils.parseLineNumberFromResponse(lineNumber);
              if (extractedLineNumber !== null) {
                parsedLineNumber = extractedLineNumber;
              } else {
                console.log(
                  `[ApplyCode] Could not parse line number from "${lineNumber}"`
                );
              }
            }

            // Find the document by file name - improved logic
            const documents = vscode.workspace.textDocuments;
            let targetDocument = documents.find(
              (doc) =>
                doc.fileName.endsWith(fileName) ||
                doc.fileName.includes(fileName) ||
                doc.fileName.split(/[\\/]/).pop() === fileName
            );

            if (!targetDocument) {
              // Try to find by relative path
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
              if (workspaceFolder) {
                const fullPath = path.join(
                  workspaceFolder.uri.fsPath,
                  fileName
                );
                targetDocument = documents.find(
                  (doc) => doc.fileName === fullPath
                );
              }
            }

            if (!targetDocument) {
              // Try to find by searching in workspace
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
              if (workspaceFolder) {
                const pattern = `**/${fileName}`;
                const files = await vscode.workspace.findFiles(
                  pattern,
                  "**/node_modules/**"
                );
                if (files.length > 0) {
                  targetDocument = await vscode.workspace.openTextDocument(
                    files[0]
                  );
                }
              }
            }

            if (!targetDocument) {
              webviewView.webview.postMessage({
                type: "applyError",
                message: `Could not find document for file: ${fileName}. Please make sure the file is open in the editor.`,
              });
              return;
            }

            // Open the document if it's not already open
            const document = await vscode.workspace.openTextDocument(
              targetDocument.uri
            );
            const editor = await vscode.window.showTextDocument(document);

            // Find the line and apply the change
            const line = document.lineAt(parsedLineNumber - 1);
            const lineText = line.text;

            // Find the original code in the line and replace it
            let range: vscode.Range;
            let cleanedNewCode: string;

            if (originalCode && originalCode.trim()) {
              // Try to find the original code in the line
              const originalCodeTrimmed = originalCode.trim();
              const originalCodeIndex = lineText.indexOf(originalCodeTrimmed);

              if (originalCodeIndex !== -1) {
                // Found the original code, replace only that part
                range = new vscode.Range(
                  new vscode.Position(parsedLineNumber - 1, originalCodeIndex),
                  new vscode.Position(
                    parsedLineNumber - 1,
                    originalCodeIndex + originalCodeTrimmed.length
                  )
                );

                // Clean up the new code (remove extra whitespace/newlines)
                cleanedNewCode = newCode.trim();
              } else {
                // Original code not found, replace the entire line
                range = new vscode.Range(
                  new vscode.Position(parsedLineNumber - 1, 0),
                  new vscode.Position(parsedLineNumber - 1, lineText.length)
                );

                // Preserve indentation from the original line
                const indentation = lineText.match(/^\s*/)?.[0] || "";
                cleanedNewCode = indentation + newCode.trim();
              }
            } else {
              // No original code provided, replace the entire line
              range = new vscode.Range(
                new vscode.Position(parsedLineNumber - 1, 0),
                new vscode.Position(parsedLineNumber - 1, lineText.length)
              );

              // Preserve indentation from the original line
              const indentation = lineText.match(/^\s*/)?.[0] || "";
              cleanedNewCode = indentation + newCode.trim();
            }

            await editor.edit((editBuilder) => {
              editBuilder.replace(range, cleanedNewCode);
            });

            // Show success message
            webviewView.webview.postMessage({
              type: "applySuccess",
              fileName: fileName,
              lineNumber: parsedLineNumber,
            });
          } catch (error) {
            webviewView.webview.postMessage({
              type: "applyError",
              message: `Failed to apply code change: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "updateViolationStatus":
          // Handle updating violation status (approve/reject)
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
        case "showReviewResults":
          // Handle displaying review results in chat
          try {
            const { reviewData, fileName } = data;

            // Send review results to chat panel
            await this.sendReviewResults(reviewData, fileName);
          } catch (error) {
            webviewView.webview.postMessage({
              type: "error",
              content:
                "Error displaying review results: " +
                (error instanceof Error ? error.message : "Unknown error"),
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
        case "openFile":
          // Handle opening file
          try {
            const { fileName } = data;

            // Find the file in workspace
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
              // Try multiple strategies to find the file
              let fileUri: vscode.Uri | undefined;

              // Strategy 1: Try exact path
              const exactPath = path.join(workspaceFolder.uri.fsPath, fileName);
              if (fs.existsSync(exactPath)) {
                fileUri = vscode.Uri.file(exactPath);
              }

              // Strategy 2: Try searching by filename
              if (!fileUri) {
                const pattern = `**/${fileName}`;
                const files = await vscode.workspace.findFiles(
                  pattern,
                  "**/node_modules/**"
                );
                if (files.length > 0) {
                  fileUri = files[0];
                }
              }

              // Strategy 3: Try searching by filename without extension
              if (!fileUri) {
                const fileNameWithoutExt = fileName.split(".")[0];
                const pattern = `**/${fileNameWithoutExt}.*`;
                const files = await vscode.workspace.findFiles(
                  pattern,
                  "**/node_modules/**"
                );
                if (files.length > 0) {
                  fileUri = files[0];
                }
              }

              if (fileUri) {
                // Open the file
                const document = await vscode.workspace.openTextDocument(
                  fileUri
                );
                await vscode.window.showTextDocument(document);
              } else {
                webviewView.webview.postMessage({
                  type: "error",
                  content: `Could not find file: ${fileName}`,
                });
              }
            } else {
              webviewView.webview.postMessage({
                type: "error",
                content: "No workspace folder found",
              });
            }
          } catch (error) {
            webviewView.webview.postMessage({
              type: "error",
              content: `Error opening file: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "clearChatHistory": {
          try {
            const result = await vscode.window.showWarningMessage(
              "Are you sure you want to clear all chat history? This action cannot be undone.",
              { modal: true },
              "Yes, Clear All"
            );

            if (result === "Yes, Clear All") {
              await this.chatHistoryManager.clearAllHistory();
              this._view?.webview.postMessage({
                type: "clearChatHistory",
              });
              this._view?.webview.postMessage({
                type: "showMessage",
                message: "Chat history cleared successfully!",
                level: "success",
              });
            }
          } catch (error) {
            this._view?.webview.postMessage({
              type: "showMessage",
              message: `Error: ${
                error instanceof Error ? error.message : error
              }`,
              level: "error",
            });
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

  private replaceRelativePaths(
    htmlContent: string,
    webview: vscode.Webview
  ): string {
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

  public async sendReviewResults(
    reviewData: any,
    fileName: string
  ): Promise<void> {
    // This method is deprecated - review results should be sent to ReviewPanelProvider
    console.warn(
      "sendReviewResults is deprecated. Use ReviewPanelProvider instead."
    );
    // This method is no longer used - review results are handled by ReviewPanelProvider
  }

  public async updateViolationStatus(
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
        // Notify webview about the status update
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
      return false;
    }
  }

  public async loadChatHistory(): Promise<void> {
    try {
      if (!this._view) {
        return;
      }

      const history = await this.chatHistoryManager.getCurrentSession();

      // Convert markdown to HTML for AI messages in history
      if (history && history.messages) {
        history.messages = history.messages.map((msg: any) => ({
          ...msg,
          content: msg.isUser ? msg.content : marked.parse(msg.content || ""),
        }));
      }

      this._view.webview.postMessage({
        type: "loadChatHistory",
        history: history || {
          id: "",
          title: "",
          messages: [],
          timestamp: Date.now(),
        },
      });
    } catch (error) {}
  }

  public async clearChatPanel(): Promise<void> {
    try {
      this._view?.webview.postMessage({
        type: "clearChatPanel",
      });
    } catch (error) {}
  }

  public async refreshChatHistory(): Promise<void> {
    try {
      if (!this._view) {
        return;
      }

      await this.loadChatHistory();
    } catch (error) {}
  }

  public isWebviewAvailable(): boolean {
    return !!this._view;
  }

  private async ensureChatPanelVisible(): Promise<void> {
    // Check if chat panel is already visible
    if (this._view && this._view.visible) {
      return;
    }

    // Try to show the chat panel
    try {
      await vscode.commands.executeCommand("aiReviewer.chatPanel.focus");
    } catch (error) {
      console.warn("Failed to focus chat panel:", error);
      // Fallback: try to show the sidebar
      try {
        await vscode.commands.executeCommand(
          "workbench.view.extension.ai-reviewer-sidebar"
        );
      } catch (fallbackError) {
        console.warn("Failed to show sidebar:", fallbackError);
      }
    }
  }

  public updateCodeSelection(
    fileName: string,
    lineStart: number,
    lineEnd: number
  ) {
    this._view?.webview.postMessage({
      type: "selectedCode",
      fileName: fileName,
      lineStart: lineStart,
      lineEnd: lineEnd,
      selectedCode: true,
    });
  }

  public clearCodeSelection() {
    this._view?.webview.postMessage({
      type: "selectedCode",
      selectedCode: false,
    });
  }
}
