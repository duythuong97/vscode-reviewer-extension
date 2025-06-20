// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

class SettingsPanelProvider implements vscode.WebviewViewProvider {
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
        case "getSettings":
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
          });
          break;
        case "updateSettings":
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
          vscode.window.showInformationMessage(
            "Settings updated successfully!"
          );
          break;
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
			</style>
		</head>
		<body>
			<h3>AI Reviewer Settings</h3>
			<div class="form-group">
				<label for="apiToken">API Token:</label>
				<input type="password" id="apiToken" placeholder="Enter your API token">
			</div>
			<div class="form-group">
				<label for="codingConvention">Coding Convention:</label>
				<textarea id="codingConvention" placeholder="Enter your coding convention rules"></textarea>
			</div>
			<div class="form-group">
				<label for="llmEndpoint">LLM API Endpoint:</label>
				<input type="text" id="llmEndpoint" placeholder="http://localhost:11434/api/generate">
			</div>
			<div class="form-group">
				<label for="llmModel">LLM Model:</label>
				<input type="text" id="llmModel" placeholder="llama3">
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
							break;
					}
				});

				// Handle save button click
				document.getElementById('saveBtn').addEventListener('click', () => {
					const apiToken = document.getElementById('apiToken').value;
					const codingConvention = document.getElementById('codingConvention').value;
					const llmEndpoint = document.getElementById('llmEndpoint').value;
					const llmModel = document.getElementById('llmModel').value;

					vscode.postMessage({
						type: 'updateSettings',
						apiToken: apiToken,
						codingConvention: codingConvention,
						llmEndpoint: llmEndpoint,
						llmModel: llmModel
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
			</script>
		</body>
		</html>`;
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "ai-reviewer" is now active!');

  // Register the settings panel provider
  const settingsPanelProvider = new SettingsPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SettingsPanelProvider.viewType,
      settingsPanelProvider
    )
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "ai-reviewer.reviewFile",
    async () => {
      // Get the active text editor
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found!");
        return;
      }

      // Get the document and its text
      const document = editor.document;
      const text = document.getText();

      if (!text.trim()) {
        vscode.window.showErrorMessage("The current file is empty!");
        return;
      }

      // Get configuration settings
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const apiToken = config.get<string>("apiToken", "");
      const codingConvention = config.get<string>("codingConvention", "");

      const endpoint = config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      );
      const model = config.get<string>("llmModel", "llama3");

      if (!apiToken) {
        vscode.window.showErrorMessage(
          "API token not configured. Please set it in the AI Reviewer settings."
        );
        return;
      }

      // Show progress notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `AI Reviewer: Analyzing code with model ${model}... `,
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ increment: 0 });

            // Prepare the prompt for LLM
            const prompt = `Please review the following code based on these coding conventions:
                            ${
                              codingConvention ||
                              "Standard coding best practices"
                            }

                            Code to review:
                            \`\`\`${document.languageId}
                            ${text}
                            \`\`\`

                            Please provide a detailed review including:
                            1. Code quality assessment
                            2. Potential improvements
                            3. Security concerns (if any)
                            4. Performance considerations
                            5. Adherence to the specified coding conventions

                            Format your response in a clear, structured manner.`;

            const response = await callLLM(apiToken, prompt, endpoint, model);

            progress.report({ increment: 100 });

            // Show the review in a new document
            await showReviewResults(response, document.fileName);
          } catch (error) {
            vscode.window.showErrorMessage(
              `Review failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }
      );
    }
  );

  // Function to call LLM
  async function callLLM(
    apiToken: string,
    prompt: string,
    endpoint: string,
    model: string
  ): Promise<string> {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { response?: string };
        return data.response ?? "No response received from LLM";
      }
      const errorText = await response.text();
      throw new Error(
        `LLM API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
      );
    } catch (error) {
      throw new Error(
        `Failed to call LLM API: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Function to show review results in a new document
  async function showReviewResults(
    review: string,
    originalFileName: string
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      content: `# AI Code Review: ${originalFileName}

                ${review}

                ---
                *Review generated by AI Reviewer extension*`,
      language: "markdown",
    });

    await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
  }

  // Add command to show current settings
  const showSettingsDisposable = vscode.commands.registerCommand(
    "ai-reviewer.showSettings",
    () => {
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const apiToken = config.get<string>("apiToken", "");
      const codingConvention = config.get<string>("codingConvention", "");
      const llmEndpoint = config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      );
      const llmModel = config.get<string>("llmModel", "llama3");

      const message = `Current Settings:\nAPI Token: ${
        apiToken ? "***" + apiToken.slice(-4) : "Not set"
      }\nCoding Convention: ${
        codingConvention || "Not set"
      }\nLLM Endpoint: ${llmEndpoint}\nLLM Model: ${llmModel}`;
      vscode.window.showInformationMessage(message);
    }
  );

  // Add command to open settings panel
  const openSettingsPanelDisposable = vscode.commands.registerCommand(
    "ai-reviewer.openSettingsPanel",
    () => {
      vscode.commands.executeCommand("ai-reviewer-settings.focus");
    }
  );

  // Function to get configuration values
  function getConfiguration() {
    const config = vscode.workspace.getConfiguration("aiReviewer");
    return {
      apiToken: config.get<string>("apiToken", ""),
      codingConvention: config.get<string>("codingConvention", ""),
      llmEndpoint: config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      ),
      llmModel: config.get<string>("llmModel", "llama3"),
    };
  }

  // Listen for configuration changes
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("aiReviewer")) {
        const newConfig = getConfiguration();
        console.log("AI Reviewer configuration updated:", {
          apiToken: newConfig.apiToken
            ? "***" + newConfig.apiToken.slice(-4)
            : "Not set",
          codingConvention: newConfig.codingConvention || "Not set",
          llmEndpoint: newConfig.llmEndpoint,
          llmModel: newConfig.llmModel,
        });
      }
    }
  );

  context.subscriptions.push(
    disposable,
    showSettingsDisposable,
    openSettingsPanelDisposable,
    configChangeDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
