import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class AnalyticsPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiReviewer.analyticsPanel';
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
    const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'analyticsPanel.html');
    let htmlContent = '';

    try {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
      console.error('Error reading analyticsPanel.html:', error);
      htmlContent = this.getFallbackHtml();
    }

    webviewView.webview.html = htmlContent;

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'getAnalytics':
            this.sendAnalytics();
            break;
          case 'refreshAnalytics':
            this.refreshAnalytics();
            break;
        }
      }
    );

    // Send initial analytics data
    this.sendAnalytics();
  }

  private getFallbackHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Analytics Panel</title>
      </head>
      <body>
        <h3>Analytics Dashboard</h3>
        <p>Error loading analytics panel. Please check the extension configuration.</p>
      </body>
      </html>
    `;
  }

  private sendAnalytics() {
    // Mock analytics data - in a real implementation, this would come from storage
    const analytics = {
      totalReviews: 42,
      totalIssues: 15,
      successRate: 64,
      weeklyData: [5, 8, 12, 6, 9, 3, 1]
    };

    this._view?.webview.postMessage({
      command: 'updateAnalytics',
      analytics: analytics
    });
  }

  private refreshAnalytics() {
    // Refresh analytics data
    console.log('Refreshing analytics');
    this.sendAnalytics();
  }

  public updateAnalytics(newAnalytics: any) {
    this._view?.webview.postMessage({
      command: 'updateAnalytics',
      analytics: newAnalytics
    });
  }
}