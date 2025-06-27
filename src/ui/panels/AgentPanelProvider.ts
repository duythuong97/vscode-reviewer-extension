import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AgentWorkflow, AgentStepResult } from "../../types";
import Handlebars from "handlebars";
import helpers from "handlebars-helpers";
import { VSCodeUtils } from "../../utils";
helpers({ handlebars: Handlebars });
Handlebars.registerHelper("json", function (context) {
  return new Handlebars.SafeString(
    JSON.stringify(context, null, 2).replace(/</g, "&lt;").replace(/>/g, "&gt;")
  );
});

export class AgentPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aiReviewer.agentPanel";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = await VSCodeUtils.getWebviewHtml(
      this._extensionUri,
      webviewView.webview,
      "agentPanel.html",
      "agentPanel.css",
      "agentPanel.js"
    );

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "executeCurrentStep":
          await vscode.commands.executeCommand(
            "ai-reviewer.executeCurrentStep"
          );
          break;
        case "executeStep":
          const { stepId } = data;
          await vscode.commands.executeCommand(
            "ai-reviewer.executeStep",
            stepId
          );
          break;
        case "nextStep":
          await vscode.commands.executeCommand("ai-reviewer.nextStep");
          break;
        case "executeFullWorkflow":
          await vscode.commands.executeCommand(
            "ai-reviewer.executeFullWorkflow"
          );
          break;
        case "clearWorkflow":
          await vscode.commands.executeCommand("ai-reviewer.clearWorkflow");
          break;
        case "createWorkflow":
          await vscode.commands.executeCommand(
            "ai-reviewer.createAgentWorkflow"
          );
          break;
      }
    });
  }

  public isWebviewAvailable(): boolean {
    return this._view !== undefined;
  }

  private getFallbackHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Agent Panel</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .error { color: red; }
        </style>
      </head>
      <body>
        <h2>AI Agent Panel</h2>
        <p class="error">Failed to load agent panel template.</p>
      </body>
      </html>
    `;
  }

  public async sendAgentWorkflow(workflow: AgentWorkflow): Promise<void> {
    const html = await this.renderAgentWorkflow(workflow);
    await VSCodeUtils.sendMessageWithRetry(this._view?.webview, {
      type: "agentWorkflow",
      renderedHtml: html,
    });
  }

  public async updateAgentStepResult(result: AgentStepResult): Promise<void> {
    await VSCodeUtils.sendMessageWithRetry(this._view?.webview, {
      type: "agentStepResult",
      result: result,
    });
  }

  public async updateAgentWorkflow(
    workflow: AgentWorkflow | null
  ): Promise<void> {
    const html = await this.renderAgentWorkflow(workflow);
    await VSCodeUtils.sendMessageWithRetry(this._view?.webview, {
      type: "updateAgentWorkflow",
      renderedHtml: html,
    });
  }

  public async completeAgentWorkflow(): Promise<void> {
    await VSCodeUtils.sendMessageWithRetry(this._view?.webview, {
      type: "completeAgentWorkflow",
    });
  }

  public async clearAgentWorkflow(): Promise<void> {
    await VSCodeUtils.sendMessageWithRetry(this._view?.webview, {
      type: "clearAgentWorkflow",
      renderedHtml: `
          <div class="empty-state">
            <h3>No Active Workflow</h3>
            <p>Create a new AI Agent workflow to get started.</p>
            <button class="workflow-btn primary" onclick="createNewWorkflow()">
              🤖 Create New Workflow
            </button>
          </div>
        `,
    });
  }

  public async renderAgentWorkflow(
    workflow: AgentWorkflow | null
  ): Promise<string> {
    const templatePath = path.join(
      this._extensionUri.fsPath,
      "media",
      "templates",
      "agentWorkflowTemplate.hbs"
    );
    const source = fs.readFileSync(templatePath, "utf-8");
    const template = Handlebars.compile(source);

    const html = template({
      workflow: workflow,
    });

    return html;
  }
}
