import * as vscode from "vscode";
import { WorkspaceCommands } from "../../commands/WorkspaceCommands";
import { WorkspaceIndexer } from "../../services/workspace";

export class WorkspaceCommandsPanel {
  public static readonly viewType = "ai-reviewer.workspaceCommands";
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _workspaceCommands: WorkspaceCommands;
  private readonly _indexer: WorkspaceIndexer;

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (WorkspaceCommandsPanel.currentPanel) {
      WorkspaceCommandsPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      WorkspaceCommandsPanel.viewType,
      "Workspace Commands",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      }
    );

    new WorkspaceCommandsPanel(panel, extensionUri);
  }

  private static currentPanel: WorkspaceCommandsPanel | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspaceCommands = WorkspaceCommands.getInstance();
    this._indexer = WorkspaceIndexer.getInstance();

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "executeCommand":
            await this.executeCommand(message.commandName);
            break;
          case "refreshStatus":
            this.updateStatus();
            break;
        }
      },
      undefined
    );
  }

  private async executeCommand(commandName: string): Promise<void> {
    try {
      switch (commandName) {
        case "indexWorkspace":
          await this._workspaceCommands.indexWorkspace();
          break;
        case "indexWorkspaceOnOpen":
          await this._workspaceCommands.indexWorkspaceOnOpen();
          break;
        case "refreshCurrentFile":
          await this._workspaceCommands.refreshCurrentFile();
          break;
        case "showWorkspaceInfo":
          await this._workspaceCommands.showWorkspaceInfo();
          break;
        case "saveIndex":
          await this._workspaceCommands.saveIndex();
          break;
        case "loadIndex":
          await this._workspaceCommands.loadIndex();
          break;
        case "clearIndex":
          await this._workspaceCommands.clearIndex();
          break;
        case "searchInWorkspace":
          await this._workspaceCommands.searchInWorkspace();
          break;
        default:
          vscode.window.showWarningMessage(`Unknown command: ${commandName}`);
      }

      // Refresh the status after command execution
      setTimeout(() => this.updateStatus(), 1000);
    } catch (error) {
      vscode.window.showErrorMessage(`Error executing command ${commandName}: ${error}`);
    }
  }

  private updateStatus(): void {
    const index = this._indexer.getCurrentIndex();
    const isIndexing = this._indexer.isCurrentlyIndexing();

    this._panel.webview.postMessage({
      command: "updateStatus",
      status: {
        hasIndex: !!index,
        isIndexing,
        fileCount: index?.files.length || 0,
        functionCount: index?.statistics.totalFunctions || 0,
        classCount: index?.statistics.totalClasses || 0,
        lastUpdated: index?.updatedAt ? new Date(index.updatedAt).toLocaleString() : null
      }
    });
  }

  public dispose() {
    WorkspaceCommandsPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = "Workspace Commands";
    this._panel.webview.html = this._getHtmlForWebview(webview);

    // Update status after HTML is loaded
    setTimeout(() => this.updateStatus(), 100);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Workspace Commands</title>
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  margin: 0;
                  padding: 20px;
                  background-color: var(--vscode-editor-background);
                  color: var(--vscode-editor-foreground);
              }

              .container {
                  max-width: 800px;
                  margin: 0 auto;
              }

              .header {
                  text-align: center;
                  margin-bottom: 30px;
                  padding-bottom: 20px;
                  border-bottom: 2px solid var(--vscode-textLink-foreground);
              }

              .header h1 {
                  margin: 0;
                  color: var(--vscode-textLink-foreground);
                  font-size: 24px;
              }

              .status-section {
                  background-color: var(--vscode-editor-inactiveSelectionBackground);
                  padding: 20px;
                  border-radius: 8px;
                  margin-bottom: 30px;
              }

              .status-grid {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                  gap: 15px;
                  margin-top: 15px;
              }

              .status-item {
                  background-color: var(--vscode-editor-background);
                  padding: 15px;
                  border-radius: 6px;
                  text-align: center;
              }

              .status-value {
                  font-size: 20px;
                  font-weight: bold;
                  color: var(--vscode-textLink-foreground);
              }

              .status-label {
                  font-size: 12px;
                  color: var(--vscode-descriptionForeground);
                  margin-top: 5px;
              }

              .commands-section {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                  gap: 20px;
              }

              .command-card {
                  background-color: var(--vscode-editor-inactiveSelectionBackground);
                  padding: 20px;
                  border-radius: 8px;
                  border: 1px solid var(--vscode-editor-lineHighlightBackground);
              }

              .command-title {
                  font-size: 16px;
                  font-weight: bold;
                  margin-bottom: 10px;
                  color: var(--vscode-textLink-foreground);
              }

              .command-description {
                  font-size: 14px;
                  color: var(--vscode-descriptionForeground);
                  margin-bottom: 15px;
                  line-height: 1.4;
              }

              .execute-button {
                  background-color: var(--vscode-button-background);
                  color: var(--vscode-button-foreground);
                  border: none;
                  padding: 8px 16px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 14px;
                  transition: background-color 0.2s;
              }

              .execute-button:hover {
                  background-color: var(--vscode-button-hoverBackground);
              }

              .execute-button:disabled {
                  background-color: var(--vscode-button-secondaryBackground);
                  color: var(--vscode-button-secondaryForeground);
                  cursor: not-allowed;
              }

              .loading {
                  opacity: 0.6;
                  pointer-events: none;
              }

              .indexing-indicator {
                  display: inline-block;
                  width: 12px;
                  height: 12px;
                  border: 2px solid var(--vscode-textLink-foreground);
                  border-radius: 50%;
                  border-top-color: transparent;
                  animation: spin 1s linear infinite;
                  margin-right: 8px;
              }

              @keyframes spin {
                  to { transform: rotate(360deg); }
              }

              .refresh-button {
                  background-color: var(--vscode-button-secondaryBackground);
                  color: var(--vscode-button-secondaryForeground);
                  border: none;
                  padding: 6px 12px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 12px;
                  margin-left: 10px;
              }

              .refresh-button:hover {
                  background-color: var(--vscode-button-secondaryHoverBackground);
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🚀 Workspace Commands</h1>
                  <p>Execute workspace indexing and management commands</p>
              </div>

              <div class="status-section">
                  <h3>📊 Current Status</h3>
                  <div class="status-grid">
                      <div class="status-item">
                          <div class="status-value" id="indexStatus">Checking...</div>
                          <div class="status-label">Index Status</div>
                      </div>
                      <div class="status-item">
                          <div class="status-value" id="fileCount">-</div>
                          <div class="status-label">Files Indexed</div>
                      </div>
                      <div class="status-item">
                          <div class="status-value" id="functionCount">-</div>
                          <div class="status-label">Functions</div>
                      </div>
                      <div class="status-item">
                          <div class="status-value" id="classCount">-</div>
                          <div class="status-label">Classes</div>
                      </div>
                      <div class="status-item">
                          <div class="status-value" id="lastUpdated">-</div>
                          <div class="status-label">Last Updated</div>
                      </div>
                  </div>
                  <button class="refresh-button" onclick="refreshStatus()">🔄 Refresh</button>
              </div>

              <div class="commands-section">
                  <div class="command-card">
                      <div class="command-title">📁 Index Workspace</div>
                      <div class="command-description">
                          Scan and index all files in the workspace. This will analyze code structure,
                          extract functions, classes, and dependencies.
                      </div>
                      <button class="execute-button" onclick="executeCommand('indexWorkspace')" id="btn-indexWorkspace">
                          Execute Index Workspace
                      </button>
                  </div>

                  <div class="command-card">
                      <div class="command-title">🔄 Refresh Current File</div>
                      <div class="command-description">
                          Re-index the currently active file. Useful when you've made changes to a file
                          and want to update its index.
                      </div>
                      <button class="execute-button" onclick="executeCommand('refreshCurrentFile')" id="btn-refreshCurrentFile">
                          Execute Refresh File
                      </button>
                  </div>

                  <div class="command-card">
                      <div class="command-title">📊 Show Workspace Info</div>
                      <div class="command-description">
                          Display detailed information about the workspace including statistics,
                          dependencies, and project structure.
                      </div>
                      <button class="execute-button" onclick="executeCommand('showWorkspaceInfo')" id="btn-showWorkspaceInfo">
                          Execute Show Info
                      </button>
                  </div>

                  <div class="command-card">
                      <div class="command-title">💾 Save Index</div>
                      <div class="command-description">
                          Save the current workspace index to a JSON file for backup or sharing purposes.
                      </div>
                      <button class="execute-button" onclick="executeCommand('saveIndex')" id="btn-saveIndex">
                          Execute Save Index
                      </button>
                  </div>

                  <div class="command-card">
                      <div class="command-title">📂 Load Index</div>
                      <div class="command-description">
                          Load a previously saved workspace index from a JSON file.
                      </div>
                      <button class="execute-button" onclick="executeCommand('loadIndex')" id="btn-loadIndex">
                          Execute Load Index
                      </button>
                  </div>

                  <div class="command-card">
                      <div class="command-title">🔍 Search in Workspace</div>
                      <div class="command-description">
                          Search for functions, classes, or variables across the entire workspace index.
                      </div>
                      <button class="execute-button" onclick="executeCommand('searchInWorkspace')" id="btn-searchInWorkspace">
                          Execute Search
                      </button>
                  </div>

                  <div class="command-card">
                      <div class="command-title">🗑️ Clear Index</div>
                      <div class="command-description">
                          Clear the current workspace index. This will remove all indexed data and
                          free up memory.
                      </div>
                      <button class="execute-button" onclick="executeCommand('clearIndex')" id="btn-clearIndex">
                          Execute Clear Index
                      </button>
                  </div>
              </div>
          </div>

          <script>
              const vscode = acquireVsCodeApi();

              function executeCommand(commandName) {
                  const button = document.getElementById('btn-' + commandName);
                  if (button) {
                      button.disabled = true;
                      button.textContent = 'Executing...';
                      button.classList.add('loading');
                  }

                  vscode.postMessage({
                      command: 'executeCommand',
                      commandName: commandName
                  });
              }

              function refreshStatus() {
                  vscode.postMessage({
                      command: 'refreshStatus'
                  });
              }

              // Handle messages from the extension
              window.addEventListener('message', event => {
                  const message = event.data;

                  switch (message.command) {
                      case 'updateStatus':
                          updateStatusDisplay(message.status);
                          break;
                  }
              });

              function updateStatusDisplay(status) {
                  const indexStatusEl = document.getElementById('indexStatus');
                  const fileCountEl = document.getElementById('fileCount');
                  const functionCountEl = document.getElementById('functionCount');
                  const classCountEl = document.getElementById('classCount');
                  const lastUpdatedEl = document.getElementById('lastUpdated');

                  if (status.isIndexing) {
                      indexStatusEl.innerHTML = '<span class="indexing-indicator"></span>Indexing...';
                  } else if (status.hasIndex) {
                      indexStatusEl.textContent = '✅ Indexed';
                  } else {
                      indexStatusEl.textContent = '❌ Not Indexed';
                  }

                  fileCountEl.textContent = status.fileCount;
                  functionCountEl.textContent = status.functionCount;
                  classCountEl.textContent = status.classCount;
                  lastUpdatedEl.textContent = status.lastUpdated || 'Never';

                  // Re-enable all buttons
                  const buttons = document.querySelectorAll('.execute-button');
                  buttons.forEach(button => {
                      button.disabled = false;
                      button.classList.remove('loading');

                      // Reset button text
                      const commandName = button.id.replace('btn-', '');
                      switch (commandName) {
                          case 'indexWorkspace':
                              button.textContent = 'Execute Index Workspace';
                              break;
                          case 'refreshCurrentFile':
                              button.textContent = 'Execute Refresh File';
                              break;
                          case 'showWorkspaceInfo':
                              button.textContent = 'Execute Show Info';
                              break;
                          case 'saveIndex':
                              button.textContent = 'Execute Save Index';
                              break;
                          case 'loadIndex':
                              button.textContent = 'Execute Load Index';
                              break;
                          case 'searchInWorkspace':
                              button.textContent = 'Execute Search';
                              break;
                          case 'clearIndex':
                              button.textContent = 'Execute Clear Index';
                              break;
                      }
                  });
              }
          </script>
      </body>
      </html>
    `;
  }
}
