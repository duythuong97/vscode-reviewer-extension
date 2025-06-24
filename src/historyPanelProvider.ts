import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class HistoryPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiReviewer.historyPanel';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        // Get the HTML content from the external file
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'historyPanel.html');
        let htmlContent = '';

        try {
            htmlContent = fs.readFileSync(htmlPath, 'utf8');
        } catch (error) {
            console.error('Error reading historyPanel.html:', error);
            htmlContent = this.getFallbackHtml();
        }

        webviewView.webview.html = htmlContent;

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'getHistory':
                        this.sendHistory();
                        break;
                    case 'viewReview':
                        this.viewReview(message.id);
                        break;
                    case 'reapplyReview':
                        this.reapplyReview(message.id);
                        break;
                }
            }
        );

        // Send initial history data
        this.sendHistory();
    }

    private getFallbackHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>History Panel</title>
            </head>
            <body>
                <h3>Review History</h3>
                <p>Error loading history panel. Please check the extension configuration.</p>
            </body>
            </html>
        `;
    }

    private sendHistory() {
        // Mock history data - in a real implementation, this would come from storage
        const history = [
            {
                id: '1',
                fileName: 'example.ts',
                timestamp: new Date().toLocaleString(),
                status: 'success'
            },
            {
                id: '2',
                fileName: 'test.js',
                timestamp: new Date(Date.now() - 86400000).toLocaleString(),
                status: 'warning'
            }
        ];

        this._view?.webview.postMessage({
            command: 'updateHistory',
            history: history
        });
    }

    private viewReview(id: string) {
        // Handle viewing a specific review
        console.log('Viewing review:', id);
        vscode.window.showInformationMessage(`Viewing review ${id}`);
    }

    private reapplyReview(id: string) {
        // Handle reapplying a review
        console.log('Reapplying review:', id);
        vscode.window.showInformationMessage(`Reapplying review ${id}`);
    }

    public updateHistory(newHistory: any[]) {
        this._view?.webview.postMessage({
            command: 'updateHistory',
            history: newHistory
        });
    }
}