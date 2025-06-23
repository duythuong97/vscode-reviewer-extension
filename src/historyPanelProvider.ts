import * as vscode from 'vscode';

export class HistoryPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-reviewer-history';
  public webviewView?: vscode.WebviewView;
  public onDidReceiveMessage?: (message: any) => void;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Set up message handling
    webviewView.webview.onDidReceiveMessage((message) => {
      if (this.onDidReceiveMessage) {
        this.onDidReceiveMessage(message);
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Review History</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 10px;
                margin: 0;
            }
            .history-item {
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 8px;
                margin-bottom: 8px;
                background-color: var(--vscode-editor-background);
            }
            .history-item:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .file-name {
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
            }
            .timestamp {
                font-size: 0.8em;
                color: var(--vscode-descriptionForeground);
            }
            .status {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 0.8em;
                margin-left: 8px;
            }
            .status.success {
                background-color: var(--vscode-testing-iconPassed);
                color: white;
            }
            .status.warning {
                background-color: var(--vscode-testing-iconFailed);
                color: white;
            }
            .empty-state {
                text-align: center;
                color: var(--vscode-descriptionForeground);
                padding: 20px;
            }
            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 6px 12px;
                border-radius: 3px;
                cursor: pointer;
                margin: 2px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
        </style>
    </head>
    <body>
        <h3>Review History</h3>
        <div id="history-container">
            <div class="empty-state">
                <p>No review history yet</p>
                <p>Start reviewing files to see history here</p>
            </div>
        </div>
        <script>
            const vscode = acquireVsCodeApi();

            // Listen for messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'updateHistory':
                        updateHistoryDisplay(message.history);
                        break;
                }
            });

            function updateHistoryDisplay(history) {
                const container = document.getElementById('history-container');

                if (!history || history.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state">
                            <p>No review history yet</p>
                            <p>Start reviewing files to see history here</p>
                        </div>
                    \`;
                    return;
                }

                container.innerHTML = history.map(item => \`
                    <div class="history-item">
                        <div class="file-name">\${item.fileName}</div>
                        <div class="timestamp">\${item.timestamp}</div>
                        <span class="status \${item.status}">\${item.status}</span>
                        <div style="margin-top: 4px;">
                            <button onclick="viewReview('\${item.id}')">View</button>
                            <button onclick="reapplyReview('\${item.id}')">Reapply</button>
                        </div>
                    </div>
                \`).join('');
            }

            function viewReview(id) {
                vscode.postMessage({
                    command: 'viewReview',
                    id: id
                });
            }

            function reapplyReview(id) {
                vscode.postMessage({
                    command: 'reapplyReview',
                    id: id
                });
            }

            // Request initial history data
            vscode.postMessage({
                command: 'getHistory'
            });
        </script>
    </body>
    </html>`;
  }
}