import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class TemplatesPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiReviewer.templatesPanel';
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
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'templatesPanel.html');
        let htmlContent = '';

        try {
            htmlContent = fs.readFileSync(htmlPath, 'utf8');
        } catch (error) {
            console.error('Error reading templatesPanel.html:', error);
            htmlContent = this.getFallbackHtml();
        }

        webviewView.webview.html = htmlContent;

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'getTemplates':
                        this.sendTemplates();
                        break;
                    case 'useTemplate':
                        this.useTemplate(message.templateId);
                        break;
                    case 'editTemplate':
                        this.editTemplate(message.templateId);
                        break;
                    case 'duplicateTemplate':
                        this.duplicateTemplate(message.templateId);
                        break;
                    case 'addNewTemplate':
                        this.addNewTemplate();
                        break;
                }
            }
        );

        // Send initial templates data
        this.sendTemplates();
    }

    private getFallbackHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Templates Panel</title>
            </head>
            <body>
                <h3>Review Templates</h3>
                <p>Error loading templates panel. Please check the extension configuration.</p>
            </body>
            </html>
        `;
    }

    private sendTemplates() {
        // Mock templates data - in a real implementation, this would come from storage
        const templates = [
            {
                id: 'default',
                title: 'Default Review',
                description: 'Standard code review with quality and security checks',
                tags: ['default', 'quality', 'security']
            },
            {
                id: 'performance',
                title: 'Performance Review',
                description: 'Focus on performance optimization and efficiency',
                tags: ['performance', 'optimization', 'efficiency']
            },
            {
                id: 'security',
                title: 'Security Review',
                description: 'Comprehensive security vulnerability assessment',
                tags: ['security', 'vulnerability', 'assessment']
            }
        ];

        this._view?.webview.postMessage({
            command: 'updateTemplates',
            templates: templates
        });
    }

    private useTemplate(templateId: string) {
        // Handle using a template
        console.log('Using template:', templateId);
        vscode.window.showInformationMessage(`Using template: ${templateId}`);

        // This would typically load the template and apply it to the current review
        // For now, just show a notification
    }

    private editTemplate(templateId: string) {
        // Handle editing a template
        console.log('Editing template:', templateId);
        vscode.window.showInformationMessage(`Editing template: ${templateId}`);
    }

    private duplicateTemplate(templateId: string) {
        // Handle duplicating a template
        console.log('Duplicating template:', templateId);
        vscode.window.showInformationMessage(`Duplicating template: ${templateId}`);
    }

    private addNewTemplate() {
        // Handle adding a new template
        console.log('Adding new template');
        vscode.window.showInformationMessage('Adding new template');
    }

    public updateTemplates(newTemplates: any[]) {
        this._view?.webview.postMessage({
            command: 'updateTemplates',
            templates: newTemplates
        });
    }
}