import * as vscode from "vscode";
export class SettingsPanelProvider implements vscode.WebviewViewProvider {
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
