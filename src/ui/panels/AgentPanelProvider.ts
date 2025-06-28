import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

import Handlebars from "handlebars";
import helpers from "handlebars-helpers";
import { VSCodeUtils } from "../../utils";
helpers({ handlebars: Handlebars });
Handlebars.registerHelper("json", function (context) {
  return new Handlebars.SafeString(
    JSON.stringify(context, null, 2).replace(/</g, "&lt;").replace(/>/g, "&gt;")
  );
});
import { Workflow } from "../../agents/types/agent";
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
  }

  public isWebviewAvailable(): boolean {
    return this._view !== undefined;
  }

  public async rendertWorkflow(workflow: Workflow): Promise<void> {
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

    await VSCodeUtils.sendMessageWithRetry(this._view?.webview, {
      type: "renderAgentWorkflow",
      renderedHtml: html,
    });
  }
}
