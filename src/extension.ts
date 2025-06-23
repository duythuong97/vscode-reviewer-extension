// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { marked } from "marked";
import { logDebug, getDebugOutputChannel } from "./helper";
import { callLLM } from "./llmProvider";
import { SettingsPanelProvider } from "./settingsPanelProvider";
import { ChatPanelProvider } from "./chatPanelProvider";
import { HistoryPanelProvider } from "./historyPanelProvider";
import { AnalyticsPanelProvider } from "./analyticsPanelProvider";
import { TemplatesPanelProvider } from "./templatesPanelProvider";
import { SecondarySidebarManager } from "./secondarySidebarManager";
import { GitHelper } from "./gitHelper";

export const debugOutputChannel = getDebugOutputChannel();

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

  // Register the chat panel provider
  const chatPanelProvider = new ChatPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatPanelProvider.viewType,
      chatPanelProvider
    )
  );

  // Register the history panel provider
  const historyPanelProvider = new HistoryPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      HistoryPanelProvider.viewType,
      historyPanelProvider
    )
  );

  // Register the analytics panel provider
  const analyticsPanelProvider = new AnalyticsPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AnalyticsPanelProvider.viewType,
      analyticsPanelProvider
    )
  );

  // Register the templates panel provider
  const templatesPanelProvider = new TemplatesPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TemplatesPanelProvider.viewType,
      templatesPanelProvider
    )
  );

  // Initialize secondary sidebar manager
  const sidebarManager = SecondarySidebarManager.getInstance();
  sidebarManager.loadData();

  // Set up message handling for secondary sidebar providers
  setupSecondarySidebarMessageHandling(historyPanelProvider, analyticsPanelProvider, templatesPanelProvider, sidebarManager);

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

            // Debug: Log the prompt to console
            logDebug(
              debugOutputChannel,
              "=== AI Reviewer Code Review - Prompt Debug ===",
              {
                file: document.fileName,
                language: document.languageId,
                codingConvention:
                  codingConvention || "Standard coding best practices",
                promptLength: prompt.length,
              }
            );

            const response: string = await callLLM(
              apiToken,
              prompt,
              endpoint,
              model
            );

            progress.report({ increment: 100 });

            // Convert markdown response to HTML for better display
            const htmlResponse: string = await marked(response);

            // Add to review history
            await addReviewToHistory(document.fileName, 'warning', { response: htmlResponse });

            // Show the review in a new document
            await showReviewResults(htmlResponse, document.fileName);
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

  // Add new command for AI review and suggestion
  const reviewAndSuggestDisposable = vscode.commands.registerCommand(
    "ai-reviewer.reviewAndSuggest",
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
          title: `AI Reviewer: Analyzing code conventions with model ${model}... `,
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ increment: 0 });

            // Prepare the prompt for LLM to check conventions and suggest fixes
            const codeWithLineNumbers = text
              .split("\n")
              .map((line, index) => `${index + 1}: ${line}`)
              .join("\n");

            const prompt = `Please analyze the following code for convention violations and provide specific suggestions with line numbers and corrected code.

Coding conventions to check:
${
  codingConvention ||
  "Standard coding best practices including naming conventions, formatting, and code structure"
}

Code to analyze (with line numbers):
${codeWithLineNumbers}

IMPORTANT: For the "suggestion" field, provide ONLY the corrected code line that should replace the current line. Do NOT include descriptive text like "Replace X with Y" or "Change this to that".

Please provide your response in the following JSON format:
{
  "violations": [
    {
      "line": <line_number>,
      "message": "<description of the violation>",
      "suggestion": "<ONLY the corrected code line, no descriptive text>",
      "severity": "<low|medium|high>"
    }
  ],
  "summary": "<overall summary of findings>"
}

Examples of correct suggestions:
- If line 5 has "var x = 1;", suggestion should be "const x = 1;" (not "Replace var with const")
- If line 10 has "if(x==y)", suggestion should be "if (x === y) {" (not "Use === instead of ==")
- If line 15 has "function badName()", suggestion should be "function goodName()" (not "Rename function")

Focus on:
1. Naming conventions
2. Code formatting
3. Code structure and organization
4. Best practices for ${document.languageId}
5. Any obvious improvements

If no violations are found, return an empty violations array.`;

            const response: string = await callLLM(
              apiToken,
              prompt,
              endpoint,
              model
            );

            progress.report({ increment: 100 });

            // Parse the response and show suggestions
            await showConventionSuggestions(response, editor, document);
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

  // Add new command for AI review PR (git diff)
  const reviewPRDisposable = vscode.commands.registerCommand(
    "ai-reviewer.reviewPR",
    async () => {
      // Get configuration settings
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const apiToken = config.get<string>("apiToken", "");
      const codingConvention = config.get<string>("codingConvention", "");

      const endpoint = config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      );
      const model = config.get<string>("llmModel", "llama3");
      const baseBranch = config.get<string>("baseBranch", "main");

      if (!apiToken) {
        vscode.window.showErrorMessage(
          "API token not configured. Please set it in the AI Reviewer settings."
        );
        return;
      }

      // Check if we're in a git repository
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found!");
        return;
      }

      // Show progress notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `AI Reviewer: Analyzing PR changes with model ${model}... `,
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ increment: 0, message: "Getting git diff..." });

            // Get the current branch
            const currentBranch = await GitHelper.getCurrentBranch(
              workspaceFolder.uri.fsPath
            );

            if (!currentBranch) {
              vscode.window.showErrorMessage(
                "Could not determine current branch. Make sure you're in a git repository."
              );
              return;
            }

            // Verify the base branch exists
            if (
              !(await GitHelper.branchExists(
                workspaceFolder.uri.fsPath,
                baseBranch
              ))
            ) {
              vscode.window.showErrorMessage(
                `Base branch '${baseBranch}' does not exist. Please check your configuration.`
              );
              return;
            }

            progress.report({
              increment: 20,
              message: "Getting changed files...",
            });

            // Get the list of changed files
            const changedFiles = await GitHelper.getChangedFiles(
              workspaceFolder.uri.fsPath,
              baseBranch
            );

            if (changedFiles.length === 0) {
              vscode.window.showInformationMessage(
                "No changed files found compared to the base branch."
              );
              return;
            }

            progress.report({
              increment: 30,
              message: `Found ${changedFiles.length} changed files. Starting review...`,
            });

            // Review each changed file
            const allReviews: any[] = [];
            const incrementPerFile = 50 / changedFiles.length;

            for (const file of changedFiles) {
              progress.report({
                increment: incrementPerFile,
                message: `Reviewing ${file.name}...`,
              });

              try {
                const review = await reviewChangedFile(
                  file,
                  workspaceFolder.uri.fsPath,
                  baseBranch,
                  apiToken,
                  endpoint,
                  model,
                  codingConvention
                );
                allReviews.push(review);
              } catch (error) {
                logDebug(
                  debugOutputChannel,
                  `Error reviewing ${file.name}`,
                  error
                );
                allReviews.push({
                  fileName: file.name,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
            }

            progress.report({
              increment: 100,
              message: "Generating summary...",
            });

            // Show the comprehensive review results
            await showPRReviewResults(allReviews, currentBranch, baseBranch);
          } catch (error) {
            vscode.window.showErrorMessage(
              `PR Review failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }
      );
    }
  );

  // Helper function to review a single changed file
  async function reviewChangedFile(
    file: { name: string; path: string },
    repoPath: string,
    baseBranch: string,
    apiToken: string,
    endpoint: string,
    model: string,
    codingConvention: string
  ): Promise<any> {
    try {
      const { execSync } = require("child_process");

      // Get the diff for this specific file
      const diff = execSync(`git diff ${baseBranch} -- "${file.path}"`, {
        cwd: repoPath,
        encoding: "utf8",
      });

      if (!diff.trim()) {
        return {
          fileName: file.name,
          filePath: file.path,
          status: "no_changes",
          message: "No changes detected in this file",
        };
      }

      // Get the current content of the file
      let currentContent = "";
      try {
        currentContent = execSync(`git show HEAD:"${file.path}"`, {
          cwd: repoPath,
          encoding: "utf8",
        });
      } catch {
        // File might be new, try to read it directly
        const fs = require("fs");
        const fullPath = require("path").join(repoPath, file.path);
        if (fs.existsSync(fullPath)) {
          currentContent = fs.readFileSync(fullPath, "utf8");
        }
      }

      // Prepare the prompt for LLM
      const prompt = `Please review the following code changes for convention violations and provide specific suggestions.

Coding conventions to check:
${
  codingConvention ||
  "Standard coding best practices including naming conventions, formatting, and code structure"
}

File: ${file.name}
Git diff:
\`\`\`diff
${diff}
\`\`\`

Current file content (with line numbers):
${currentContent
  .split("\n")
  .map((line, index) => `${index + 1}: ${line}`)
  .join("\n")}

Please provide your response in the following JSON format:
{
  "violations": [
    {
      "line": <line_number>,
      "message": "<description of the violation>",
      "suggestion": "<ONLY the corrected code line, no descriptive text>",
      "severity": "<low|medium|high>"
    }
  ],
  "summary": "<overall summary of findings for this file>",
  "fileStatus": "<new|modified|deleted>"
}

Focus on:
1. Naming conventions
2. Code formatting
3. Code structure and organization
4. Best practices for the file type
5. Any obvious improvements in the changes

If no violations are found, return an empty violations array.`;

      const response = await callLLM(apiToken, prompt, endpoint, model);

      // Parse the response
      let parsedResponse;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        console.error(parseError);
        return {
          fileName: file.name,
          filePath: file.path,
          status: "parse_error",
          message: "Could not parse AI response",
          rawResponse: response,
        };
      }

      return {
        fileName: file.name,
        filePath: file.path,
        status: "reviewed",
        violations: parsedResponse.violations || [],
        summary: parsedResponse.summary || "No specific violations found.",
        fileStatus: parsedResponse.fileStatus || "modified",
      };
    } catch (error) {
      return {
        fileName: file.name,
        filePath: file.path,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Helper function to show PR review results
  async function showPRReviewResults(
    reviews: any[],
    currentBranch: string,
    baseBranch: string
  ): Promise<void> {
    const successfulReviews = reviews.filter((r) => r.status === "reviewed");
    const errorReviews = reviews.filter((r) => r.status === "error");
    const parseErrorReviews = reviews.filter((r) => r.status === "parse_error");

    let totalViolations = 0;
    successfulReviews.forEach((review) => {
      totalViolations += review.violations.length;
    });

    const content = `# AI Code Review: PR Analysis

## Branch Information
- **Current Branch:** ${currentBranch}
- **Base Branch:** ${baseBranch}
- **Files Reviewed:** ${reviews.length}
- **Total Violations Found:** ${totalViolations}

## Summary
- ✅ Successfully reviewed: ${successfulReviews.length} files
- ❌ Errors: ${errorReviews.length} files
- ⚠️ Parse errors: ${parseErrorReviews.length} files

## Detailed Reviews

${reviews
  .map((review) => {
    if (review.status === "reviewed") {
      return `### ${review.fileName}
**Status:** ${review.fileStatus}
**Violations:** ${review.violations.length}
**Summary:** ${review.summary}

${
  review.violations.length > 0
    ? `
**Violations:**
${review.violations
  .map((v: any) => `- Line ${v.line}: ${v.message} (${v.severity})`)
  .join("\n")}
`
    : "No violations found."
}
`;
    } else if (review.status === "error") {
      return `### ${review.fileName}
**Status:** ❌ Error
**Error:** ${review.error}
`;
    } else if (review.status === "parse_error") {
      return `### ${review.fileName}
**Status:** ⚠️ Parse Error
**Message:** ${review.message}
`;
    } else {
      return `### ${review.fileName}
**Status:** ${review.status}
**Message:** ${review.message}
`;
    }
  })
  .join("\n\n")}

---
*Review generated by AI Reviewer extension*`;

    const document = await vscode.workspace.openTextDocument({
      content,
      language: "markdown",
    });

    await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
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

  // Function to show convention suggestions in a popup
  async function showConventionSuggestions(
    response: string,
    editor: vscode.TextEditor,
    document: vscode.TextDocument
  ): Promise<void> {
    try {
      // Try to parse the JSON response
      let parsedResponse;
      try {
        // Extract JSON from the response (in case LLM adds extra text)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        // If parsing fails, show the raw response
        vscode.window.showInformationMessage(
          "Could not parse AI response. Showing raw response:"
        );
        await showReviewResults(response, document.fileName);
        return;
      }

      const violations = parsedResponse.violations || [];
      const summary = parsedResponse.summary || "No specific violations found.";

      // Clean up suggestions to ensure they contain only corrected code
      const cleanedViolations = violations.map((violation: any) => ({
        ...violation,
        suggestion: cleanSuggestion(
          violation.suggestion,
          violation.line,
          editor.document
        ),
      }));

      if (cleanedViolations.length === 0) {
        vscode.window.showInformationMessage(
          `✅ No convention violations found!\n\n${summary}`
        );
        return;
      }

      // Get the display mode from configuration
      const config = vscode.workspace.getConfiguration("aiReviewer");
      const displayMode = config.get<string>("suggestionDisplayMode", "panel");

      if (displayMode === "inline") {
        await showInlineSuggestions(
          cleanedViolations,
          summary,
          editor,
          document
        );
      } else {
        await showPanelSuggestions(
          cleanedViolations,
          summary,
          editor,
          document
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to show suggestions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Function to clean up suggestions and extract only the corrected code
  function cleanSuggestion(
    suggestion: string,
    lineNumber: number,
    document: vscode.TextDocument
  ): string {
    try {
      // Get the original line content
      const originalLine = document.lineAt(lineNumber - 1).text;

      // If suggestion looks like descriptive text, try to extract the actual code
      if (
        suggestion.includes("Replace") ||
        suggestion.includes("Change") ||
        suggestion.includes("Use")
      ) {
        // Look for code patterns in the suggestion
        const codePatterns = [
          /`([^`]+)`/g, // Code in backticks
          /"([^"]+)"/g, // Code in quotes
          /'([^']+)'/g, // Code in single quotes
          /(\w+)/g, // Any word (fallback)
        ];

        for (const pattern of codePatterns) {
          const matches = suggestion.match(pattern);
          if (matches && matches.length > 0) {
            // Try to find the most likely corrected code
            const potentialCode = matches[matches.length - 1]; // Usually the last match is the corrected code
            if (potentialCode && potentialCode.length > 2) {
              // Avoid very short matches
              return potentialCode;
            }
          }
        }
      }

      // If no patterns found, return the original suggestion
      return suggestion;
    } catch (error) {
      // If any error occurs, return the original suggestion
      return suggestion;
    }
  }

  // Function to generate HTML for suggestions panel
  function generateSuggestionsHTML(
    violations: any[],
    summary: string,
    fileName: string
  ): string {
    const violationsHtml = violations
      .map(
        (violation, index) => `
        <div class="violation" data-line="${violation.line}" data-suggestion="${
          violation.suggestion
        }">
          <div class="violation-header">
            <span class="line-number">Line ${violation.line}</span>
            <span class="severity severity-${violation.severity}">${
          violation.severity
        }</span>
          </div>
          <div class="violation-message">${violation.message}</div>
          <div class="suggestion">
            <strong>Suggestion:</strong>
            <pre><code>${violation.suggestion}</code></pre>
          </div>
          <button class="apply-btn" onclick="applySuggestion(${
            violation.line
          }, '${violation.suggestion.replace(/'/g, "\\'")}')">
            Apply This Suggestion
          </button>
        </div>
      `
      )
      .join("");

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Code Review Suggestions</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                margin: 0;
            }
            .header {
                border-bottom: 1px solid var(--vscode-input-border);
                padding-bottom: 15px;
                margin-bottom: 20px;
            }
            .file-name {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .summary {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                margin-bottom: 20px;
            }
            .violation {
                border: 1px solid var(--vscode-input-border);
                border-radius: 6px;
                margin-bottom: 15px;
                padding: 15px;
                background-color: var(--vscode-input-background);
            }
            .violation-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .line-number {
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
            }
            .severity {
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .severity-high {
                background-color: var(--vscode-errorForeground);
                color: var(--vscode-errorBackground);
            }
            .severity-medium {
                background-color: var(--vscode-warningForeground);
                color: var(--vscode-warningBackground);
            }
            .severity-low {
                background-color: var(--vscode-infoBar-background);
                color: var(--vscode-infoBar-foreground);
            }
            .violation-message {
                margin-bottom: 10px;
                color: var(--vscode-foreground);
            }
            .suggestion {
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 10px;
                margin-bottom: 10px;
            }
            .suggestion pre {
                margin: 0;
                white-space: pre-wrap;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }
            .apply-btn {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            .apply-btn:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .apply-all-btn {
                background-color: var(--vscode-button-prominentBackground);
                color: var(--vscode-button-prominentForeground);
                border: none;
                padding: 12px 24px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                margin-top: 20px;
                width: 100%;
            }
            .apply-all-btn:hover {
                background-color: var(--vscode-button-prominentHoverBackground);
            }
            .no-violations {
                text-align: center;
                padding: 40px;
                color: var(--vscode-descriptionForeground);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="file-name">${fileName}</div>
            <div class="summary">${summary}</div>
        </div>

        ${
          violations.length > 0
            ? `
            <div class="violations">
                ${violationsHtml}
            </div>
            <button class="apply-all-btn" onclick="applyAllSuggestions()">
                Apply All Suggestions
            </button>
        `
            : `
            <div class="no-violations">
                <h3>✅ No convention violations found!</h3>
                <p>Your code follows the specified conventions well.</p>
            </div>
        `
        }

        <script>
            const vscode = acquireVsCodeApi();

            function applySuggestion(line, suggestion) {
                vscode.postMessage({
                    type: 'applySuggestion',
                    line: parseInt(line),
                    suggestion: suggestion
                });
            }

            function applyAllSuggestions() {
                vscode.postMessage({
                    type: 'applyAllSuggestions'
                });
            }
        </script>
    </body>
    </html>`;
  }

  // Function to apply a single suggestion
  async function applySuggestion(
    editor: vscode.TextEditor,
    lineNumber: number,
    suggestion: string
  ): Promise<void> {
    try {
      const line = editor.document.lineAt(lineNumber - 1); // Convert to 0-based index
      const range = new vscode.Range(line.range.start, line.range.end);

      await editor.edit((editBuilder) => {
        editBuilder.replace(range, suggestion);
      });

      vscode.window.showInformationMessage(
        `Applied suggestion for line ${lineNumber}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to apply suggestion: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Function to apply all suggestions
  async function applyAllSuggestions(
    editor: vscode.TextEditor,
    violations: any[]
  ): Promise<void> {
    try {
      // Sort violations by line number in descending order to avoid line number shifts
      const sortedViolations = [...violations].sort((a, b) => b.line - a.line);

      await editor.edit((editBuilder) => {
        for (const violation of sortedViolations) {
          const line = editor.document.lineAt(violation.line - 1);
          const range = new vscode.Range(line.range.start, line.range.end);
          editBuilder.replace(range, violation.suggestion);
        }
      });

      vscode.window.showInformationMessage(
        `Applied ${violations.length} suggestions successfully!`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to apply suggestions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Function to show suggestions in a separate panel (original behavior)
  async function showPanelSuggestions(
    violations: any[],
    summary: string,
    editor: vscode.TextEditor,
    document: vscode.TextDocument
  ): Promise<void> {
    // Create a webview panel to show suggestions
    const panel = vscode.window.createWebviewPanel(
      "aiReviewSuggestions",
      "AI Code Review Suggestions",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // Generate HTML content for the suggestions
    const htmlContent = generateSuggestionsHTML(
      violations,
      summary,
      document.fileName
    );
    panel.webview.html = htmlContent;

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "applySuggestion":
          await applySuggestion(editor, message.line, message.suggestion);
          break;
        case "applyAllSuggestions":
          await applyAllSuggestions(editor, violations);
          break;
        case "dismiss":
          panel.dispose();
          break;
      }
    });
  }

  // Function to show suggestions inline using VS Code diagnostics
  async function showInlineSuggestions(
    violations: any[],
    summary: string,
    editor: vscode.TextEditor,
    document: vscode.TextDocument
  ): Promise<void> {
    // Create a diagnostic collection for this document
    const diagnosticCollection = vscode.languages.createDiagnosticCollection(
      `ai-reviewer-${document.uri.toString()}`
    );

    // Convert violations to diagnostics
    const diagnostics: vscode.Diagnostic[] = violations.map((violation) => {
      const line = document.lineAt(violation.line - 1);
      const range = new vscode.Range(line.range.start, line.range.end);

      // Determine severity
      let severity: vscode.DiagnosticSeverity;
      switch (violation.severity?.toLowerCase()) {
        case "high":
          severity = vscode.DiagnosticSeverity.Error;
          break;
        case "medium":
          severity = vscode.DiagnosticSeverity.Warning;
          break;
        case "low":
        default:
          severity = vscode.DiagnosticSeverity.Information;
          break;
      }

      // Create diagnostic message with suggestion
      const message = `${violation.message}\n\nSuggestion: ${violation.suggestion}`;

      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostic.source = "AI Reviewer";

      return diagnostic;
    });

    // Set diagnostics for the document
    diagnosticCollection.set(document.uri, diagnostics);

    // Show summary in information message
    vscode.window
      .showInformationMessage(
        `AI Review Complete: ${violations.length} suggestions found. ${summary}`,
        "Apply All Suggestions"
      )
      .then((selection) => {
        if (selection === "Apply All Suggestions") {
          applyAllSuggestions(editor, violations);
          diagnosticCollection.dispose(); // Clear diagnostics after applying
        }
      });

    // Clean up diagnostics when document is closed or changed
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      vscode.workspace.onDidCloseTextDocument((closedDoc) => {
        if (closedDoc.uri.toString() === document.uri.toString()) {
          diagnosticCollection.dispose();
          disposables.forEach((d) => d.dispose());
        }
      })
    );

    disposables.push(
      vscode.workspace.onDidChangeTextDocument((changeEvent) => {
        if (changeEvent.document.uri.toString() === document.uri.toString()) {
          // Clear diagnostics when document is modified
          diagnosticCollection.clear();
          disposables.forEach((d) => d.dispose());
        }
      })
    );
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
      const suggestionDisplayMode = config.get<string>(
        "suggestionDisplayMode",
        "panel"
      );
      const baseBranch = config.get<string>("baseBranch", "main");

      const message = `Current Settings:\nAPI Token: ${
        apiToken ? "***" + apiToken.slice(-4) : "Not set"
      }\nCoding Convention: ${
        codingConvention || "Not set"
      }\nLLM Endpoint: ${llmEndpoint}\nLLM Model: ${llmModel}\nSuggestion Display Mode: ${suggestionDisplayMode}\nBase Branch: ${baseBranch}`;

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
      suggestionDisplayMode: config.get<string>(
        "suggestionDisplayMode",
        "panel"
      ),
      baseBranch: config.get<string>("baseBranch", "main"),
      ghostTextEnabled: config.get<boolean>("ghostTextEnabled", true),
    };
  }

  // Ghost Text Provider for AI-powered code suggestions
  class GhostTextProvider implements vscode.InlineCompletionItemProvider {
    private _isEnabled: boolean = true;
    private _debounceTimer: NodeJS.Timeout | undefined;

    public setEnabled(enabled: boolean) {
      this._isEnabled = enabled;
    }

    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.InlineCompletionContext,
      token: vscode.CancellationToken
    ): Promise<
      vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined
    > {
      if (!this._isEnabled) {
        return undefined;
      }

      // Clear previous debounce timer
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
      }

      // Debounce the suggestions to avoid too many API calls
      return new Promise((resolve) => {
        this._debounceTimer = setTimeout(async () => {
          try {
            const suggestions = await this.generateSuggestions(
              document,
              position,
              context
            );
            resolve(suggestions);
          } catch (error) {
            logDebug(
              debugOutputChannel,
              "Error generating ghost text suggestions:",
              error
            );
            resolve(undefined);
          }
        }, 500); // 500ms debounce
      });
    }

    private async generateSuggestions(
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.InlineCompletionContext
    ): Promise<vscode.InlineCompletionItem[] | undefined> {
      const config = getConfiguration();

      if (!config.apiToken) {
        logDebug(debugOutputChannel, "Ghost text: No API token configured");
        return undefined;
      }

      // Get the current line and context
      const currentLine = document.lineAt(position.line);
      const lineText = currentLine.text;
      const cursorPosition = position.character;

      // More permissive condition - show suggestions when typing or at end of line
      if (cursorPosition < lineText.length && lineText.trim() === "") {
        logDebug(debugOutputChannel, "Ghost text: Skipping empty line");
        return undefined;
      }

      // Don't show suggestions if we're in the middle of a word (unless it's a function call)
      const currentWord =
        lineText.substring(0, cursorPosition).split(/\s+/).pop() || "";
      if (
        currentWord.length > 0 &&
        !currentWord.includes("(") &&
        !currentWord.includes("[") &&
        !currentWord.includes("{")
      ) {
        logDebug(
          debugOutputChannel,
          "Ghost text: In middle of word, skipping",
          {
            currentWord,
          }
        );
        return undefined;
      }

      // Get surrounding context (previous few lines)
      const contextLines = 5;
      const startLine = Math.max(0, position.line - contextLines);
      const contextText = [];

      for (let i = startLine; i < position.line; i++) {
        contextText.push(document.lineAt(i).text);
      }

      const contextString = contextText.join("\n");
      const currentLinePrefix = lineText.substring(0, cursorPosition);

      logDebug(debugOutputChannel, "Ghost text: Generating suggestion", {
        language: document.languageId,
        currentLine: currentLinePrefix,
        contextLines: contextText.length,
        cursorPosition: cursorPosition,
        lineLength: lineText.length,
      });

      // Create prompt for AI suggestion
      const prompt = this.createSuggestionPrompt(
        document.languageId,
        contextString,
        currentLinePrefix,
        config.codingConvention
      );

      try {
        const suggestion = await callLLM(
          config.apiToken,
          prompt,
          config.llmEndpoint,
          config.llmModel
        );

        logDebug(debugOutputChannel, "Ghost text: LLM response received", {
          originalSuggestion:
            suggestion?.substring(0, 100) +
            (suggestion && suggestion.length > 100 ? "..." : ""),
          suggestionLength: suggestion?.length || 0,
        });

        if (suggestion && suggestion.trim()) {
          // Clean and format the suggestion
          const cleanedSuggestion = this.cleanSuggestion(
            suggestion,
            currentLinePrefix
          );

          logDebug(debugOutputChannel, "Ghost text: Cleaned suggestion", {
            cleanedSuggestion: cleanedSuggestion,
            cleanedLength: cleanedSuggestion.length,
          });

          if (cleanedSuggestion) {
            // Ensure the suggestion is properly formatted for VS Code
            const finalSuggestion = cleanedSuggestion
              .replace(/\n/g, " ")
              .trim();

            if (finalSuggestion.length > 0) {
              const completionItem = new vscode.InlineCompletionItem(
                finalSuggestion,
                new vscode.Range(position, position)
              );

              // Don't add command - let VS Code handle Tab key naturally
              // This prevents double insertion

              logDebug(
                debugOutputChannel,
                "Ghost text: Returning completion item",
                {
                  suggestion: finalSuggestion,
                  position: position.toString(),
                  suggestionLength: finalSuggestion.length,
                }
              );

              return [completionItem];
            }
          }
        }
      } catch (error) {
        logDebug(
          debugOutputChannel,
          "Error calling LLM for ghost text:",
          error
        );
      }

      return undefined;
    }

    private createSuggestionPrompt(
      languageId: string,
      context: string,
      currentLine: string,
      codingConvention: string
    ): string {
      return `You are an AI code assistant. Complete the current line of code based on the context.

Language: ${languageId}
Coding Convention: ${codingConvention}

Previous context:
${context}

Current line (incomplete):
${currentLine}

Instructions:
1. Complete ONLY the current line - do not add new lines
2. Provide the most likely completion based on the context
3. If it's a function call, suggest the most appropriate parameters
4. If it's a variable assignment, suggest the most likely value
5. Keep it concise and relevant
6. If the line appears complete or no suggestion is needed, respond with "NO_SUGGESTION"

Examples:
- If current line is "send_slack(config["slack_url"], " - suggest: "message)"
- If current line is "const user = " - suggest: "getUser()"
- If current line is "if (condition" - suggest: ") {"

IMPORTANT: Return ONLY the completion part, not the full line. For example, if the current line is "send_slack(config["slack_url"], " and you want to suggest "message)", return just "message)" not the full line.

DO NOT include any explanatory text, comments, or notes in your response. Return only the code completion.

Suggestion:`;
    }

    private cleanSuggestion(
      suggestion: string,
      currentLinePrefix: string
    ): string {
      // Remove any markdown formatting or extra text
      let cleaned = suggestion.trim();

      // Remove common prefixes that might be included
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      }

      // Remove "Suggestion:" prefix if present
      cleaned = cleaned.replace(/^suggestion:\s*/i, "");

      // If the suggestion starts with the current line prefix, remove it
      if (cleaned.toLowerCase().startsWith(currentLinePrefix.toLowerCase())) {
        cleaned = cleaned.substring(currentLinePrefix.length);
      }

      // Remove "NO_SUGGESTION" responses
      if (cleaned.toLowerCase().includes("no_suggestion")) {
        return "";
      }

      // Handle cases where the AI returns the full line with backticks
      if (cleaned.startsWith("`") && cleaned.endsWith("`")) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }

      // If the AI returned the full line, extract just the completion part
      if (cleaned.includes(currentLinePrefix)) {
        const prefixIndex = cleaned.indexOf(currentLinePrefix);
        if (prefixIndex >= 0) {
          cleaned = cleaned.substring(prefixIndex + currentLinePrefix.length);
        }
      }

      // Clean up any remaining quotes or formatting
      cleaned = cleaned.replace(/^["']|["']$/g, "");

      // Remove explanatory text in parentheses (like "Note: assuming that...")
      cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/g, "");

      // Remove any trailing comments or explanations
      cleaned = cleaned.replace(/\s*\/\/.*$/g, "");
      cleaned = cleaned.replace(/\s*#.*$/g, "");

      // Remove any trailing text after the main suggestion
      const lines = cleaned.split("\n");
      if (lines.length > 1) {
        cleaned = lines[0]; // Take only the first line
      }

      logDebug(debugOutputChannel, "Ghost text: Suggestion cleaning", {
        original: suggestion,
        currentLinePrefix: currentLinePrefix,
        cleaned: cleaned,
      });

      return cleaned.trim();
    }
  }

  // Create and register the ghost text provider
  const ghostTextProvider = new GhostTextProvider();
  const config = getConfiguration();
  ghostTextProvider.setEnabled(config.ghostTextEnabled);

  const ghostTextDisposable =
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" }, // Register for all file types
      ghostTextProvider
    );

  // Add command to accept ghost suggestions
  const acceptGhostSuggestionDisposable = vscode.commands.registerCommand(
    "ai-reviewer.acceptGhostSuggestion",
    (suggestion: string) => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const position = editor.selection.active;
        // Don't insert here - let VS Code handle the Tab key naturally
        logDebug(debugOutputChannel, "Ghost text: Accept command triggered", {
          suggestion,
        });
      }
    }
  );

  // Add command to toggle ghost text
  const toggleGhostTextDisposable = vscode.commands.registerCommand(
    "ai-reviewer.toggleGhostText",
    async () => {
      const currentState = ghostTextProvider["_isEnabled"];
      const newState = !currentState;
      ghostTextProvider.setEnabled(newState);

      // Update the configuration
      const workspaceConfig = vscode.workspace.getConfiguration("aiReviewer");
      await workspaceConfig.update(
        "ghostTextEnabled",
        newState,
        vscode.ConfigurationTarget.Global
      );

      vscode.window.showInformationMessage(
        `AI Ghost Text ${newState ? "enabled" : "disabled"}`
      );
    }
  );

  // Add command to test ghost text
  const testGhostTextDisposable = vscode.commands.registerCommand(
    "ai-reviewer.testGhostText",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const position = editor.selection.active;
      const document = editor.document;

      logDebug(debugOutputChannel, "Testing ghost text at position", {
        position: position.toString(),
        currentLine: document.lineAt(position.line).text,
        language: document.languageId,
      });

      try {
        const suggestions = await ghostTextProvider["generateSuggestions"](
          document,
          position,
          {
            triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
            selectedCompletionInfo: undefined,
          }
        );

        if (suggestions && suggestions.length > 0) {
          vscode.window.showInformationMessage(
            `Ghost text suggestion: "${suggestions[0].insertText}"`
          );
        } else {
          vscode.window.showInformationMessage(
            "No ghost text suggestions generated"
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Ghost text test failed: ${error}`);
        logDebug(debugOutputChannel, "Ghost text test error:", error);
      }
    }
  );

  // Add command to open AI prompt popup and write response to editor
  const aiPromptPopupDisposable = vscode.commands.registerCommand(
    "ai-reviewer.aiPromptPopup",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const config = getConfiguration();
      if (!config.apiToken) {
        vscode.window.showErrorMessage(
          "API token not configured. Please set it in AI Reviewer settings."
        );
        return;
      }

      // Get selected text for context
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      // Show floating popup at cursor position
      await showFloatingPopup(editor, selectedText, config);
    }
  );

  // Function to show floating popup at cursor position
  async function showFloatingPopup(
    editor: vscode.TextEditor,
    selectedText: string,
    config: any
  ): Promise<void> {
    const document = editor.document;
    const position = editor.selection.active;

    // Show quick pick for prompt type or custom input
    const promptOptions = [
      {
        label: "$(comment-discussion) Explain this code",
        value: "Explain this code",
      },
      { label: "$(lightbulb) Optimize this code", value: "Optimize this code" },
      { label: "$(note) Add comments", value: "Add comments" },
      { label: "$(bug) Fix bugs", value: "Fix bugs" },
      { label: "$(refresh) Refactor this code", value: "Refactor this code" },
      { label: "$(testing) Write tests", value: "Write tests for this code" },
      { label: "$(pencil) Custom prompt...", value: "custom" },
    ];

    const contextInfo = selectedText
      ? `Selected ${selectedText.split("\n").length} lines of ${
          document.languageId
        } code`
      : "No code selected";

    const selectedPrompt = await vscode.window.showQuickPick(promptOptions, {
      placeHolder: `🤖 AI Assistant - ${contextInfo}`,
      title: "Choose AI action or enter custom prompt",
    });

    if (!selectedPrompt) {
      return; // User cancelled
    }

    let prompt = selectedPrompt.value;

    // If custom prompt selected, show input box
    if (prompt === "custom") {
      const customPrompt = await vscode.window.showInputBox({
        placeHolder: "Enter your custom prompt...",
        prompt: "What would you like to ask the AI?",
        value: "",
        ignoreFocusOut: true,
      });

      if (!customPrompt) {
        return; // User cancelled
      }
      prompt = customPrompt;
    }

    // Show progress notification with cancellation support
    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: "🤖 AI is thinking...",
      cancellable: true,
    };

    try {
      // Create full prompt with context
      let fullPrompt = prompt;
      if (selectedText) {
        fullPrompt = `Context (selected code):\n\`\`\`${document.languageId}\n${selectedText}\n\`\`\`\n\nUser request: ${prompt}`;
      }

      logDebug(debugOutputChannel, "AI Prompt Popup: Sending request", {
        prompt: prompt,
        hasSelectedText: !!selectedText,
        language: document.languageId,
      });

      const response = await vscode.window.withProgress(
        progressOptions,
        async (progress, cancellationToken) => {
          progress.report({ increment: 0, message: "Preparing request..." });

          // Check for cancellation before starting
          if (cancellationToken.isCancellationRequested) {
            throw new Error("Request cancelled by user");
          }

          progress.report({ increment: 25, message: "Sending to AI..." });

          try {
            const aiResponse = await vscode.window.withProgress(
              progressOptions,
              async (progress, cancellationToken) => {
                progress.report({ increment: 0, message: "Sending to AI..." });

                try {
                  const response = await callLLMWithCancellation(
                    config.apiToken,
                    fullPrompt,
                    config.llmEndpoint,
                    config.llmModel,
                    cancellationToken
                  );
                  progress.report({ increment: 100, message: "Response received!" });
                  return response;
                } catch (error) {
                  if (cancellationToken.isCancellationRequested) {
                    throw new Error("Request cancelled by user");
                  }
                  throw error;
                }
              }
            );

            if (aiResponse && aiResponse.trim()) {
              // Show response in a floating popup with actions
              await showResponsePopup(aiResponse.trim(), editor);
            } else {
              vscode.window.showWarningMessage("No response received from AI");
            }
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === "Request cancelled by user"
            ) {
              vscode.window.showInformationMessage("AI request cancelled");
            } else {
              vscode.window.showErrorMessage(`Failed to get AI response: ${error}`);
              logDebug(debugOutputChannel, "AI Prompt Popup: Error", error);
            }
          }
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Request cancelled by user"
      ) {
        vscode.window.showInformationMessage("AI request cancelled");
      } else {
        vscode.window.showErrorMessage(`Failed to get AI response: ${error}`);
        logDebug(debugOutputChannel, "AI Prompt Popup: Error", error);
      }
    }
  }

  // Function to call LLM with cancellation support
  async function callLLMWithCancellation(
    apiToken: string,
    prompt: string,
    endpoint: string,
    model: string,
    cancellationToken: vscode.CancellationToken
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create AbortController for fetch cancellation
      const abortController = new AbortController();

      // Listen for cancellation
      const cancellationListener = cancellationToken.onCancellationRequested(
        () => {
          abortController.abort();
          reject(new Error("Request cancelled by user"));
        }
      );

      // Prepare the request body
      const requestBody = {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        },
      };

      // Make the API request
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiToken && { Authorization: `Bearer ${apiToken}` }),
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      })
        .then(async (response) => {
          // Clean up cancellation listener
          cancellationListener.dispose();

          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status} - ${response.statusText}`
            );
          }

          const data = (await response.json()) as any;

          if (data.error) {
            throw new Error(`API error: ${data.error}`);
          }

          if (!data.response) {
            throw new Error("No response received from LLM");
          }

          resolve(data.response);
        })
        .catch((error) => {
          // Clean up cancellation listener
          cancellationListener.dispose();

          if (error.name === "AbortError") {
            reject(new Error("Request cancelled by user"));
          } else {
            reject(error);
          }
        });
    });
  }

  // Function to show response in a floating popup
  async function showResponsePopup(
    response: string,
    editor: vscode.TextEditor
  ): Promise<void> {
    const actions = [
      { label: "$(insert) Insert code only", value: "insert" },
      { label: "$(copy) Copy to clipboard", value: "copy" },
      { label: "$(eye) View full response", value: "view" },
      { label: "$(close) Close", value: "close" },
    ];

    const selection = await vscode.window.showQuickPick(actions, {
      placeHolder: "AI Response Ready - Choose action:",
      title: "🤖 AI Response",
      ignoreFocusOut: true,
    });

    if (!selection) {
      return; // User cancelled
    }

    switch (selection.value) {
      case "insert":
        try {
          const editorSelection = editor.selection;

          // Extract only code blocks from the response
          const codeBlocks = extractCodeBlocks(response);

          if (codeBlocks.length === 0) {
            vscode.window.showWarningMessage(
              "No code blocks found in AI response. Inserting full response instead."
            );
            // Insert the full response if no code blocks found
            await insertText(editor, editorSelection, response);
          } else if (codeBlocks.length === 1) {
            // Single code block - insert it directly
            await insertText(editor, editorSelection, codeBlocks[0]);
            vscode.window.showInformationMessage(
              "Code block inserted successfully!"
            );
          } else {
            // Multiple code blocks - let user choose
            const codeBlockOptions = codeBlocks.map((block, index) => ({
              label: `$(code) Code Block ${index + 1}`,
              description: `${block.split("\n").length} lines`,
              value: block,
            }));

            const selectedBlock = await vscode.window.showQuickPick(
              codeBlockOptions,
              {
                placeHolder:
                  "Multiple code blocks found - choose one to insert:",
                title: "🤖 Select Code Block",
                ignoreFocusOut: true,
              }
            );

            if (selectedBlock) {
              await insertText(editor, editorSelection, selectedBlock.value);
              vscode.window.showInformationMessage(
                "Selected code block inserted successfully!"
              );
            }
          }

          logDebug(debugOutputChannel, "AI Prompt Popup: Code block inserted", {
            responseLength: response.length,
            codeBlocksFound: codeBlocks.length,
            position: editorSelection.active.toString(),
          });
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to insert code: ${error}`);
        }
        break;

      case "copy":
        try {
          // Extract code blocks for copying too
          const codeBlocks = extractCodeBlocks(response);
          const textToCopy =
            codeBlocks.length > 0 ? codeBlocks.join("\n\n") : response;
          await vscode.env.clipboard.writeText(textToCopy);
          vscode.window.showInformationMessage(
            codeBlocks.length > 0
              ? `Code blocks copied to clipboard! (${codeBlocks.length} blocks)`
              : "Response copied to clipboard!"
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to copy response: ${error}`);
        }
        break;

      case "view":
        // Show full response in a new document
        await showReviewResults(response, editor.document.fileName);
        break;

      case "close":
        // Do nothing, just close
        break;
    }
  }

  // Function to extract code blocks from AI response
  function extractCodeBlocks(response: string): string[] {
    const codeBlocks: string[] = [];

    // Match code blocks with language specification: ```language\n...\n```
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(response)) !== null) {
      const language = match[1] || "";
      const code = match[2].trim();

      // Only include non-empty code blocks
      if (code.length > 0) {
        codeBlocks.push(code);
      }
    }

    // If no code blocks found, try to find inline code with single backticks
    if (codeBlocks.length === 0) {
      const inlineCodeRegex = /`([^`]+)`/g;
      while ((match = inlineCodeRegex.exec(response)) !== null) {
        const code = match[1].trim();
        if (code.length > 0 && !code.includes(" ") && code.length > 3) {
          // Only include single words/phrases that look like code
          codeBlocks.push(code);
        }
      }
    }

    return codeBlocks;
  }

  // Helper function to insert text at cursor or replace selection
  async function insertText(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    text: string
  ): Promise<void> {
    await editor.edit((editBuilder) => {
      if (selection.isEmpty) {
        // Insert at cursor position
        editBuilder.insert(selection.active, text);
      } else {
        // Replace selected text
        editBuilder.replace(selection, text);
      }
    });
  }

  // Add command to show debug output
  const showDebugOutputDisposable = vscode.commands.registerCommand(
    "ai-reviewer.showDebugOutput",
    () => {
      if (debugOutputChannel) {
        debugOutputChannel.show();
      }
    }
  );

  // Listen for configuration changes
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("aiReviewer")) {
        const newConfig = getConfiguration();
        logDebug(debugOutputChannel, "AI Reviewer configuration updated", {
          apiToken: newConfig.apiToken
            ? "***" + newConfig.apiToken.slice(-4)
            : "Not set",
          codingConvention: newConfig.codingConvention || "Not set",
          llmEndpoint: newConfig.llmEndpoint,
          llmModel: newConfig.llmModel,
          suggestionDisplayMode: newConfig.suggestionDisplayMode,
          baseBranch: newConfig.baseBranch,
          ghostTextEnabled: newConfig.ghostTextEnabled,
        });

        // Update ghost text provider if the setting changed
        if (event.affectsConfiguration("aiReviewer.ghostTextEnabled")) {
          ghostTextProvider.setEnabled(newConfig.ghostTextEnabled);
        }
      }
    }
  );

  // Set up message handling for secondary sidebar providers
  function setupSecondarySidebarMessageHandling(
    historyProvider: HistoryPanelProvider,
    analyticsProvider: AnalyticsPanelProvider,
    templatesProvider: TemplatesPanelProvider,
    manager: SecondarySidebarManager
  ) {
    // History panel message handling
    historyProvider.onDidReceiveMessage = (message) => {
      switch (message.command) {
        case 'getHistory':
          const history = manager.getReviewHistory();
          historyProvider.webviewView?.webview.postMessage({
            command: 'updateHistory',
            history: history
          });
          break;
        case 'viewReview':
          const review = manager.getReviewById(message.id);
          if (review) {
            vscode.window.showInformationMessage(`Viewing review: ${review.fileName}`);
            // You could open the review in a new editor or panel here
          }
          break;
        case 'reapplyReview':
          const reviewToReapply = manager.getReviewById(message.id);
          if (reviewToReapply) {
            vscode.window.showInformationMessage(`Reapplying review: ${reviewToReapply.fileName}`);
            // You could reapply the review suggestions here
          }
          break;
      }
    };

    // Analytics panel message handling
    analyticsProvider.onDidReceiveMessage = (message) => {
      switch (message.command) {
        case 'getAnalytics':
          const analytics = manager.getAnalytics();
          analyticsProvider.webviewView?.webview.postMessage({
            command: 'updateAnalytics',
            analytics: analytics
          });
          break;
        case 'refreshAnalytics':
          const refreshedAnalytics = manager.getAnalytics();
          analyticsProvider.webviewView?.webview.postMessage({
            command: 'updateAnalytics',
            analytics: refreshedAnalytics
          });
          break;
      }
    };

    // Templates panel message handling
    templatesProvider.onDidReceiveMessage = (message) => {
      switch (message.command) {
        case 'getTemplates':
          const templates = manager.getTemplates();
          templatesProvider.webviewView?.webview.postMessage({
            command: 'updateTemplates',
            templates: templates
          });
          break;
        case 'useTemplate':
          const template = manager.getTemplateById(message.templateId);
          if (template) {
            vscode.window.showInformationMessage(`Using template: ${template.name}`);
            // You could apply the template to the current review here
          }
          break;
        case 'editTemplate':
          const templateToEdit = manager.getTemplateById(message.templateId);
          if (templateToEdit) {
            vscode.window.showInformationMessage(`Editing template: ${templateToEdit.name}`);
            // You could open a template editor here
          }
          break;
        case 'duplicateTemplate':
          manager.duplicateTemplate(message.templateId);
          const updatedTemplates = manager.getTemplates();
          templatesProvider.webviewView?.webview.postMessage({
            command: 'updateTemplates',
            templates: updatedTemplates
          });
          break;
        case 'addNewTemplate':
          vscode.window.showInformationMessage('Add new template functionality');
          // You could open a template creation dialog here
          break;
      }
    };
  }

  // Update the review functions to add to history
  async function addReviewToHistory(fileName: string, status: 'success' | 'warning' | 'error', reviewData?: any) {
    const manager = SecondarySidebarManager.getInstance();
    manager.addReviewToHistory(fileName, status, reviewData);
  }

  // Command to show the right panel
  const showRightPanelDisposable = vscode.commands.registerCommand(
    "ai-reviewer.showRightPanel",
    async () => {
      try {
        // Show the right panel by focusing on one of its views
        await vscode.commands.executeCommand('ai-reviewer-history.focus');
        vscode.window.showInformationMessage('AI Reviewer Tools panel opened');
      } catch (error) {
        vscode.window.showErrorMessage('Failed to open AI Reviewer Tools panel');
      }
    }
  );

  context.subscriptions.push(
    disposable,
    showSettingsDisposable,
    openSettingsPanelDisposable,
    configChangeDisposable,
    reviewAndSuggestDisposable,
    reviewPRDisposable,
    showDebugOutputDisposable,
    ghostTextDisposable,
    acceptGhostSuggestionDisposable,
    toggleGhostTextDisposable,
    testGhostTextDisposable,
    aiPromptPopupDisposable,
    showRightPanelDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
