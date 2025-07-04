// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { marked } from "marked";

// Debug logger using VS Code output channel
let debugOutputChannel: vscode.OutputChannel;

function logDebug(message: string, data?: any) {
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

class SettingsPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ai-reviewer-settings";

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "getSettings": {
          const config = vscode.workspace.getConfiguration("aiReviewer");
          webviewView.webview.postMessage({
            type: "settings",
            apiToken: config.get<string>("apiToken", ""),
            codingConvention: config.get<string>("codingConvention", ""),
            llmEndpoint: config.get<string>(
              "llmEndpoint",
              "http://localhost:11434/api/generate"
            ),
            llmModel: config.get<string>("llmModel", "llama3"),
            suggestionDisplayMode: config.get<string>(
              "suggestionDisplayMode",
              "panel"
            ),
            baseBranch: config.get<string>("baseBranch", "main"),
            ghostTextEnabled: config.get<boolean>("ghostTextEnabled", true),
          });
          break;
        }
        case "updateSettings": {
          const workspaceConfig =
            vscode.workspace.getConfiguration("aiReviewer");
          await workspaceConfig.update(
            "apiToken",
            data.apiToken,
            vscode.ConfigurationTarget.Global
          );
          await workspaceConfig.update(
            "codingConvention",
            data.codingConvention,
            vscode.ConfigurationTarget.Global
          );
          await workspaceConfig.update(
            "llmEndpoint",
            data.llmEndpoint,
            vscode.ConfigurationTarget.Global
          );
          await workspaceConfig.update(
            "llmModel",
            data.llmModel,
            vscode.ConfigurationTarget.Global
          );
          await workspaceConfig.update(
            "suggestionDisplayMode",
            data.suggestionDisplayMode,
            vscode.ConfigurationTarget.Global
          );
          await workspaceConfig.update(
            "baseBranch",
            data.baseBranch,
            vscode.ConfigurationTarget.Global
          );
          await workspaceConfig.update(
            "ghostTextEnabled",
            data.ghostTextEnabled,
            vscode.ConfigurationTarget.Global
          );
          vscode.window.showInformationMessage(
            "Settings updated successfully!"
          );
          break;
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>AI Reviewer Settings</title>
			<script src="https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js"></script>
			<style>
				body {
					padding: 20px;
					font-family: var(--vscode-font-family);
					color: var(--vscode-foreground);
					background-color: var(--vscode-editor-background);
				}
				.form-group {
					margin-bottom: 15px;
				}
				label {
					display: block;
					margin-bottom: 5px;
					font-weight: bold;
				}
				input, textarea {
					width: 100%;
					padding: 8px;
					border: 1px solid var(--vscode-input-border);
					background-color: var(--vscode-input-background);
					color: var(--vscode-input-foreground);
					border-radius: 4px;
					box-sizing: border-box;
				}
				select {
					width: 100%;
					padding: 8px;
					border: 1px solid var(--vscode-input-border);
					background-color: var(--vscode-input-background);
					color: var(--vscode-input-foreground);
					border-radius: 4px;
					box-sizing: border-box;
				}
				textarea {
					resize: vertical;
					min-height: 80px;
				}
				button {
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
					width: 100%;
					margin-top: 10px;
				}
				button:hover {
					background-color: var(--vscode-button-hoverBackground);
				}
				.status {
					margin-top: 10px;
					padding: 8px;
					border-radius: 4px;
					font-size: 12px;
				}
				.status.success {
					background-color: var(--vscode-notificationsInfoBackground);
					color: var(--vscode-notificationsInfoForeground);
				}

				/* Markdown Editor Styles */
				.markdown-editor {
					border: 1px solid var(--vscode-input-border);
					border-radius: 4px;
					background-color: var(--vscode-input-background);
				}

				.editor-tabs {
					display: flex;
					border-bottom: 1px solid var(--vscode-input-border);
					background-color: var(--vscode-editor-background);
				}

				.tab-btn {
					background: none;
					border: none;
					padding: 8px 16px;
					cursor: pointer;
					color: var(--vscode-foreground);
					border-bottom: 2px solid transparent;
					font-size: 12px;
				}

				.tab-btn:hover {
					background-color: var(--vscode-list-hoverBackground);
				}

				.tab-btn.active {
					border-bottom-color: var(--vscode-button-background);
					background-color: var(--vscode-input-background);
				}

				.tab-content {
					position: relative;
				}

				.tab-pane {
					display: none;
					padding: 8px;
				}

				.tab-pane.active {
					display: block;
				}

				.markdown-preview {
					min-height: 600px;
					overflow-y: auto;
					padding: 8px;
					background-color: var(--vscode-editor-background);
					border: 1px solid var(--vscode-input-border);
					border-radius: 4px;
					font-size: 13px;
					line-height: 1.4;
				}

				/* Markdown Preview Styling */
				.markdown-preview h1,
				.markdown-preview h2,
				.markdown-preview h3,
				.markdown-preview h4,
				.markdown-preview h5,
				.markdown-preview h6 {
					margin: 8px 0 4px 0;
					color: var(--vscode-editor-foreground);
				}

				.markdown-preview h1 { font-size: 16px; }
				.markdown-preview h2 { font-size: 14px; }
				.markdown-preview h3 { font-size: 13px; }

				.markdown-preview p {
					margin: 4px 0;
				}

				.markdown-preview ul,
				.markdown-preview ol {
					margin: 4px 0;
					padding-left: 20px;
				}

				.markdown-preview li {
					margin: 2px 0;
				}

				.markdown-preview code {
					background-color: var(--vscode-textCodeBlock-background);
					color: var(--vscode-textCodeBlock-foreground);
					padding: 2px 4px;
					border-radius: 3px;
					font-family: var(--vscode-editor-font-family);
					font-size: 12px;
				}

				.markdown-preview pre {
					background-color: var(--vscode-textCodeBlock-background);
					border: 1px solid var(--vscode-input-border);
					border-radius: 4px;
					padding: 8px;
					margin: 8px 0;
					overflow-x: auto;
				}

				.markdown-preview pre code {
					background: none;
					padding: 0;
					border-radius: 0;
				}

				.markdown-preview blockquote {
					border-left: 3px solid var(--vscode-input-border);
					margin: 8px 0;
					padding-left: 12px;
					color: var(--vscode-descriptionForeground);
				}

				.markdown-preview strong {
					font-weight: bold;
				}

				.markdown-preview em {
					font-style: italic;
				}
			</style>
		</head>
		<body>
			<h3>AI Reviewer Settings</h3>
			<div class="form-group">
				<label for="apiToken">API Token:</label>
				<input type="password" id="apiToken" placeholder="Enter your API token">
			</div>
            <div class="form-group">
				<label for="llmEndpoint">LLM API Endpoint:</label>
				<input type="text" id="llmEndpoint" placeholder="http://localhost:11434/api/generate">
			</div>
			<div class="form-group">
				<label for="llmModel">LLM Model:</label>
				<input type="text" id="llmModel" placeholder="llama3">
			</div>
			<div class="form-group">
				<label for="suggestionDisplayMode">Suggestion Display Mode:</label>
				<select id="suggestionDisplayMode">
					<option value="panel">Panel (Separate webview)</option>
					<option value="inline">Inline (Editor diagnostics)</option>
				</select>
			</div>
			<div class="form-group">
				<label for="baseBranch">Base Branch for PR Review:</label>
				<input type="text" id="baseBranch" placeholder="main">
			</div>
			<div class="form-group">
				<label for="ghostTextEnabled">
					<input type="checkbox" id="ghostTextEnabled" style="width: auto; margin-right: 8px;">
					Enable AI Ghost Text Suggestions
				</label>
				<small style="color: var(--vscode-descriptionForeground); display: block; margin-top: 4px;">
					Show AI-powered code suggestions as ghost text while typing
				</small>
			</div>
			<div class="form-group">
				<label for="codingConvention">Coding Convention:</label>
				<div class="markdown-editor">
					<div class="editor-tabs">
						<button type="button" class="tab-btn active" data-tab="edit">Edit</button>
						<button type="button" class="tab-btn" data-tab="preview">Preview</button>
					</div>
					<div class="tab-content">
						<div class="tab-pane active" id="edit-tab">
							<textarea rows="20" id="codingConvention" placeholder="Enter your coding convention rules in markdown format&#10;&#10;Example:&#10;# Coding Standards&#10;&#10;## Naming Conventions&#10;- Use camelCase for variables and functions&#10;- Use PascalCase for classes&#10;&#10;## Code Style&#10;- Use 2 spaces for indentation&#10;- Always use semicolons&#10;&#10;## Best Practices&#10;- Write meaningful variable names&#10;- Add comments for complex logic"></textarea>
						</div>
						<div class="tab-pane" id="preview-tab">
							<div id="markdown-preview" class="markdown-preview"></div>
						</div>
					</div>
				</div>
			</div>

			<button id="saveBtn">Save Settings</button>
			<div id="status" class="status" style="display: none;"></div>

			<script>
				const vscode = acquireVsCodeApi();

				// Request current settings when page loads
				vscode.postMessage({ type: 'getSettings' });

				// Listen for settings from extension
				window.addEventListener('message', event => {
					const message = event.data;
					switch (message.type) {
						case 'settings':
							document.getElementById('apiToken').value = message.apiToken || '';
							document.getElementById('codingConvention').value = message.codingConvention || '';
							document.getElementById('llmEndpoint').value = message.llmEndpoint || '';
							document.getElementById('llmModel').value = message.llmModel || '';
							document.getElementById('suggestionDisplayMode').value = message.suggestionDisplayMode || 'panel';
							document.getElementById('baseBranch').value = message.baseBranch || 'main';
							document.getElementById('ghostTextEnabled').checked = message.ghostTextEnabled || false;
							break;
					}
				});

				// Handle save button click
				document.getElementById('saveBtn').addEventListener('click', () => {
					const apiToken = document.getElementById('apiToken').value;
					const codingConvention = document.getElementById('codingConvention').value;
					const llmEndpoint = document.getElementById('llmEndpoint').value;
					const llmModel = document.getElementById('llmModel').value;
					const suggestionDisplayMode = document.getElementById('suggestionDisplayMode').value;
					const baseBranch = document.getElementById('baseBranch').value;
					const ghostTextEnabled = document.getElementById('ghostTextEnabled').checked;

					vscode.postMessage({
						type: 'updateSettings',
						apiToken: apiToken,
						codingConvention: codingConvention,
						llmEndpoint: llmEndpoint,
						llmModel: llmModel,
						suggestionDisplayMode: suggestionDisplayMode,
						baseBranch: baseBranch,
						ghostTextEnabled: ghostTextEnabled
					});

					// Show success message
					const status = document.getElementById('status');
					status.textContent = 'Settings saved successfully!';
					status.className = 'status success';
					status.style.display = 'block';

					setTimeout(() => {
						status.style.display = 'none';
					}, 3000);
				});

				// Markdown Editor Tab Functionality
				document.querySelectorAll('.tab-btn').forEach(btn => {
					btn.addEventListener('click', () => {
						const tabName = btn.getAttribute('data-tab');

						// Update active tab button
						document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
						btn.classList.add('active');

						// Update active tab content
						document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
						document.getElementById(tabName + '-tab').classList.add('active');

						// If switching to preview, update the preview content
						if (tabName === 'preview') {
							updateMarkdownPreview();
						}
					});
				});

				// Update markdown preview
				function updateMarkdownPreview() {
					const markdownText = document.getElementById('codingConvention').value;
					const previewElement = document.getElementById('markdown-preview');

					if (markdownText.trim() === '') {
						previewElement.innerHTML = '<em>No content to preview</em>';
						return;
					}

					// Use marked library for markdown to HTML conversion (synchronous)
					try {
						const html = marked.parse(markdownText);
						previewElement.innerHTML = html;
					} catch (error) {
						previewElement.innerHTML = '<em>Error rendering markdown</em>';
						console.error('Markdown preview error:', error);
					}
				}

				// Auto-update preview when typing (with debounce)
				let previewTimeout;
				document.getElementById('codingConvention').addEventListener('input', () => {
					clearTimeout(previewTimeout);
					previewTimeout = setTimeout(() => {
						if (document.getElementById('preview-tab').classList.contains('active')) {
							updateMarkdownPreview();
						}
					}, 300);
				});
			</script>
		</body>
		</html>`;
  }
}

class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ai-reviewer-chat";

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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
            logDebug("=== AI Reviewer Chat - Prompt Debug ===", {
              selectedCode: selectedCode
                ? `Yes (${codeSelections.length} selections)`
                : "No",
              userMessage: data.message,
              prompt:
                prompt.substring(0, 300) + (prompt.length > 300 ? "..." : ""),
            });

            // Send initial response message to create the AI message bubble
            webviewView.webview.postMessage({
              type: "startStreaming",
              codeSelections: codeSelections,
              fileName: fileName,
              lineStart: lineStart,
              lineEnd: lineEnd,
            });

            // Create a cancellation token for this request
            const cancellationTokenSource = new vscode.CancellationTokenSource();

            // Store the cancellation token source so it can be cancelled from the webview
            (webviewView as any).currentCancellationTokenSource = cancellationTokenSource;

            // Use cancellable streaming LLM call with raw text streaming
            try {
              await callLLMStreamWithCancellation(
                apiToken,
                prompt,
                llmEndpoint,
                llmModel,
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
              if (error instanceof Error && error.message === 'Request cancelled by user') {
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
          const currentCancellationTokenSource = (webviewView as any).currentCancellationTokenSource;
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

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>AI Reviewer Chat</title>
			<style>
				body {
					padding: 10px;
					font-family: var(--vscode-font-family);
					color: var(--vscode-foreground);
					background-color: var(--vscode-editor-background);
					height: 100vh;
					display: flex;
					flex-direction: column;
					margin: 0;
				}

				.chat-container {
					display: flex;
					flex-direction: column;
					height: 100%;
				}

				.code-chip {
					background-color: var(--vscode-badge-background);
					color: var(--vscode-badge-foreground);
					padding: 4px 8px;
					border-radius: 12px;
					font-size: 11px;
					margin-bottom: 10px;
					display: none;
					word-break: break-all;
				}

				.messages-container {
					flex: 1;
					overflow-y: auto;
					margin-bottom: 10px;
					padding: 10px;
					border: 1px solid var(--vscode-input-border);
					border-radius: 4px;
					background-color: var(--vscode-input-background);
					display: flex;
					flex-direction: column;
				}

				.message {
					margin-bottom: 15px;
					display: flex;
					flex-direction: column;
				}

				.message.user {
					align-items: flex-end;
				}

				.message.ai {
					align-items: flex-start;
				}

				.message-bubble {
					max-width: 80%;
					padding: 8px 12px;
					border-radius: 12px;
					word-wrap: break-word;
					white-space: pre-wrap;
					font-size: 13px;
					line-height: 1.4;
				}

				.message.user .message-bubble {
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border-bottom-right-radius: 4px;
				}

				.message.ai .message-bubble {
					background-color: var(--vscode-editor-background);
					color: var(--vscode-foreground);
					border: 1px solid var(--vscode-input-border);
					border-bottom-left-radius: 4px;
				}

				/* Markdown styling */
				.message.ai .message-bubble h1,
				.message.ai .message-bubble h2,
				.message.ai .message-bubble h3,
				.message.ai .message-bubble h4,
				.message.ai .message-bubble h5,
				.message.ai .message-bubble h6 {
					margin: 8px 0 4px 0;
					color: var(--vscode-editor-foreground);
				}

				.message.ai .message-bubble h1 { font-size: 18px; }
				.message.ai .message-bubble h2 { font-size: 16px; }
				.message.ai .message-bubble h3 { font-size: 14px; }

				.message.ai .message-bubble p {
					margin: 4px 0;
					line-height: 1.4;
				}

				.message.ai .message-bubble ul,
				.message.ai .message-bubble ol {
					margin: 4px 0;
					padding-left: 20px;
				}

				.message.ai .message-bubble li {
					margin: 2px 0;
				}

				.message.ai .message-bubble code {
					background-color: var(--vscode-textCodeBlock-background);
					color: var(--vscode-textCodeBlock-foreground);
					padding: 2px 4px;
					border-radius: 3px;
					font-family: var(--vscode-editor-font-family);
					font-size: 12px;
				}

				.message.ai .message-bubble pre {
					background-color: var(--vscode-textCodeBlock-background);
					border: 1px solid var(--vscode-input-border);
					border-radius: 4px;
					padding: 8px;
					margin: 8px 0;
					overflow-x: auto;
				}

				.message.ai .message-bubble pre code {
					background: none;
					padding: 0;
					border-radius: 0;
				}

				.message.ai .message-bubble blockquote {
					border-left: 3px solid var(--vscode-input-border);
					margin: 8px 0;
					padding-left: 12px;
					color: var(--vscode-descriptionForeground);
				}

				.message.ai .message-bubble strong {
					font-weight: bold;
				}

				.message.ai .message-bubble em {
					font-style: italic;
				}

				.message.ai .message-bubble a {
					color: var(--vscode-textLink-foreground);
					text-decoration: none;
				}

				.message.ai .message-bubble a:hover {
					text-decoration: underline;
				}

				.message.ai .message-bubble table {
					border-collapse: collapse;
					width: 100%;
					margin: 8px 0;
				}

				.message.ai .message-bubble th,
				.message.ai .message-bubble td {
					border: 1px solid var(--vscode-input-border);
					padding: 4px 8px;
					text-align: left;
				}

				.message.ai .message-bubble th {
					background-color: var(--vscode-editor-background);
					font-weight: bold;
				}

				.message-time {
					font-size: 10px;
					color: var(--vscode-descriptionForeground);
					margin-top: 4px;
					opacity: 0.7;
				}

				.message.user .message-time {
					text-align: right;
				}

				.message.ai .message-time {
					text-align: left;
				}

				.input-container {
					display: flex;
					flex-direction: column;
					gap: 8px;
				}

				.message-input {
					width: 100%;
					padding: 8px;
					border: 1px solid var(--vscode-input-border);
					background-color: var(--vscode-input-background);
					color: var(--vscode-input-foreground);
					border-radius: 4px;
					box-sizing: border-box;
					resize: vertical;
					min-height: 60px;
					font-family: var(--vscode-font-family);
				}

				.send-button {
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
					align-self: flex-end;
				}

				.send-button:hover {
					background-color: var(--vscode-button-hoverBackground);
				}

				.send-button:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}

				.cancel-button {
					background-color: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
					border: 1px solid var(--vscode-button-secondaryBorder);
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
					align-self: flex-end;
					display: none;
				}

				.cancel-button:hover {
					background-color: var(--vscode-button-secondaryHoverBackground);
				}

				.loading {
					opacity: 0.6;
				}

				.typing-indicator {
					display: none;
					align-items: center;
					gap: 4px;
					padding: 8px 12px;
					background-color: var(--vscode-editor-background);
					border: 1px solid var(--vscode-input-border);
					border-radius: 12px;
					border-bottom-left-radius: 4px;
					max-width: 80%;
					margin-bottom: 15px;
				}

				.typing-dots {
					display: flex;
					gap: 2px;
				}

				.typing-dot {
					width: 6px;
					height: 6px;
					background-color: var(--vscode-foreground);
					border-radius: 50%;
					animation: typing 1.4s infinite ease-in-out;
				}

				.typing-dot:nth-child(1) { animation-delay: -0.32s; }
				.typing-dot:nth-child(2) { animation-delay: -0.16s; }

				@keyframes typing {
					0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
					40% { transform: scale(1); opacity: 1; }
				}
			</style>
		</head>
		<body>
			<div class="chat-container">
				<div id="codeChip" class="code-chip"></div>

				<div class="code-controls" style="display: flex; gap: 8px; margin-bottom: 10px;">
					<button id="addCodeButton" class="send-button" style="font-size: 11px; padding: 4px 8px;" onclick="addCodeSelection()">
						Add Selection (Ctrl+Shift+A)
					</button>
					<button id="clearCodeButton" class="send-button" style="font-size: 11px; padding: 4px 8px; display: none;" onclick="clearCodeSelections()">
						Clear All (Ctrl+Shift+C)
					</button>
				</div>

				<div id="messagesContainer" class="messages-container">
					<div class="message ai">
						<div class="message-bubble">
							Hello! I'm your AI coding assistant. Select some code in your editor and press <strong>Ctrl+Shift+A</strong> to add it to your question. You can add multiple selections!
						</div>
						<div class="message-time">Just now</div>
					</div>
				</div>

				<div id="typingIndicator" class="typing-indicator">
					<div class="typing-dots">
						<div class="typing-dot"></div>
						<div class="typing-dot"></div>
						<div class="typing-dot"></div>
					</div>
				</div>

				<div class="input-container">
					<textarea
						id="messageInput"
						class="message-input"
						placeholder="Type your message here... (Use Ctrl+Shift+A to add code selections)"
					></textarea>
					<div class="controls" style="display: flex; gap: 8px; margin-top: 8px;">
						<button id="sendButton" class="send-button">Send Message</button>
						<button id="cancelButton" class="cancel-button">Cancel</button>
					</div>
				</div>
			</div>

			<script>
				const vscode = acquireVsCodeApi();

				// Add marked library for markdown conversion
				const marked = window.marked || ((text) => text.replace(/\\n/g, '<br>'));

				// Variables to track streaming state
				let selectedCode = "";
				let fileName = "";
				let lineStart = 0;
				let lineEnd = 0;
				let codeSelections = []; // Array to store multiple code selections
				let accumulatedText = ""; // Track accumulated text for markdown conversion

				// Function to add message to chat
				function addMessage(content, isUser = false) {
					const messagesContainer = document.getElementById('messagesContainer');
					const messageDiv = document.createElement('div');
					messageDiv.className = \`message \${isUser ? 'user' : 'ai'}\`;

					const bubbleDiv = document.createElement('div');
					bubbleDiv.className = 'message-bubble';

					if (isUser) {
						bubbleDiv.textContent = content;
					} else {
						// For AI messages, content might be HTML
						bubbleDiv.innerHTML = content;
					}

					const timeDiv = document.createElement('div');
					timeDiv.className = 'message-time';
					timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

					messageDiv.appendChild(bubbleDiv);
					messageDiv.appendChild(timeDiv);

					// Use insertAdjacentElement to ensure proper ordering
					messagesContainer.insertAdjacentElement('beforeend', messageDiv);

					// Scroll to bottom
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}

				// Function to update code selections display
				function updateCodeSelectionsDisplay() {
					const codeChip = document.getElementById('codeChip');
					const clearButton = document.getElementById('clearCodeButton');

					if (codeSelections.length > 0) {
						const totalLines = codeSelections.reduce((sum, sel) => sum + (sel.lineEnd - sel.lineStart + 1), 0);
						codeChip.textContent = \`\${codeSelections.length} selection(s) - \${totalLines} total lines\`;
						codeChip.style.display = 'block';
						clearButton.style.display = 'inline-block';
					} else {
						codeChip.style.display = 'none';
						clearButton.style.display = 'none';
					}
				}

				// Function to add code selection
				function addCodeSelection() {
					vscode.postMessage({ type: 'addCodeSelection' });
				}

				// Function to clear all code selections
				function clearCodeSelections() {
					codeSelections = [];
					updateCodeSelectionsDisplay();
					vscode.postMessage({ type: 'clearCodeSelections' });
				}

				function showTypingIndicator() {
					document.getElementById('typingIndicator').style.display = 'flex';
					document.getElementById('messagesContainer').scrollTop = document.getElementById('messagesContainer').scrollHeight;
				}

				function hideTypingIndicator() {
					document.getElementById('typingIndicator').style.display = 'none';
				}

				// Listen for messages from extension
				window.addEventListener('message', event => {
					const message = event.data;
					switch (message.type) {
						case 'selectedCode':
							selectedCode = message.selectedCode;
							fileName = message.fileName;
							lineStart = message.lineStart;
							lineEnd = message.lineEnd;

							const codeChip = document.getElementById('codeChip');
							if (selectedCode && fileName) {
								codeChip.textContent = \`\${fileName} (line \${lineStart}: line \${lineEnd})\`;
								codeChip.style.display = 'block';
							} else {
								codeChip.style.display = 'none';
							}
							break;

						case 'codeSelectionAdded':
							// Add new code selection to the array
							codeSelections.push(message.selection);
							updateCodeSelectionsDisplay();
							break;

						case 'codeSelectionsCleared':
							// Clear all code selections
							codeSelections = [];
							updateCodeSelectionsDisplay();
							break;

						case 'startStreaming':
							hideTypingIndicator();
							// Reset accumulated text for new streaming
							accumulatedText = "";
							// Add a small delay to ensure user message is fully rendered
							setTimeout(() => {
								// Create a new AI message bubble for streaming
								const messagesContainer = document.getElementById('messagesContainer');
								const messageDiv = document.createElement('div');
								messageDiv.className = 'message ai';
								messageDiv.id = 'currentStreamingMessage';

								const bubbleDiv = document.createElement('div');
								bubbleDiv.className = 'message-bubble';
								bubbleDiv.id = 'currentStreamingBubble';

								const timeDiv = document.createElement('div');
								timeDiv.className = 'message-time';
								timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

								messageDiv.appendChild(bubbleDiv);
								messageDiv.appendChild(timeDiv);

								// Use insertAdjacentElement to ensure proper ordering
								messagesContainer.insertAdjacentElement('beforeend', messageDiv);

								// Scroll to bottom
								messagesContainer.scrollTop = messagesContainer.scrollHeight;
							}, 10);
							break;

						case 'streamChunk':
							// Append chunk to the current streaming message
							const streamingBubble = document.getElementById('currentStreamingBubble');
							if (streamingBubble) {
								if (message.isHtml) {
									// Replace the entire content with the new HTML (fallback)
									streamingBubble.innerHTML = message.chunk;
								} else {
									// Accumulate text and convert markdown to HTML for smooth streaming
									accumulatedText += message.chunk;
									const htmlContent = marked.parse ? marked.parse(accumulatedText) : marked(accumulatedText);
									streamingBubble.innerHTML = htmlContent;
								}
								// Scroll to bottom to follow the text
								document.getElementById('messagesContainer').scrollTop = document.getElementById('messagesContainer').scrollHeight;
							}
							// Add apply buttons to code blocks if HTML content
							if (!message.isHtml) setTimeout(addApplyButtonsToCodeBlocks, 0);
							break;

						case 'streamComplete':
							hideTypingIndicator();
							// Remove the streaming message IDs so new streaming messages can be created
							const completedStreamingMessage = document.getElementById('currentStreamingMessage');
							if (completedStreamingMessage) {
								completedStreamingMessage.removeAttribute('id');
								const completedBubble = completedStreamingMessage.querySelector('#currentStreamingBubble');
								if (completedBubble) {
									completedBubble.removeAttribute('id');
								}
							}
							document.getElementById('sendButton').disabled = false;
							document.getElementById('sendButton').textContent = 'Send Message';
							document.getElementById('cancelButton').style.display = 'none';
							break;
						case "streamCancelled":
							// Handle cancellation notification from webview
							hideTypingIndicator();

							// Remove any existing streaming message
							const cancelledStreamingMessage = document.getElementById('currentStreamingMessage');
							if (cancelledStreamingMessage) {
								cancelledStreamingMessage.remove();
							}

							addMessage(\`<strong>Cancelled:</strong> The AI request was cancelled. Please try again.\`, false);
							document.getElementById('sendButton').disabled = false;
							document.getElementById('sendButton').textContent = 'Send Message';
							document.getElementById('cancelButton').style.display = 'none';
							break;
						case 'error':
							hideTypingIndicator();

							// Remove any existing streaming message
							const errorStreamingMessage = document.getElementById('currentStreamingMessage');
							if (errorStreamingMessage) {
								errorStreamingMessage.remove();
							}

							addMessage(\`<strong>Error:</strong> \${message.content}\`, false);
							document.getElementById('sendButton').disabled = false;
							document.getElementById('sendButton').textContent = 'Send Message';
							break;
					}
				});

				// Handle send button click
				document.getElementById('sendButton').addEventListener('click', sendMessage);

				// Handle cancel button click
				document.getElementById('cancelButton').addEventListener('click', cancelMessage);

				// Handle enter key press
				document.getElementById('messageInput').addEventListener('keypress', function(e) {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						sendMessage();
					}
				});

				// Handle keyboard shortcuts
				document.addEventListener('keydown', function(e) {
					// Ctrl+Shift+A to add code selection
					if (e.ctrlKey && e.shiftKey && e.key === 'A') {
						e.preventDefault();
						addCodeSelection();
					}
					// Ctrl+Shift+C to clear code selections
					if (e.ctrlKey && e.shiftKey && e.key === 'C') {
						e.preventDefault();
						clearCodeSelections();
					}
				});

				function sendMessage() {
					const messageInput = document.getElementById('messageInput');
					const message = messageInput.value.trim();

					if (!message) return;

					// Add user message to chat
					addMessage(message, true);

					// Clear input
					messageInput.value = '';

					// Disable send button and show typing indicator
					const sendButton = document.getElementById('sendButton');
					const cancelButton = document.getElementById('cancelButton');
					sendButton.disabled = true;
					sendButton.textContent = 'Sending...';
					cancelButton.style.display = 'block';
					showTypingIndicator();

					// Send message to extension with code selections
					vscode.postMessage({
						type: 'sendMessage',
						message: message,
						codeSelections: codeSelections
					});
				}

				function cancelMessage() {
					// Send cancellation message to extension
					vscode.postMessage({
						type: 'cancelStreaming'
					});

					// Reset UI
					const sendButton = document.getElementById('sendButton');
					const cancelButton = document.getElementById('cancelButton');
					sendButton.disabled = false;
					sendButton.textContent = 'Send Message';
					cancelButton.style.display = 'none';
					hideTypingIndicator();
				}

				// Function to add apply buttons to code blocks in AI responses
				function addApplyButtonsToCodeBlocks() {
					const codeBlocks = document.querySelectorAll('pre code');
					codeBlocks.forEach((codeBlock, index) => {
						// Check if buttons already exist
						if (codeBlock.parentElement.querySelector('.apply-code-btn') || codeBlock.parentElement.querySelector('.copy-code-btn')) {
							return;
						}

						// Create button container
						const buttonContainer = document.createElement('div');
						buttonContainer.className = 'code-block-buttons';
						buttonContainer.style.cssText = 'display: flex; gap: 4px; margin-top: 8px;';

						// Create Apply Code button
						const applyButton = document.createElement('button');
						applyButton.className = 'apply-code-btn';
						applyButton.textContent = 'Apply Code';
						applyButton.style.cssText = 'background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;';
						applyButton.onclick = function() {
							const code = codeBlock.textContent;
							vscode.postMessage({
								type: 'applyCode',
								code: code
							});
						};

						// Create Copy Code button
						const copyButton = document.createElement('button');
						copyButton.className = 'copy-code-btn';
						copyButton.textContent = 'Copy';
						copyButton.style.cssText = 'background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-secondaryBorder); padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;';
						copyButton.onclick = function() {
							const code = codeBlock.textContent;
							navigator.clipboard.writeText(code).then(() => {
								// Show brief feedback
								const originalText = copyButton.textContent;
								copyButton.textContent = 'Copied!';
								copyButton.style.backgroundColor = 'var(--vscode-notificationsSuccessIcon-foreground)';
								copyButton.style.color = 'var(--vscode-notificationsSuccessBackground)';
								setTimeout(() => {
									copyButton.textContent = originalText;
									copyButton.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
									copyButton.style.color = 'var(--vscode-button-secondaryForeground)';
								}, 1000);
							}).catch(err => {
								console.error('Failed to copy code:', err);
								// Fallback: show error message
								const originalText = copyButton.textContent;
								copyButton.textContent = 'Error';
								copyButton.style.backgroundColor = 'var(--vscode-errorForeground)';
								copyButton.style.color = 'var(--vscode-errorBackground)';
								setTimeout(() => {
									copyButton.textContent = originalText;
									copyButton.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
									copyButton.style.color = 'var(--vscode-button-secondaryForeground)';
								}, 1000);
							});
						};

						// Add buttons to container
						buttonContainer.appendChild(applyButton);
						buttonContainer.appendChild(copyButton);

						// Insert button container after the code block
						codeBlock.parentElement.appendChild(buttonContainer);
					});
				}
			</script>
		</body>
		</html>`;
  }
}

// Function to call LLM
async function callLLM(
  apiToken: string,
  prompt: string,
  endpoint: string,
  model: string
): Promise<string> {
  try {
    const requestBody = {
      model: model,
      prompt: prompt,
      stream: false,
    };

    // Debug: Log the request details
    logDebug("=== AI Reviewer LLM Request Debug ===", {
      endpoint,
      model,
      prompt: prompt.substring(0, 200) + (prompt.length > 200 ? "..." : ""), // Truncate long prompts
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data = (await response.json()) as { response?: string };
      const llmResponse = data.response ?? "No response received from LLM";
      logDebug(
        "LLM Response",
        llmResponse.substring(0, 500) + (llmResponse.length > 500 ? "..." : "")
      );
      return llmResponse;
    }
    const errorText = await response.text();
    throw new Error(
      `LLM API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
    );
  } catch (error) {
    throw new Error(
      `Failed to call LLM API: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Function to call LLM with streaming
async function callLLMStream(
  apiToken: string,
  prompt: string,
  endpoint: string,
  model: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  try {
    const requestBody = {
      model: model,
      prompt: prompt,
      stream: true,
    };

    // Debug: Log the request details
    logDebug("=== AI Reviewer LLM Streaming Request Debug ===", {
      endpoint,
      model,
      prompt,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LLM API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "") continue;

        try {
          // Remove "data: " prefix if present
          const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;
          if (jsonStr === "[DONE]") continue;

          const data = JSON.parse(jsonStr);
          if (data.response) {
            onChunk(data.response);
          }
        } catch (e) {
          logDebug("Error parsing streaming response", { line, error: e });
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to call LLM API with streaming: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Function to call LLM with streaming and cancellation support
async function callLLMStreamWithCancellation(
  apiToken: string,
  prompt: string,
  endpoint: string,
  model: string,
  cancellationToken: vscode.CancellationToken,
  onChunk: (chunk: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create AbortController for fetch cancellation
    const abortController = new AbortController();

    // Listen for cancellation
    const cancellationListener = cancellationToken.onCancellationRequested(() => {
      abortController.abort();
      reject(new Error('Request cancelled by user'));
    });

    const requestBody = {
      model: model,
      prompt: prompt,
      stream: true,
    };

    // Debug: Log the request details
    logDebug("=== AI Reviewer LLM Streaming Request Debug ===", {
      endpoint,
      model,
      prompt,
    });

    // Make the API request
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `LLM API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
          );
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Response body is not readable");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        const processStream = async () => {
          while (true) {
            // Check for cancellation before each read
            if (cancellationToken.isCancellationRequested) {
              reader.cancel();
              throw new Error('Request cancelled by user');
            }

            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.trim() === "") continue;

              try {
                // Remove "data: " prefix if present
                const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;
                if (jsonStr === "[DONE]") continue;

                const data = JSON.parse(jsonStr) as any;
                if (data.response) {
                  onChunk(data.response);
                }
              } catch (e) {
                logDebug("Error parsing streaming response", { line, error: e });
              }
            }
          }
        };

        await processStream();
        resolve();
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          reject(new Error('Request cancelled by user'));
        } else {
          reject(new Error(
            `Failed to call LLM API with streaming: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          ));
        }
      })
      .finally(() => {
        // Clean up cancellation listener
        cancellationListener.dispose();
      });
  });
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "ai-reviewer" is now active!');

  // Register the settings panel provider
  const settingsPanelProvider = new SettingsPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SettingsPanelProvider.viewType,
      settingsPanelProvider
    )
  );

  // Register the chat panel provider
  const chatPanelProvider = new ChatPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatPanelProvider.viewType,
      chatPanelProvider
    )
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "ai-reviewer.reviewFile",
    async () => {
      // Get the active text editor
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found!");
        return;
      }

      // Get the document and its text
      const document = editor.document;
      const text = document.getText();

      if (!text.trim()) {
        vscode.window.showErrorMessage("The current file is empty!");
        return;
      }

      // Get configuration settings
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const apiToken = config.get<string>("apiToken", "");
      const codingConvention = config.get<string>("codingConvention", "");

      const endpoint = config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      );
      const model = config.get<string>("llmModel", "llama3");

      if (!apiToken) {
        vscode.window.showErrorMessage(
          "API token not configured. Please set it in the AI Reviewer settings."
        );
        return;
      }

      // Show progress notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `AI Reviewer: Analyzing code with model ${model}... `,
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ increment: 0 });

            // Prepare the prompt for LLM
            const prompt = `Please review the following code based on these coding conventions:
                            ${
                              codingConvention ||
                              "Standard coding best practices"
                            }

                            Code to review:
                            \`\`\`${document.languageId}
                            ${text}
                            \`\`\`

                            Please provide a detailed review including:
                            1. Code quality assessment
                            2. Potential improvements
                            3. Security concerns (if any)
                            4. Performance considerations
                            5. Adherence to the specified coding conventions

                            Format your response in a clear, structured manner.`;

            // Debug: Log the prompt to console
            logDebug("=== AI Reviewer Code Review - Prompt Debug ===", {
              file: document.fileName,
              language: document.languageId,
              codingConvention:
                codingConvention || "Standard coding best practices",
              promptLength: prompt.length,
            });

            const response: string = await callLLM(
              apiToken,
              prompt,
              endpoint,
              model
            );

            progress.report({ increment: 100 });

            // Convert markdown response to HTML for better display
            const htmlResponse: string = await marked(response);

            // Show the review in a new document
            await showReviewResults(htmlResponse, document.fileName);
          } catch (error) {
            vscode.window.showErrorMessage(
              `Review failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }
      );
    }
  );

  // Add new command for AI review and suggestion
  const reviewAndSuggestDisposable = vscode.commands.registerCommand(
    "ai-reviewer.reviewAndSuggest",
    async () => {
      // Get the active text editor
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found!");
        return;
      }

      // Get the document and its text
      const document = editor.document;
      const text = document.getText();

      if (!text.trim()) {
        vscode.window.showErrorMessage("The current file is empty!");
        return;
      }

      // Get configuration settings
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const apiToken = config.get<string>("apiToken", "");
      const codingConvention = config.get<string>("codingConvention", "");

      const endpoint = config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      );
      const model = config.get<string>("llmModel", "llama3");

      if (!apiToken) {
        vscode.window.showErrorMessage(
          "API token not configured. Please set it in the AI Reviewer settings."
        );
        return;
      }

      // Show progress notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `AI Reviewer: Analyzing code conventions with model ${model}... `,
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ increment: 0 });

            // Prepare the prompt for LLM to check conventions and suggest fixes
            const codeWithLineNumbers = text
              .split("\n")
              .map((line, index) => `${index + 1}: ${line}`)
              .join("\n");

            const prompt = `Please analyze the following code for convention violations and provide specific suggestions with line numbers and corrected code.

Coding conventions to check:
${
  codingConvention ||
  "Standard coding best practices including naming conventions, formatting, and code structure"
}

Code to analyze (with line numbers):
${codeWithLineNumbers}

IMPORTANT: For the "suggestion" field, provide ONLY the corrected code line that should replace the current line. Do NOT include descriptive text like "Replace X with Y" or "Change this to that".

Please provide your response in the following JSON format:
{
  "violations": [
    {
      "line": <line_number>,
      "message": "<description of the violation>",
      "suggestion": "<ONLY the corrected code line, no descriptive text>",
      "severity": "<low|medium|high>"
    }
  ],
  "summary": "<overall summary of findings>"
}

Examples of correct suggestions:
- If line 5 has "var x = 1;", suggestion should be "const x = 1;" (not "Replace var with const")
- If line 10 has "if(x==y)", suggestion should be "if (x === y) {" (not "Use === instead of ==")
- If line 15 has "function badName()", suggestion should be "function goodName()" (not "Rename function")

Focus on:
1. Naming conventions
2. Code formatting
3. Code structure and organization
4. Best practices for ${document.languageId}
5. Any obvious improvements

If no violations are found, return an empty violations array.`;

            const response: string = await callLLM(
              apiToken,
              prompt,
              endpoint,
              model
            );

            progress.report({ increment: 100 });

            // Parse the response and show suggestions
            await showConventionSuggestions(response, editor, document);
          } catch (error) {
            vscode.window.showErrorMessage(
              `Review failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }
      );
    }
  );

  // Add new command for AI review PR (git diff)
  const reviewPRDisposable = vscode.commands.registerCommand(
    "ai-reviewer.reviewPR",
    async () => {
      // Get configuration settings
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const apiToken = config.get<string>("apiToken", "");
      const codingConvention = config.get<string>("codingConvention", "");

      const endpoint = config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      );
      const model = config.get<string>("llmModel", "llama3");
      const baseBranch = config.get<string>("baseBranch", "main");

      if (!apiToken) {
        vscode.window.showErrorMessage(
          "API token not configured. Please set it in the AI Reviewer settings."
        );
        return;
      }

      // Check if we're in a git repository
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found!");
        return;
      }

      // Show progress notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `AI Reviewer: Analyzing PR changes with model ${model}... `,
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ increment: 0, message: "Getting git diff..." });

            // Get the current branch
            const currentBranch = await getCurrentBranch(
              workspaceFolder.uri.fsPath
            );

            if (!currentBranch) {
              vscode.window.showErrorMessage(
                "Could not determine current branch. Make sure you're in a git repository."
              );
              return;
            }

            // Verify the base branch exists
            if (!(await branchExists(workspaceFolder.uri.fsPath, baseBranch))) {
              vscode.window.showErrorMessage(
                `Base branch '${baseBranch}' does not exist. Please check your configuration.`
              );
              return;
            }

            progress.report({
              increment: 20,
              message: "Getting changed files...",
            });

            // Get the list of changed files
            const changedFiles = await getChangedFiles(
              workspaceFolder.uri.fsPath,
              baseBranch
            );

            if (changedFiles.length === 0) {
              vscode.window.showInformationMessage(
                "No changed files found compared to the base branch."
              );
              return;
            }

            progress.report({
              increment: 30,
              message: `Found ${changedFiles.length} changed files. Starting review...`,
            });

            // Review each changed file
            const allReviews: any[] = [];
            const incrementPerFile = 50 / changedFiles.length;

            for (const file of changedFiles) {
              progress.report({
                increment: incrementPerFile,
                message: `Reviewing ${file.name}...`,
              });

              try {
                const review = await reviewChangedFile(
                  file,
                  workspaceFolder.uri.fsPath,
                  baseBranch,
                  apiToken,
                  endpoint,
                  model,
                  codingConvention
                );
                allReviews.push(review);
              } catch (error) {
                logDebug(`Error reviewing ${file.name}`, error);
                allReviews.push({
                  fileName: file.name,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
            }

            progress.report({
              increment: 100,
              message: "Generating summary...",
            });

            // Show the comprehensive review results
            await showPRReviewResults(allReviews, currentBranch, baseBranch);
          } catch (error) {
            vscode.window.showErrorMessage(
              `PR Review failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }
      );
    }
  );

  // Helper function to get current branch
  async function getCurrentBranch(repoPath: string): Promise<string | null> {
    try {
      const { execSync } = require("child_process");
      const result = execSync("git branch --show-current", {
        cwd: repoPath,
        encoding: "utf8",
      });
      return result.trim();
    } catch (error) {
      logDebug("Error getting current branch", error);
      return null;
    }
  }

  // Helper function to check if a branch exists
  async function branchExists(
    repoPath: string,
    branchName: string
  ): Promise<boolean> {
    try {
      const { execSync } = require("child_process");
      execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
        cwd: repoPath,
      });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  // Helper function to get changed files
  async function getChangedFiles(
    repoPath: string,
    baseBranch: string
  ): Promise<Array<{ name: string; path: string }>> {
    try {
      const { execSync } = require("child_process");
      const result = execSync(`git diff --name-only ${baseBranch}`, {
        cwd: repoPath,
        encoding: "utf8",
      });

      const files = result
        .trim()
        .split("\n")
        .filter((file: string) => file.trim() !== "");
      return files.map((file: string) => ({
        name: file.split("/").pop() || file,
        path: file,
      }));
    } catch (error) {
      logDebug("Error getting changed files", error);
      throw new Error("Failed to get changed files from git");
    }
  }

  // Helper function to review a single changed file
  async function reviewChangedFile(
    file: { name: string; path: string },
    repoPath: string,
    baseBranch: string,
    apiToken: string,
    endpoint: string,
    model: string,
    codingConvention: string
  ): Promise<any> {
    try {
      const { execSync } = require("child_process");

      // Get the diff for this specific file
      const diff = execSync(`git diff ${baseBranch} -- "${file.path}"`, {
        cwd: repoPath,
        encoding: "utf8",
      });

      if (!diff.trim()) {
        return {
          fileName: file.name,
          filePath: file.path,
          status: "no_changes",
          message: "No changes detected in this file",
        };
      }

      // Get the current content of the file
      let currentContent = "";
      try {
        currentContent = execSync(`git show HEAD:"${file.path}"`, {
          cwd: repoPath,
          encoding: "utf8",
        });
      } catch {
        // File might be new, try to read it directly
        const fs = require("fs");
        const fullPath = require("path").join(repoPath, file.path);
        if (fs.existsSync(fullPath)) {
          currentContent = fs.readFileSync(fullPath, "utf8");
        }
      }

      // Prepare the prompt for LLM
      const prompt = `Please review the following code changes for convention violations and provide specific suggestions.

Coding conventions to check:
${
  codingConvention ||
  "Standard coding best practices including naming conventions, formatting, and code structure"
}

File: ${file.name}
Git diff:
\`\`\`diff
${diff}
\`\`\`

Current file content (with line numbers):
${currentContent
  .split("\n")
  .map((line, index) => `${index + 1}: ${line}`)
  .join("\n")}

Please provide your response in the following JSON format:
{
  "violations": [
    {
      "line": <line_number>,
      "message": "<description of the violation>",
      "suggestion": "<ONLY the corrected code line, no descriptive text>",
      "severity": "<low|medium|high>"
    }
  ],
  "summary": "<overall summary of findings for this file>",
  "fileStatus": "<new|modified|deleted>"
}

Focus on:
1. Naming conventions
2. Code formatting
3. Code structure and organization
4. Best practices for the file type
5. Any obvious improvements in the changes

If no violations are found, return an empty violations array.`;

      const response = await callLLM(apiToken, prompt, endpoint, model);

      // Parse the response
      let parsedResponse;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        console.error(parseError);
        return {
          fileName: file.name,
          filePath: file.path,
          status: "parse_error",
          message: "Could not parse AI response",
          rawResponse: response,
        };
      }

      return {
        fileName: file.name,
        filePath: file.path,
        status: "reviewed",
        violations: parsedResponse.violations || [],
        summary: parsedResponse.summary || "No specific violations found.",
        fileStatus: parsedResponse.fileStatus || "modified",
      };
    } catch (error) {
      return {
        fileName: file.name,
        filePath: file.path,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Helper function to show PR review results
  async function showPRReviewResults(
    reviews: any[],
    currentBranch: string,
    baseBranch: string
  ): Promise<void> {
    const successfulReviews = reviews.filter((r) => r.status === "reviewed");
    const errorReviews = reviews.filter((r) => r.status === "error");
    const parseErrorReviews = reviews.filter((r) => r.status === "parse_error");

    let totalViolations = 0;
    successfulReviews.forEach((review) => {
      totalViolations += review.violations.length;
    });

    const content = `# AI Code Review: PR Analysis

## Branch Information
- **Current Branch:** ${currentBranch}
- **Base Branch:** ${baseBranch}
- **Files Reviewed:** ${reviews.length}
- **Total Violations Found:** ${totalViolations}

## Summary
- ✅ Successfully reviewed: ${successfulReviews.length} files
- ❌ Errors: ${errorReviews.length} files
- ⚠️ Parse errors: ${parseErrorReviews.length} files

## Detailed Reviews

${reviews
  .map((review) => {
    if (review.status === "reviewed") {
      return `### ${review.fileName}
**Status:** ${review.fileStatus}
**Violations:** ${review.violations.length}
**Summary:** ${review.summary}

${
  review.violations.length > 0
    ? `
**Violations:**
${review.violations
  .map((v: any) => `- Line ${v.line}: ${v.message} (${v.severity})`)
  .join("\n")}
`
    : "No violations found."
}
`;
    } else if (review.status === "error") {
      return `### ${review.fileName}
**Status:** ❌ Error
**Error:** ${review.error}
`;
    } else if (review.status === "parse_error") {
      return `### ${review.fileName}
**Status:** ⚠️ Parse Error
**Message:** ${review.message}
`;
    } else {
      return `### ${review.fileName}
**Status:** ${review.status}
**Message:** ${review.message}
`;
    }
  })
  .join("\n\n")}

---
*Review generated by AI Reviewer extension*`;

    const document = await vscode.workspace.openTextDocument({
      content,
      language: "markdown",
    });

    await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
  }

  // Function to show review results in a new document
  async function showReviewResults(
    review: string,
    originalFileName: string
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      content: `# AI Code Review: ${originalFileName}

                ${review}

                ---
                *Review generated by AI Reviewer extension*`,
      language: "markdown",
    });

    await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
  }

  // Function to show convention suggestions in a popup
  async function showConventionSuggestions(
    response: string,
    editor: vscode.TextEditor,
    document: vscode.TextDocument
  ): Promise<void> {
    try {
      // Try to parse the JSON response
      let parsedResponse;
      try {
        // Extract JSON from the response (in case LLM adds extra text)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        // If parsing fails, show the raw response
        vscode.window.showInformationMessage(
          "Could not parse AI response. Showing raw response:"
        );
        await showReviewResults(response, document.fileName);
        return;
      }

      const violations = parsedResponse.violations || [];
      const summary = parsedResponse.summary || "No specific violations found.";

      // Clean up suggestions to ensure they contain only corrected code
      const cleanedViolations = violations.map((violation: any) => ({
        ...violation,
        suggestion: cleanSuggestion(
          violation.suggestion,
          violation.line,
          editor.document
        ),
      }));

      if (cleanedViolations.length === 0) {
        vscode.window.showInformationMessage(
          `✅ No convention violations found!\n\n${summary}`
        );
        return;
      }

      // Get the display mode from configuration
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const displayMode = config.get<string>("suggestionDisplayMode", "panel");

      if (displayMode === "inline") {
        await showInlineSuggestions(
          cleanedViolations,
          summary,
          editor,
          document
        );
      } else {
        await showPanelSuggestions(
          cleanedViolations,
          summary,
          editor,
          document
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to show suggestions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Function to clean up suggestions and extract only the corrected code
  function cleanSuggestion(
    suggestion: string,
    lineNumber: number,
    document: vscode.TextDocument
  ): string {
    try {
      // Get the original line content
      const originalLine = document.lineAt(lineNumber - 1).text;

      // If suggestion looks like descriptive text, try to extract the actual code
      if (
        suggestion.includes("Replace") ||
        suggestion.includes("Change") ||
        suggestion.includes("Use")
      ) {
        // Look for code patterns in the suggestion
        const codePatterns = [
          /`([^`]+)`/g, // Code in backticks
          /"([^"]+)"/g, // Code in quotes
          /'([^']+)'/g, // Code in single quotes
          /(\w+)/g, // Any word (fallback)
        ];

        for (const pattern of codePatterns) {
          const matches = suggestion.match(pattern);
          if (matches && matches.length > 0) {
            // Try to find the most likely corrected code
            const potentialCode = matches[matches.length - 1]; // Usually the last match is the corrected code
            if (potentialCode && potentialCode.length > 2) {
              // Avoid very short matches
              return potentialCode;
            }
          }
        }
      }

      // If no patterns found, return the original suggestion
      return suggestion;
    } catch (error) {
      // If any error occurs, return the original suggestion
      return suggestion;
    }
  }

  // Function to generate HTML for suggestions panel
  function generateSuggestionsHTML(
    violations: any[],
    summary: string,
    fileName: string
  ): string {
    const violationsHtml = violations
      .map(
        (violation, index) => `
        <div class="violation" data-line="${violation.line}" data-suggestion="${
          violation.suggestion
        }">
          <div class="violation-header">
            <span class="line-number">Line ${violation.line}</span>
            <span class="severity severity-${violation.severity}">${
          violation.severity
        }</span>
          </div>
          <div class="violation-message">${violation.message}</div>
          <div class="suggestion">
            <strong>Suggestion:</strong>
            <pre><code>${violation.suggestion}</code></pre>
          </div>
          <button class="apply-btn" onclick="applySuggestion(${
            violation.line
          }, '${violation.suggestion.replace(/'/g, "\\'")}')">
            Apply This Suggestion
          </button>
        </div>
      `
      )
      .join("");

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Code Review Suggestions</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                margin: 0;
            }
            .header {
                border-bottom: 1px solid var(--vscode-input-border);
                padding-bottom: 15px;
                margin-bottom: 20px;
            }
            .file-name {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .summary {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                margin-bottom: 20px;
            }
            .violation {
                border: 1px solid var(--vscode-input-border);
                border-radius: 6px;
                margin-bottom: 15px;
                padding: 15px;
                background-color: var(--vscode-input-background);
            }
            .violation-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .line-number {
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
            }
            .severity {
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .severity-high {
                background-color: var(--vscode-errorForeground);
                color: var(--vscode-errorBackground);
            }
            .severity-medium {
                background-color: var(--vscode-warningForeground);
                color: var(--vscode-warningBackground);
            }
            .severity-low {
                background-color: var(--vscode-infoBar-background);
                color: var(--vscode-infoBar-foreground);
            }
            .violation-message {
                margin-bottom: 10px;
                color: var(--vscode-foreground);
            }
            .suggestion {
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 10px;
                margin-bottom: 10px;
            }
            .suggestion pre {
                margin: 0;
                white-space: pre-wrap;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }
            .apply-btn {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            .apply-btn:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .apply-all-btn {
                background-color: var(--vscode-button-prominentBackground);
                color: var(--vscode-button-prominentForeground);
                border: none;
                padding: 12px 24px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                margin-top: 20px;
                width: 100%;
            }
            .apply-all-btn:hover {
                background-color: var(--vscode-button-prominentHoverBackground);
            }
            .no-violations {
                text-align: center;
                padding: 40px;
                color: var(--vscode-descriptionForeground);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="file-name">${fileName}</div>
            <div class="summary">${summary}</div>
        </div>

        ${
          violations.length > 0
            ? `
            <div class="violations">
                ${violationsHtml}
            </div>
            <button class="apply-all-btn" onclick="applyAllSuggestions()">
                Apply All Suggestions
            </button>
        `
            : `
            <div class="no-violations">
                <h3>✅ No convention violations found!</h3>
                <p>Your code follows the specified conventions well.</p>
            </div>
        `
        }

        <script>
            const vscode = acquireVsCodeApi();

            function applySuggestion(line, suggestion) {
                vscode.postMessage({
                    type: 'applySuggestion',
                    line: parseInt(line),
                    suggestion: suggestion
                });
            }

            function applyAllSuggestions() {
                vscode.postMessage({
                    type: 'applyAllSuggestions'
                });
            }
        </script>
    </body>
    </html>`;
  }

  // Function to apply a single suggestion
  async function applySuggestion(
    editor: vscode.TextEditor,
    lineNumber: number,
    suggestion: string
  ): Promise<void> {
    try {
      const line = editor.document.lineAt(lineNumber - 1); // Convert to 0-based index
      const range = new vscode.Range(line.range.start, line.range.end);

      await editor.edit((editBuilder) => {
        editBuilder.replace(range, suggestion);
      });

      vscode.window.showInformationMessage(
        `Applied suggestion for line ${lineNumber}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to apply suggestion: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Function to apply all suggestions
  async function applyAllSuggestions(
    editor: vscode.TextEditor,
    violations: any[]
  ): Promise<void> {
    try {
      // Sort violations by line number in descending order to avoid line number shifts
      const sortedViolations = [...violations].sort((a, b) => b.line - a.line);

      await editor.edit((editBuilder) => {
        for (const violation of sortedViolations) {
          const line = editor.document.lineAt(violation.line - 1);
          const range = new vscode.Range(line.range.start, line.range.end);
          editBuilder.replace(range, violation.suggestion);
        }
      });

      vscode.window.showInformationMessage(
        `Applied ${violations.length} suggestions successfully!`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to apply suggestions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Function to show suggestions in a separate panel (original behavior)
  async function showPanelSuggestions(
    violations: any[],
    summary: string,
    editor: vscode.TextEditor,
    document: vscode.TextDocument
  ): Promise<void> {
    // Create a webview panel to show suggestions
    const panel = vscode.window.createWebviewPanel(
      "aiReviewSuggestions",
      "AI Code Review Suggestions",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // Generate HTML content for the suggestions
    const htmlContent = generateSuggestionsHTML(
      violations,
      summary,
      document.fileName
    );
    panel.webview.html = htmlContent;

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "applySuggestion":
          await applySuggestion(editor, message.line, message.suggestion);
          break;
        case "applyAllSuggestions":
          await applyAllSuggestions(editor, violations);
          break;
        case "dismiss":
          panel.dispose();
          break;
      }
    });
  }

  // Function to show suggestions inline using VS Code diagnostics
  async function showInlineSuggestions(
    violations: any[],
    summary: string,
    editor: vscode.TextEditor,
    document: vscode.TextDocument
  ): Promise<void> {
    // Create a diagnostic collection for this document
    const diagnosticCollection = vscode.languages.createDiagnosticCollection(
      `ai-reviewer-${document.uri.toString()}`
    );

    // Convert violations to diagnostics
    const diagnostics: vscode.Diagnostic[] = violations.map((violation) => {
      const line = document.lineAt(violation.line - 1);
      const range = new vscode.Range(line.range.start, line.range.end);

      // Determine severity
      let severity: vscode.DiagnosticSeverity;
      switch (violation.severity?.toLowerCase()) {
        case "high":
          severity = vscode.DiagnosticSeverity.Error;
          break;
        case "medium":
          severity = vscode.DiagnosticSeverity.Warning;
          break;
        case "low":
        default:
          severity = vscode.DiagnosticSeverity.Information;
          break;
      }

      // Create diagnostic message with suggestion
      const message = `${violation.message}\n\nSuggestion: ${violation.suggestion}`;

      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostic.source = "AI Reviewer";

      return diagnostic;
    });

    // Set diagnostics for the document
    diagnosticCollection.set(document.uri, diagnostics);

    // Show summary in information message
    vscode.window
      .showInformationMessage(
        `AI Review Complete: ${violations.length} suggestions found. ${summary}`,
        "Apply All Suggestions"
      )
      .then((selection) => {
        if (selection === "Apply All Suggestions") {
          applyAllSuggestions(editor, violations);
          diagnosticCollection.dispose(); // Clear diagnostics after applying
        }
      });

    // Clean up diagnostics when document is closed or changed
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      vscode.workspace.onDidCloseTextDocument((closedDoc) => {
        if (closedDoc.uri.toString() === document.uri.toString()) {
          diagnosticCollection.dispose();
          disposables.forEach((d) => d.dispose());
        }
      })
    );

    disposables.push(
      vscode.workspace.onDidChangeTextDocument((changeEvent) => {
        if (changeEvent.document.uri.toString() === document.uri.toString()) {
          // Clear diagnostics when document is modified
          diagnosticCollection.clear();
          disposables.forEach((d) => d.dispose());
        }
      })
    );
  }

  // Add command to show current settings
  const showSettingsDisposable = vscode.commands.registerCommand(
    "ai-reviewer.showSettings",
    () => {
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const apiToken = config.get<string>("apiToken", "");
      const codingConvention = config.get<string>("codingConvention", "");
      const llmEndpoint = config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      );
      const llmModel = config.get<string>("llmModel", "llama3");
      const suggestionDisplayMode = config.get<string>(
        "suggestionDisplayMode",
        "panel"
      );
      const baseBranch = config.get<string>("baseBranch", "main");

      const message = `Current Settings:\nAPI Token: ${
        apiToken ? "***" + apiToken.slice(-4) : "Not set"
      }\nCoding Convention: ${
        codingConvention || "Not set"
      }\nLLM Endpoint: ${llmEndpoint}\nLLM Model: ${llmModel}\nSuggestion Display Mode: ${suggestionDisplayMode}\nBase Branch: ${baseBranch}`;

      vscode.window.showInformationMessage(message);
    }
  );

  // Add command to open settings panel
  const openSettingsPanelDisposable = vscode.commands.registerCommand(
    "ai-reviewer.openSettingsPanel",
    () => {
      vscode.commands.executeCommand("ai-reviewer-settings.focus");
    }
  );

  // Function to get configuration values
  function getConfiguration() {
    const config = vscode.workspace.getConfiguration("aiReviewer");
    return {
      apiToken: config.get<string>("apiToken", ""),
      codingConvention: config.get<string>("codingConvention", ""),
      llmEndpoint: config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      ),
      llmModel: config.get<string>("llmModel", "llama3"),
      suggestionDisplayMode: config.get<string>(
        "suggestionDisplayMode",
        "panel"
      ),
      baseBranch: config.get<string>("baseBranch", "main"),
      ghostTextEnabled: config.get<boolean>("ghostTextEnabled", true),
    };
  }

  // Ghost Text Provider for AI-powered code suggestions
  class GhostTextProvider implements vscode.InlineCompletionItemProvider {
    private _isEnabled: boolean = true;
    private _debounceTimer: NodeJS.Timeout | undefined;

    public setEnabled(enabled: boolean) {
      this._isEnabled = enabled;
    }

    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.InlineCompletionContext,
      token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
      if (!this._isEnabled) {
        return undefined;
      }

      // Clear previous debounce timer
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
      }

      // Debounce the suggestions to avoid too many API calls
      return new Promise((resolve) => {
        this._debounceTimer = setTimeout(async () => {
          try {
            const suggestions = await this.generateSuggestions(document, position, context);
            resolve(suggestions);
          } catch (error) {
            logDebug("Error generating ghost text suggestions:", error);
            resolve(undefined);
          }
        }, 500); // 500ms debounce
      });
    }

    private async generateSuggestions(
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.InlineCompletionContext
    ): Promise<vscode.InlineCompletionItem[] | undefined> {
      const config = getConfiguration();

      if (!config.apiToken) {
        logDebug("Ghost text: No API token configured");
        return undefined;
      }

      // Get the current line and context
      const currentLine = document.lineAt(position.line);
      const lineText = currentLine.text;
      const cursorPosition = position.character;

      // More permissive condition - show suggestions when typing or at end of line
      if (cursorPosition < lineText.length && lineText.trim() === '') {
        logDebug("Ghost text: Skipping empty line");
        return undefined;
      }

      // Don't show suggestions if we're in the middle of a word (unless it's a function call)
      const currentWord = lineText.substring(0, cursorPosition).split(/\s+/).pop() || '';
      if (currentWord.length > 0 && !currentWord.includes('(') && !currentWord.includes('[') && !currentWord.includes('{')) {
        logDebug("Ghost text: In middle of word, skipping", { currentWord });
        return undefined;
      }

      // Get surrounding context (previous few lines)
      const contextLines = 5;
      const startLine = Math.max(0, position.line - contextLines);
      const contextText = [];

      for (let i = startLine; i < position.line; i++) {
        contextText.push(document.lineAt(i).text);
      }

      const contextString = contextText.join('\n');
      const currentLinePrefix = lineText.substring(0, cursorPosition);

      logDebug("Ghost text: Generating suggestion", {
        language: document.languageId,
        currentLine: currentLinePrefix,
        contextLines: contextText.length,
        cursorPosition: cursorPosition,
        lineLength: lineText.length
      });

      // Create prompt for AI suggestion
      const prompt = this.createSuggestionPrompt(
        document.languageId,
        contextString,
        currentLinePrefix,
        config.codingConvention
      );

      try {
        const suggestion = await callLLM(
          config.apiToken,
          prompt,
          config.llmEndpoint,
          config.llmModel
        );

        logDebug("Ghost text: LLM response received", {
          originalSuggestion: suggestion?.substring(0, 100) + (suggestion && suggestion.length > 100 ? '...' : ''),
          suggestionLength: suggestion?.length || 0
        });

        if (suggestion && suggestion.trim()) {
          // Clean and format the suggestion
          const cleanedSuggestion = this.cleanSuggestion(suggestion, currentLinePrefix);

          logDebug("Ghost text: Cleaned suggestion", {
            cleanedSuggestion: cleanedSuggestion,
            cleanedLength: cleanedSuggestion.length
          });

          if (cleanedSuggestion) {
            // Ensure the suggestion is properly formatted for VS Code
            const finalSuggestion = cleanedSuggestion.replace(/\n/g, ' ').trim();

            if (finalSuggestion.length > 0) {
              const completionItem = new vscode.InlineCompletionItem(
                finalSuggestion,
                new vscode.Range(position, position)
              );

              // Don't add command - let VS Code handle Tab key naturally
              // This prevents double insertion

              logDebug("Ghost text: Returning completion item", {
                suggestion: finalSuggestion,
                position: position.toString(),
                suggestionLength: finalSuggestion.length
              });

              return [completionItem];
            }
          }
        }
      } catch (error) {
        logDebug("Error calling LLM for ghost text:", error);
      }

      return undefined;
    }

    private createSuggestionPrompt(
      languageId: string,
      context: string,
      currentLine: string,
      codingConvention: string
    ): string {
      return `You are an AI code assistant. Complete the current line of code based on the context.

Language: ${languageId}
Coding Convention: ${codingConvention}

Previous context:
${context}

Current line (incomplete):
${currentLine}

Instructions:
1. Complete ONLY the current line - do not add new lines
2. Provide the most likely completion based on the context
3. If it's a function call, suggest the most appropriate parameters
4. If it's a variable assignment, suggest the most likely value
5. Keep it concise and relevant
6. If the line appears complete or no suggestion is needed, respond with "NO_SUGGESTION"

Examples:
- If current line is "send_slack(config["slack_url"], " - suggest: "message)"
- If current line is "const user = " - suggest: "getUser()"
- If current line is "if (condition" - suggest: ") {"

IMPORTANT: Return ONLY the completion part, not the full line. For example, if the current line is "send_slack(config["slack_url"], " and you want to suggest "message)", return just "message)" not the full line.

DO NOT include any explanatory text, comments, or notes in your response. Return only the code completion.

Suggestion:`;
    }

    private cleanSuggestion(suggestion: string, currentLinePrefix: string): string {
      // Remove any markdown formatting or extra text
      let cleaned = suggestion.trim();

      // Remove common prefixes that might be included
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
      }

      // Remove "Suggestion:" prefix if present
      cleaned = cleaned.replace(/^suggestion:\s*/i, '');

      // If the suggestion starts with the current line prefix, remove it
      if (cleaned.toLowerCase().startsWith(currentLinePrefix.toLowerCase())) {
        cleaned = cleaned.substring(currentLinePrefix.length);
      }

      // Remove "NO_SUGGESTION" responses
      if (cleaned.toLowerCase().includes('no_suggestion')) {
        return '';
      }

      // Handle cases where the AI returns the full line with backticks
      if (cleaned.startsWith('`') && cleaned.endsWith('`')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }

      // If the AI returned the full line, extract just the completion part
      if (cleaned.includes(currentLinePrefix)) {
        const prefixIndex = cleaned.indexOf(currentLinePrefix);
        if (prefixIndex >= 0) {
          cleaned = cleaned.substring(prefixIndex + currentLinePrefix.length);
        }
      }

      // Clean up any remaining quotes or formatting
      cleaned = cleaned.replace(/^["']|["']$/g, '');

      // Remove explanatory text in parentheses (like "Note: assuming that...")
      cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/g, '');

      // Remove any trailing comments or explanations
      cleaned = cleaned.replace(/\s*\/\/.*$/g, '');
      cleaned = cleaned.replace(/\s*#.*$/g, '');

      // Remove any trailing text after the main suggestion
      const lines = cleaned.split('\n');
      if (lines.length > 1) {
        cleaned = lines[0]; // Take only the first line
      }

      logDebug("Ghost text: Suggestion cleaning", {
        original: suggestion,
        currentLinePrefix: currentLinePrefix,
        cleaned: cleaned
      });

      return cleaned.trim();
    }
  }

  // Create and register the ghost text provider
  const ghostTextProvider = new GhostTextProvider();
  const config = getConfiguration();
  ghostTextProvider.setEnabled(config.ghostTextEnabled);

  const ghostTextDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' }, // Register for all file types
    ghostTextProvider
  );

  // Add command to accept ghost suggestions
  const acceptGhostSuggestionDisposable = vscode.commands.registerCommand(
    'ai-reviewer.acceptGhostSuggestion',
    (suggestion: string) => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const position = editor.selection.active;
        // Don't insert here - let VS Code handle the Tab key naturally
        logDebug("Ghost text: Accept command triggered", { suggestion });
      }
    }
  );

  // Add command to toggle ghost text
  const toggleGhostTextDisposable = vscode.commands.registerCommand(
    'ai-reviewer.toggleGhostText',
    async () => {
      const currentState = ghostTextProvider['_isEnabled'];
      const newState = !currentState;
      ghostTextProvider.setEnabled(newState);

      // Update the configuration
      const workspaceConfig = vscode.workspace.getConfiguration("aiReviewer");
      await workspaceConfig.update(
        "ghostTextEnabled",
        newState,
        vscode.ConfigurationTarget.Global
      );

      vscode.window.showInformationMessage(
        `AI Ghost Text ${newState ? 'enabled' : 'disabled'}`
      );
    }
  );

  // Add command to test ghost text
  const testGhostTextDisposable = vscode.commands.registerCommand(
    'ai-reviewer.testGhostText',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const position = editor.selection.active;
      const document = editor.document;

      logDebug("Testing ghost text at position", {
        position: position.toString(),
        currentLine: document.lineAt(position.line).text,
        language: document.languageId
      });

      try {
        const suggestions = await ghostTextProvider['generateSuggestions'](
          document,
          position,
          {
            triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
            selectedCompletionInfo: undefined
          }
        );

        if (suggestions && suggestions.length > 0) {
          vscode.window.showInformationMessage(
            `Ghost text suggestion: "${suggestions[0].insertText}"`
          );
        } else {
          vscode.window.showInformationMessage('No ghost text suggestions generated');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Ghost text test failed: ${error}`);
        logDebug("Ghost text test error:", error);
      }
    }
  );

  // Add command to open AI prompt popup and write response to editor
  const aiPromptPopupDisposable = vscode.commands.registerCommand(
    'ai-reviewer.aiPromptPopup',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const config = getConfiguration();
      if (!config.apiToken) {
        vscode.window.showErrorMessage('API token not configured. Please set it in AI Reviewer settings.');
        return;
      }

      // Get selected text for context
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      // Show floating popup at cursor position
      await showFloatingPopup(editor, selectedText, config);
    }
  );

  // Function to show floating popup at cursor position
  async function showFloatingPopup(
    editor: vscode.TextEditor,
    selectedText: string,
    config: any
  ): Promise<void> {
    const document = editor.document;
    const position = editor.selection.active;

    // Show quick pick for prompt type or custom input
    const promptOptions = [
      { label: '$(comment-discussion) Explain this code', value: 'Explain this code' },
      { label: '$(lightbulb) Optimize this code', value: 'Optimize this code' },
      { label: '$(note) Add comments', value: 'Add comments' },
      { label: '$(bug) Fix bugs', value: 'Fix bugs' },
      { label: '$(refresh) Refactor this code', value: 'Refactor this code' },
      { label: '$(testing) Write tests', value: 'Write tests for this code' },
      { label: '$(pencil) Custom prompt...', value: 'custom' }
    ];

    const contextInfo = selectedText ?
      `Selected ${selectedText.split('\n').length} lines of ${document.languageId} code` :
      'No code selected';

    const selectedPrompt = await vscode.window.showQuickPick(promptOptions, {
      placeHolder: `🤖 AI Assistant - ${contextInfo}`,
      title: 'Choose AI action or enter custom prompt'
    });

    if (!selectedPrompt) {
      return; // User cancelled
    }

    let prompt = selectedPrompt.value;

    // If custom prompt selected, show input box
    if (prompt === 'custom') {
      const customPrompt = await vscode.window.showInputBox({
        placeHolder: 'Enter your custom prompt...',
        prompt: 'What would you like to ask the AI?',
        value: '',
        ignoreFocusOut: true
      });

      if (!customPrompt) {
        return; // User cancelled
      }
      prompt = customPrompt;
    }

    // Show progress notification with cancellation support
    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: "🤖 AI is thinking...",
      cancellable: true
    };

    try {
      // Create full prompt with context
      let fullPrompt = prompt;
      if (selectedText) {
        fullPrompt = `Context (selected code):\n\`\`\`${document.languageId}\n${selectedText}\n\`\`\`\n\nUser request: ${prompt}`;
      }

      logDebug("AI Prompt Popup: Sending request", {
        prompt: prompt,
        hasSelectedText: !!selectedText,
        language: document.languageId
      });

      const response = await vscode.window.withProgress(progressOptions, async (progress, cancellationToken) => {
        progress.report({ increment: 0, message: 'Preparing request...' });

        // Check for cancellation before starting
        if (cancellationToken.isCancellationRequested) {
          throw new Error('Request cancelled by user');
        }

        progress.report({ increment: 25, message: 'Sending to AI...' });

        try {
          const aiResponse = await callLLMWithCancellation(
            config.apiToken,
            fullPrompt,
            config.llmEndpoint,
            config.llmModel,
            cancellationToken
          );

          progress.report({ increment: 100, message: 'Response received!' });
          return aiResponse;
        } catch (error) {
          if (cancellationToken.isCancellationRequested) {
            throw new Error('Request cancelled by user');
          }
          throw error;
        }
      });

      if (response && response.trim()) {
        // Show response in a floating popup with actions
        await showResponsePopup(response.trim(), editor);
      } else {
        vscode.window.showWarningMessage('No response received from AI');
      }

    } catch (error) {
      if (error instanceof Error && error.message === 'Request cancelled by user') {
        vscode.window.showInformationMessage('AI request cancelled');
      } else {
        vscode.window.showErrorMessage(`Failed to get AI response: ${error}`);
        logDebug("AI Prompt Popup: Error", error);
      }
    }
  }

  // Function to call LLM with cancellation support
  async function callLLMWithCancellation(
    apiToken: string,
    prompt: string,
    endpoint: string,
    model: string,
    cancellationToken: vscode.CancellationToken
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create AbortController for fetch cancellation
      const abortController = new AbortController();

      // Listen for cancellation
      const cancellationListener = cancellationToken.onCancellationRequested(() => {
        abortController.abort();
        reject(new Error('Request cancelled by user'));
      });

      // Prepare the request body
      const requestBody = {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        },
      };

      // Make the API request
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiToken && { Authorization: `Bearer ${apiToken}` }),
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      })
        .then(async (response) => {
          // Clean up cancellation listener
          cancellationListener.dispose();

          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status} - ${response.statusText}`
            );
          }

          const data = await response.json() as any;

          if (data.error) {
            throw new Error(`API error: ${data.error}`);
          }

          if (!data.response) {
            throw new Error("No response received from LLM");
          }

          resolve(data.response);
        })
        .catch((error) => {
          // Clean up cancellation listener
          cancellationListener.dispose();

          if (error.name === 'AbortError') {
            reject(new Error('Request cancelled by user'));
          } else {
            reject(error);
          }
        });
    });
  }

  // Function to show response in a floating popup
  async function showResponsePopup(response: string, editor: vscode.TextEditor): Promise<void> {
    const actions = [
      { label: '$(insert) Insert code only', value: 'insert' },
      { label: '$(copy) Copy to clipboard', value: 'copy' },
      { label: '$(eye) View full response', value: 'view' },
      { label: '$(close) Close', value: 'close' }
    ];

    const selection = await vscode.window.showQuickPick(actions, {
      placeHolder: 'AI Response Ready - Choose action:',
      title: '🤖 AI Response',
      ignoreFocusOut: true
    });

    if (!selection) {
      return; // User cancelled
    }

    switch (selection.value) {
      case 'insert':
        try {
          const editorSelection = editor.selection;

          // Extract only code blocks from the response
          const codeBlocks = extractCodeBlocks(response);

          if (codeBlocks.length === 0) {
            vscode.window.showWarningMessage('No code blocks found in AI response. Inserting full response instead.');
            // Insert the full response if no code blocks found
            await insertText(editor, editorSelection, response);
          } else if (codeBlocks.length === 1) {
            // Single code block - insert it directly
            await insertText(editor, editorSelection, codeBlocks[0]);
            vscode.window.showInformationMessage('Code block inserted successfully!');
          } else {
            // Multiple code blocks - let user choose
            const codeBlockOptions = codeBlocks.map((block, index) => ({
              label: `$(code) Code Block ${index + 1}`,
              description: `${block.split('\n').length} lines`,
              value: block
            }));

            const selectedBlock = await vscode.window.showQuickPick(codeBlockOptions, {
              placeHolder: 'Multiple code blocks found - choose one to insert:',
              title: '🤖 Select Code Block',
              ignoreFocusOut: true
            });

            if (selectedBlock) {
              await insertText(editor, editorSelection, selectedBlock.value);
              vscode.window.showInformationMessage('Selected code block inserted successfully!');
            }
          }

          logDebug("AI Prompt Popup: Code block inserted", {
            responseLength: response.length,
            codeBlocksFound: codeBlocks.length,
            position: editorSelection.active.toString()
          });
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to insert code: ${error}`);
        }
        break;

      case 'copy':
        try {
          // Extract code blocks for copying too
          const codeBlocks = extractCodeBlocks(response);
          const textToCopy = codeBlocks.length > 0 ? codeBlocks.join('\n\n') : response;
          await vscode.env.clipboard.writeText(textToCopy);
          vscode.window.showInformationMessage(
            codeBlocks.length > 0
              ? `Code blocks copied to clipboard! (${codeBlocks.length} blocks)`
              : 'Response copied to clipboard!'
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to copy response: ${error}`);
        }
        break;

      case 'view':
        // Show full response in a new document
        await showReviewResults(response, editor.document.fileName);
        break;

      case 'close':
        // Do nothing, just close
        break;
    }
  }

  // Function to extract code blocks from AI response
  function extractCodeBlocks(response: string): string[] {
    const codeBlocks: string[] = [];

    // Match code blocks with language specification: ```language\n...\n```
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(response)) !== null) {
      const language = match[1] || '';
      const code = match[2].trim();

      // Only include non-empty code blocks
      if (code.length > 0) {
        codeBlocks.push(code);
      }
    }

    // If no code blocks found, try to find inline code with single backticks
    if (codeBlocks.length === 0) {
      const inlineCodeRegex = /`([^`]+)`/g;
      while ((match = inlineCodeRegex.exec(response)) !== null) {
        const code = match[1].trim();
        if (code.length > 0 && !code.includes(' ') && code.length > 3) {
          // Only include single words/phrases that look like code
          codeBlocks.push(code);
        }
      }
    }

    return codeBlocks;
  }

  // Helper function to insert text at cursor or replace selection
  async function insertText(editor: vscode.TextEditor, selection: vscode.Selection, text: string): Promise<void> {
    await editor.edit(editBuilder => {
      if (selection.isEmpty) {
        // Insert at cursor position
        editBuilder.insert(selection.active, text);
      } else {
        // Replace selected text
        editBuilder.replace(selection, text);
      }
    });
  }

  // Add command to show debug output
  const showDebugOutputDisposable = vscode.commands.registerCommand(
    "ai-reviewer.showDebugOutput",
    () => {
      if (!debugOutputChannel) {
        debugOutputChannel =
          vscode.window.createOutputChannel("AI Reviewer Debug");
      }
      debugOutputChannel.show();
    }
  );

  // Listen for configuration changes
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("aiReviewer")) {
        const newConfig = getConfiguration();
        logDebug("AI Reviewer configuration updated", {
          apiToken: newConfig.apiToken
            ? "***" + newConfig.apiToken.slice(-4)
            : "Not set",
          codingConvention: newConfig.codingConvention || "Not set",
          llmEndpoint: newConfig.llmEndpoint,
          llmModel: newConfig.llmModel,
          suggestionDisplayMode: newConfig.suggestionDisplayMode,
          baseBranch: newConfig.baseBranch,
          ghostTextEnabled: newConfig.ghostTextEnabled,
        });

        // Update ghost text provider if the setting changed
        if (event.affectsConfiguration("aiReviewer.ghostTextEnabled")) {
          ghostTextProvider.setEnabled(newConfig.ghostTextEnabled);
        }
      }
    }
  );

  context.subscriptions.push(
    disposable,
    showSettingsDisposable,
    openSettingsPanelDisposable,
    configChangeDisposable,
    reviewAndSuggestDisposable,
    reviewPRDisposable,
    showDebugOutputDisposable,
    ghostTextDisposable,
    acceptGhostSuggestionDisposable,
    toggleGhostTextDisposable,
    testGhostTextDisposable,
    aiPromptPopupDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
