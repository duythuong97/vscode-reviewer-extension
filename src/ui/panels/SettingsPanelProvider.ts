import * as vscode from "vscode";
import { ConfigManager } from "../../core/managers/ConfigManager";
import { PromptManager } from "../../core/Prompts";
import { WorkspaceFileTemplate } from "../../core/workspaceFileTemplate";
import * as path from "path";

export class SettingsPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aiReviewer.settingsPanel";

  private _view?: vscode.WebviewView;
  private configManager: ConfigManager;
  private promptManager: PromptManager;
  private workspaceFileTemplate: WorkspaceFileTemplate;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.configManager = ConfigManager.getInstance();
    this.promptManager = PromptManager.getInstance();
    this.workspaceFileTemplate = WorkspaceFileTemplate.getInstance();
    console.log("SettingsPanelProvider constructor called");
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    console.log("SettingsPanelProvider resolveWebviewView called");
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    try {
      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
      console.log("SettingsPanelProvider HTML loaded successfully");
    } catch (error) {
      console.error("SettingsPanelProvider failed to load HTML:", error);
      vscode.window.showErrorMessage(`Failed to load settings panel: ${error}`);
      return;
    }

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      console.log("SettingsPanelProvider received message:", data);
      switch (data.type) {
        case "getSettings":
          const config = this.configManager.getConfig();
          console.log("SettingsPanelProvider sending settings:", config);
          webviewView.webview.postMessage({
            type: "settingsLoaded",
            settings: config,
          });
          break;

        case "updateSetting":
          try {
            if (data.key) {
              await this.configManager.updateConfig({ [data.key]: data.value });
            } else {
              // Save all settings at once
              console.log("Saving all settings:", data.value);
              await this.configManager.updateConfig(data.value);
            }

            // Refresh the config manager to get updated values
            this.configManager.refreshConfig();

            // Get updated config to verify
            const updatedConfig = this.configManager.getConfig();
            console.log("Updated config after save:", updatedConfig);

            webviewView.webview.postMessage({
              type: "settingUpdated",
              key: data.key,
              value: data.value,
            });
          } catch (error) {
            console.error("Error updating settings:", error);
            webviewView.webview.postMessage({
              type: "error",
              message: `Failed to update setting: ${error}`,
            });
          }
          break;

        case "resetToDefaults":
          try {
            await this.configManager.resetToDefaults();
            const config = this.configManager.getConfig();
            webviewView.webview.postMessage({
              type: "settingsReset",
              settings: config,
            });
          } catch (error) {
            webviewView.webview.postMessage({
              type: "error",
              message: `Failed to reset settings: ${error}`,
            });
          }
          break;

        case "validateSettings":
          const validation = this.configManager.validateConfig();
          webviewView.webview.postMessage({
            type: "validationResult",
            isValid: validation.isValid,
            errors: validation.errors,
          });
          break;

        case "openConventionFile": {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders && workspaceFolders.length > 0) {
            const filePath = path.join(
              workspaceFolders[0].uri.fsPath,
              ".vscode/ai-reviewer-coding-convention.md"
            );
            // Ensure file exists with default content
            this.workspaceFileTemplate.ensureFile({
              path: ".vscode/ai-reviewer-coding-convention.md",
              defaultContent: "",
              description: "",
            });
            const fileUri = vscode.Uri.file(filePath);
            await vscode.window.showTextDocument(fileUri, { preview: false });
          }
          break;
        }
        case "openCustomPromptFile": {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders && workspaceFolders.length > 0) {
            const filePath = path.join(
              workspaceFolders[0].uri.fsPath,
              ".vscode/ai-reviewer-custom-prompt.md"
            );
            // Ensure file exists with default content
            this.workspaceFileTemplate.ensureFile({
              path: ".vscode/ai-reviewer-custom-prompt.md",
              defaultContent: "",
              description: "",
            });
            const fileUri = vscode.Uri.file(filePath);
            await vscode.window.showTextDocument(fileUri, { preview: false });
          }
          break;
        }
        case "openCodeReviewPromptFile": {
          const filePaths = this.promptManager.getPromptFilePaths();
          const fileUri = vscode.Uri.file(filePaths.codeReview);
          await vscode.window.showTextDocument(fileUri, { preview: false });
          break;
        }
        case "openConventionViolationPromptFile": {
          const filePaths = this.promptManager.getPromptFilePaths();
          const fileUri = vscode.Uri.file(filePaths.conventionViolation);
          await vscode.window.showTextDocument(fileUri, { preview: false });
          break;
        }
        case "openPRReviewPromptFile": {
          const filePaths = this.promptManager.getPromptFilePaths();
          const fileUri = vscode.Uri.file(filePaths.prReview);
          await vscode.window.showTextDocument(fileUri, { preview: false });
          break;
        }
        case "openGhostTextPromptFile": {
          const filePaths = this.promptManager.getPromptFilePaths();
          const fileUri = vscode.Uri.file(filePaths.ghostText);
          await vscode.window.showTextDocument(fileUri, { preview: false });
          break;
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    try {
      console.log(
        "SettingsPanelProvider trying to load HTML from:",
        path.join(__dirname, "../media/settingsPanel.html")
      );
      const htmlPath = path.join(
        this._extensionUri.fsPath,
        "media",
        "settingsPanel.html"
      );
      const htmlContent = require("fs").readFileSync(htmlPath, "utf8");
      console.log(
        "SettingsPanelProvider HTML file loaded successfully, length:",
        htmlContent.length
      );
      return htmlContent;
    } catch (error) {
      console.error("SettingsPanelProvider failed to load HTML file:", error);
      throw error;
    }
  }
}
