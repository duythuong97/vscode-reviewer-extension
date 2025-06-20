// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

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
        case "getSettings":
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
          });
          break;
        case "updateSettings":
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
          vscode.window.showInformationMessage(
            "Settings updated successfully!"
          );
          break;
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
			</style>
		</head>
		<body>
			<h3>AI Reviewer Settings</h3>
			<div class="form-group">
				<label for="apiToken">API Token:</label>
				<input type="password" id="apiToken" placeholder="Enter your API token">
			</div>
			<div class="form-group">
				<label for="codingConvention">Coding Convention:</label>
				<textarea id="codingConvention" placeholder="Enter your coding convention rules"></textarea>
			</div>
			<div class="form-group">
				<label for="llmEndpoint">LLM API Endpoint:</label>
				<input type="text" id="llmEndpoint" placeholder="http://localhost:11434/api/generate">
			</div>
			<div class="form-group">
				<label for="llmModel">LLM Model:</label>
				<input type="text" id="llmModel" placeholder="llama3">
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
							break;
					}
				});

				// Handle save button click
				document.getElementById('saveBtn').addEventListener('click', () => {
					const apiToken = document.getElementById('apiToken').value;
					const codingConvention = document.getElementById('codingConvention').value;
					const llmEndpoint = document.getElementById('llmEndpoint').value;
					const llmModel = document.getElementById('llmModel').value;

					vscode.postMessage({
						type: 'updateSettings',
						apiToken: apiToken,
						codingConvention: codingConvention,
						llmEndpoint: llmEndpoint,
						llmModel: llmModel
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

            // Get selected text from editor
            const editor = vscode.window.activeTextEditor;
            let selectedCode = "";
            let fileName = "";
            let lineStart = 0;
            let lineEnd = 0;

            if (editor && !editor.selection.isEmpty) {
              selectedCode = editor.document.getText(editor.selection);
              fileName = editor.document.fileName.split(/[\\/]/).pop() || "";
              lineStart = editor.selection.start.line + 1;
              lineEnd = editor.selection.end.line + 1;
            }

            // Prepare prompt with selected code and user message
            let prompt = data.message;
            if (selectedCode) {
              prompt = `File: ${fileName} (lines ${lineStart}-${lineEnd})\n\nSelected Code:\n\`\`\`\n${selectedCode}\n\`\`\`\n\nUser Question: ${data.message}`;
            }

            // Debug: Log the prompt to console
            console.log("=== AI Reviewer Chat - Prompt Debug ===");
            console.log(
              "Selected Code:",
              selectedCode
                ? `Yes (${fileName} lines ${lineStart}-${lineEnd})`
                : "No"
            );
            console.log("User Message:", data.message);
            console.log("Full Prompt:");
            console.log(prompt);
            console.log("=== End Prompt Debug ===");

            // Send initial response message to create the AI message bubble
            webviewView.webview.postMessage({
              type: "startStreaming",
              selectedCode: selectedCode,
              fileName: fileName,
              lineStart: lineStart,
              lineEnd: lineEnd,
            });

            // Use streaming LLM call
            await callLLMStream(
              apiToken,
              prompt,
              llmEndpoint,
              llmModel,
              (chunk) => {
                webviewView.webview.postMessage({
                  type: "streamChunk",
                  chunk: chunk,
                });
              }
            );

            // Send completion message
            webviewView.webview.postMessage({
              type: "streamComplete",
            });
          } catch (error) {
            webviewView.webview.postMessage({
              type: "error",
              content: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
          break;
        case "getSelectedCode":
          const editor = vscode.window.activeTextEditor;
          if (editor && !editor.selection.isEmpty) {
            const selectedCode = editor.document.getText(editor.selection);
            const fileName =
              editor.document.fileName.split(/[\\/]/).pop() || "";
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
          break;
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

				<div id="messagesContainer" class="messages-container">
					<div class="message ai">
						<div class="message-bubble">
							Hello! I'm your AI coding assistant. Select some code in your editor and ask me anything about it!
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
						placeholder="Type your message here... (Select code in editor to include it in your question)"
					></textarea>
					<button id="sendButton" class="send-button">Send Message</button>
				</div>
			</div>

			<script>
				const vscode = acquireVsCodeApi();
				let selectedCode = "";
				let fileName = "";
				let lineStart = 0;
				let lineEnd = 0;

				// Get initial selected code
				vscode.postMessage({ type: 'getSelectedCode' });

				function addMessage(content, isUser = false) {
					const messagesContainer = document.getElementById('messagesContainer');
					const messageDiv = document.createElement('div');
					messageDiv.className = \`message \${isUser ? 'user' : 'ai'}\`;

					const bubbleDiv = document.createElement('div');
					bubbleDiv.className = 'message-bubble';
					bubbleDiv.textContent = content;

					const timeDiv = document.createElement('div');
					timeDiv.className = 'message-time';
					timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

					messageDiv.appendChild(bubbleDiv);
					messageDiv.appendChild(timeDiv);
					messagesContainer.appendChild(messageDiv);

					// Scroll to bottom
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

						case 'startStreaming':
							hideTypingIndicator();
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
							messagesContainer.appendChild(messageDiv);

							// Scroll to bottom
							messagesContainer.scrollTop = messagesContainer.scrollHeight;
							break;

						case 'streamChunk':
							// Append chunk to the current streaming message
							const streamingBubble = document.getElementById('currentStreamingBubble');
							if (streamingBubble) {
								streamingBubble.textContent += message.chunk;
								// Scroll to bottom to follow the text
								document.getElementById('messagesContainer').scrollTop = document.getElementById('messagesContainer').scrollHeight;
							}
							break;

						case 'streamComplete':
							// Remove the temporary ID from the completed message
							const completedMessage = document.getElementById('currentStreamingMessage');
							if (completedMessage) {
								completedMessage.removeAttribute('id');
								const completedBubble = document.getElementById('currentStreamingBubble');
								if (completedBubble) {
									completedBubble.removeAttribute('id');
								}
							}
							document.getElementById('sendButton').disabled = false;
							document.getElementById('sendButton').textContent = 'Send Message';
							break;

						case 'error':
							hideTypingIndicator();
							addMessage(\`Error: \${message.content}\`, false);
							document.getElementById('sendButton').disabled = false;
							document.getElementById('sendButton').textContent = 'Send Message';
							break;
					}
				});

				// Handle send button click
				document.getElementById('sendButton').addEventListener('click', () => {
					const messageInput = document.getElementById('messageInput');
					const message = messageInput.value.trim();

					if (!message) {
						return;
					}

					// Add user message to chat
					addMessage(message, true);

					// Disable button and show loading
					const sendButton = document.getElementById('sendButton');
					sendButton.disabled = true;
					sendButton.textContent = 'Sending...';

					// Show typing indicator
					showTypingIndicator();

					vscode.postMessage({
						type: 'sendMessage',
						message: message
					});

					// Clear input
					messageInput.value = '';
				});

				// Handle Enter key in textarea
				document.getElementById('messageInput').addEventListener('keydown', (event) => {
					if (event.key === 'Enter' && !event.shiftKey) {
						event.preventDefault();
						document.getElementById('sendButton').click();
					}
				});
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
    console.log("=== AI Reviewer LLM Request Debug ===");
    console.log("Endpoint:", endpoint);
    console.log("Model:", model);
    console.log("Request Body:", JSON.stringify(requestBody, null, 2));
    console.log("=== End Request Debug ===");

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
      return data.response ?? "No response received from LLM";
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
    console.log("=== AI Reviewer LLM Streaming Request Debug ===");
    console.log("Endpoint:", endpoint);
    console.log("Model:", model);
    console.log("Request Body:", JSON.stringify(requestBody, null, 2));
    console.log("=== End Request Debug ===");

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
          console.log("Error parsing streaming response:", line, e);
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
            console.log("=== AI Reviewer Code Review - Prompt Debug ===");
            console.log("File:", document.fileName);
            console.log("Language:", document.languageId);
            console.log(
              "Coding Convention:",
              codingConvention || "Standard coding best practices"
            );
            console.log("Full Prompt:");
            console.log(prompt);
            console.log("=== End Prompt Debug ===");

            const response = await callLLM(apiToken, prompt, endpoint, model);

            progress.report({ increment: 100 });

            // Show the review in a new document
            await showReviewResults(response, document.fileName);
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

      const message = `Current Settings:\nAPI Token: ${
        apiToken ? "***" + apiToken.slice(-4) : "Not set"
      }\nCoding Convention: ${
        codingConvention || "Not set"
      }\nLLM Endpoint: ${llmEndpoint}\nLLM Model: ${llmModel}`;
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
    };
  }

  // Listen for configuration changes
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("aiReviewer")) {
        const newConfig = getConfiguration();
        console.log("AI Reviewer configuration updated:", {
          apiToken: newConfig.apiToken
            ? "***" + newConfig.apiToken.slice(-4)
            : "Not set",
          codingConvention: newConfig.codingConvention || "Not set",
          llmEndpoint: newConfig.llmEndpoint,
          llmModel: newConfig.llmModel,
        });
      }
    }
  );

  context.subscriptions.push(
    disposable,
    showSettingsDisposable,
    openSettingsPanelDisposable,
    configChangeDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
