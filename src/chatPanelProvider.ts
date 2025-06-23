import * as vscode from "vscode";
import { logDebug } from "./helper";
import { callLLMStreamWithCancellation } from "./llmProvider";
import { debugOutputChannel } from "./extension";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
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
