import * as vscode from "vscode";
import { Logger, debugOutputChannel } from "../utils";
import { WorkspaceIndexer } from "../services/workspace";
import { VSCodeUtils } from "../utils/vscode";

export class WorkspaceCommands {
  private static instance: WorkspaceCommands;
  private indexer: WorkspaceIndexer;
  private progressBar: vscode.Progress<{ message?: string; increment?: number }> | null = null;

  private constructor() {
    this.indexer = WorkspaceIndexer.getInstance();
  }

  public static getInstance(): WorkspaceCommands {
    if (!WorkspaceCommands.instance) {
      WorkspaceCommands.instance = new WorkspaceCommands();
    }
    return WorkspaceCommands.instance;
  }

  /**
   * Index workspace khi mở project
   */
  public async indexWorkspaceOnOpen(): Promise<void> {
    try {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Starting workspace indexing on open");

      // Set progress callback
      this.indexer.setProgressCallback((progress) => {
        this.updateProgress(progress);
      });

      // Start indexing with default options
      const options = {
        includeHiddenFiles: false,
        maxFileSize: 1024 * 1024, // 1MB
        parseTimeout: 30000, // 30 seconds
        concurrency: 5,
        skipPatterns: ['node_modules', '.git', '.vscode', 'dist', 'build']
      };

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Indexing workspace...",
        cancellable: false
      }, async (progress) => {
        this.progressBar = progress;

        try {
          const index = await this.indexer.indexWorkspace(options);

          Logger.logDebug(debugOutputChannel, `[WorkspaceCommands] Workspace indexed successfully. Found ${index.files.length} files`);

          // Show completion message
          VSCodeUtils.showInformation(`Workspace indexed successfully! Found ${index.files.length} files, ${index.statistics.totalFunctions} functions, ${index.statistics.totalClasses} classes`);

        } catch (error) {
          Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error during indexing:", error);
          VSCodeUtils.showWarning("Failed to index workspace. Some features may not work properly.");
        } finally {
          this.progressBar = null;
        }
      });

    } catch (error) {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error in indexWorkspaceOnOpen:", error);
    }
  }

  /**
   * Index workspace manually
   */
  public async indexWorkspace(): Promise<void> {
    try {
      if (this.indexer.isCurrentlyIndexing()) {
        VSCodeUtils.showWarning("Workspace indexing is already in progress");
        return;
      }

      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Starting manual workspace indexing");

      // Show options dialog
      const includeHidden = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Include hidden files?'
      });

      const maxFileSize = await vscode.window.showInputBox({
        placeHolder: 'Maximum file size in MB (default: 1)',
        value: '1'
      });

      const options = {
        includeHiddenFiles: includeHidden === 'Yes',
        maxFileSize: parseInt(maxFileSize || '1') * 1024 * 1024,
        parseTimeout: 30000,
        concurrency: 5,
        skipPatterns: ['node_modules', '.git', '.vscode', 'dist', 'build']
      };

      // Set progress callback
      this.indexer.setProgressCallback((progress) => {
        this.updateProgress(progress);
      });

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Indexing workspace...",
        cancellable: false
      }, async (progress) => {
        this.progressBar = progress;

        try {
          const index = await this.indexer.indexWorkspace(options);

          Logger.logDebug(debugOutputChannel, `[WorkspaceCommands] Manual indexing completed. Found ${index.files.length} files`);

          VSCodeUtils.showInformation(`Workspace indexed successfully! Found ${index.files.length} files, ${index.statistics.totalFunctions} functions, ${index.statistics.totalClasses} classes`);

        } catch (error) {
          Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error during manual indexing:", error);
          VSCodeUtils.showWarning("Failed to index workspace");
        } finally {
          this.progressBar = null;
        }
      });

    } catch (error) {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error in indexWorkspace:", error);
    }
  }

  /**
   * Refresh index cho file hiện tại
   */
  public async refreshCurrentFile(): Promise<void> {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        VSCodeUtils.showWarning("No active file to refresh");
        return;
      }

      const filePath = activeEditor.document.uri.fsPath;
      Logger.logDebug(debugOutputChannel, `[WorkspaceCommands] Refreshing index for file: ${filePath}`);

      await this.indexer.refreshFile(filePath);

      VSCodeUtils.showInformation("File index refreshed successfully");

    } catch (error) {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error refreshing current file:", error);
      VSCodeUtils.showWarning("Failed to refresh file index");
    }
  }

  /**
   * Hiển thị thông tin workspace
   */
  public async showWorkspaceInfo(): Promise<void> {
    try {
      const index = this.indexer.getCurrentIndex();
      if (!index) {
        VSCodeUtils.showWarning("No workspace index available. Please index the workspace first.");
        return;
      }

      const stats = index.statistics;
      const deps = index.dependencies;

      const info = `
**Workspace Information**

**Files:**
- Total files: ${stats.totalFiles}
- Total lines of code: ${stats.totalLines}
- Average complexity: ${stats.averageComplexity.toFixed(2)}

**Code Elements:**
- Functions: ${stats.totalFunctions}
- Classes: ${stats.totalClasses}
- Interfaces: ${stats.totalInterfaces}
- Variables: ${stats.totalVariables}

**Languages:**
${Object.entries(stats.languages).map(([lang, count]) => `- ${lang}: ${count} files`).join('\n')}

**Dependencies:**
- Dependencies: ${deps.dependencies.length}
- Dev Dependencies: ${deps.devDependencies.length}
- Frameworks: ${deps.frameworks.join(', ') || 'None'}
- Build Tools: ${deps.buildTools.join(', ') || 'None'}

**Project Structure:**
- Source files: ${index.projectStructure.sourceFiles.length}
- Test files: ${index.projectStructure.testFiles.length}
- Config files: ${index.projectStructure.configFiles.length}
- Documentation files: ${index.projectStructure.documentationFiles.length}
      `.trim();

      // Create and show webview
      const panel = vscode.window.createWebviewPanel(
        'workspaceInfo',
        'Workspace Information',
        vscode.ViewColumn.One,
        {}
      );

      panel.webview.html = this.getWorkspaceInfoHtml(info, index);

    } catch (error) {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error showing workspace info:", error);
      VSCodeUtils.showWarning("Failed to show workspace information");
    }
  }

  /**
   * Lưu index vào file
   */
  public async saveIndex(): Promise<void> {
    try {
      const uri = await vscode.window.showSaveDialog({
        filters: {
          'JSON Files': ['json']
        },
        saveLabel: 'Save Index'
      });

      if (!uri) {
        return;
      }

      await this.indexer.saveIndex(uri.fsPath);
      VSCodeUtils.showInformation("Workspace index saved successfully");

    } catch (error) {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error saving index:", error);
      VSCodeUtils.showWarning("Failed to save workspace index");
    }
  }

  /**
   * Load index từ file
   */
  public async loadIndex(): Promise<void> {
    try {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'JSON Files': ['json']
        },
        openLabel: 'Load Index'
      });

      if (!uris || uris.length === 0) {
        return;
      }

      const index = await this.indexer.loadIndex(uris[0].fsPath);
      VSCodeUtils.showInformation(`Workspace index loaded successfully! Found ${index.files.length} files`);

    } catch (error) {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error loading index:", error);
      VSCodeUtils.showWarning("Failed to load workspace index");
    }
  }

  /**
   * Xóa index hiện tại
   */
  public async clearIndex(): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        "Are you sure you want to clear the workspace index?",
        { modal: true },
        'Yes', 'No'
      );

      if (result === 'Yes') {
        this.indexer.clearIndex();
        VSCodeUtils.showInformation("Workspace index cleared");
      }

    } catch (error) {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error clearing index:", error);
      VSCodeUtils.showWarning("Failed to clear workspace index");
    }
  }

  /**
   * Tìm kiếm trong workspace
   */
  public async searchInWorkspace(): Promise<void> {
    try {
      const query = await vscode.window.showInputBox({
        placeHolder: 'Enter search query (function name, class name, etc.)',
        prompt: 'Search in workspace index'
      });

      if (!query) {
        return;
      }

      const index = this.indexer.getCurrentIndex();
      if (!index) {
        VSCodeUtils.showWarning("No workspace index available. Please index the workspace first.");
        return;
      }

      const results = this.searchIndex(index, query);
      this.showSearchResults(results, query);

    } catch (error) {
      Logger.logDebug(debugOutputChannel, "[WorkspaceCommands] Error searching workspace:", error);
      VSCodeUtils.showWarning("Failed to search workspace");
    }
  }

  /**
   * Cập nhật progress
   */
  private updateProgress(progress: any): void {
    if (this.progressBar) {
      this.progressBar.report({
        message: `${progress.currentPhase}: ${progress.currentFile} (${progress.processedFiles}/${progress.totalFiles})`,
        increment: progress.percentage - (this.lastProgress || 0)
      });
      this.lastProgress = progress.percentage;
    }
  }

  private lastProgress = 0;

  /**
   * Tạo HTML cho workspace info
   */
  private getWorkspaceInfoHtml(info: string, index: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workspace Information</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .section {
            margin-bottom: 30px;
            padding: 20px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
        }
        .section h2 {
            margin-top: 0;
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-textLink-foreground);
            padding-bottom: 10px;
        }
        .stat-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .stat-item {
            background-color: var(--vscode-editor-background);
            padding: 15px;
            border-radius: 6px;
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .stat-label {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        .file-list {
            max-height: 300px;
            overflow-y: auto;
            background-color: var(--vscode-editor-background);
            border-radius: 6px;
            padding: 10px;
        }
        .file-item {
            padding: 5px 0;
            border-bottom: 1px solid var(--vscode-editor-lineHighlightBackground);
        }
        .file-item:last-child {
            border-bottom: none;
        }
        pre {
            background-color: var(--vscode-editor-background);
            padding: 15px;
            border-radius: 6px;
            overflow-x: auto;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="section">
            <h2>📊 Statistics</h2>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${index.statistics.totalFiles}</div>
                    <div class="stat-label">Total Files</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.statistics.totalLines}</div>
                    <div class="stat-label">Lines of Code</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.statistics.totalFunctions}</div>
                    <div class="stat-label">Functions</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.statistics.totalClasses}</div>
                    <div class="stat-label">Classes</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>🔧 Dependencies</h2>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${index.dependencies.dependencies.length}</div>
                    <div class="stat-label">Dependencies</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.dependencies.devDependencies.length}</div>
                    <div class="stat-label">Dev Dependencies</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.dependencies.frameworks.length}</div>
                    <div class="stat-label">Frameworks</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.dependencies.buildTools.length}</div>
                    <div class="stat-label">Build Tools</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>📁 Project Structure</h2>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${index.projectStructure.sourceFiles.length}</div>
                    <div class="stat-label">Source Files</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.projectStructure.testFiles.length}</div>
                    <div class="stat-label">Test Files</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.projectStructure.configFiles.length}</div>
                    <div class="stat-label">Config Files</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${index.projectStructure.documentationFiles.length}</div>
                    <div class="stat-label">Documentation</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>📝 Detailed Information</h2>
            <pre>${info}</pre>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Tìm kiếm trong index
   */
  private searchIndex(index: any, query: string): any[] {
    const results: any[] = [];
    const lowerQuery = query.toLowerCase();

    // Search in functions
    for (const parsedFile of index.parsedFiles) {
      for (const func of parsedFile.functions) {
        if (func.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'function',
            name: func.name,
            file: parsedFile.file,
            line: func.line,
            details: func
          });
        }
      }

      // Search in classes
      for (const cls of parsedFile.classes) {
        if (cls.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'class',
            name: cls.name,
            file: parsedFile.file,
            line: cls.line,
            details: cls
          });
        }
      }

      // Search in interfaces
      for (const intf of parsedFile.interfaces) {
        if (intf.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'interface',
            name: intf.name,
            file: parsedFile.file,
            line: intf.line,
            details: intf
          });
        }
      }

      // Search in variables
      for (const var_ of parsedFile.variables) {
        if (var_.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'variable',
            name: var_.name,
            file: parsedFile.file,
            line: var_.line,
            details: var_
          });
        }
      }
    }

    return results;
  }

  /**
   * Hiển thị kết quả tìm kiếm
   */
  private showSearchResults(results: any[], query: string): void {
    if (results.length === 0) {
      VSCodeUtils.showInformation(`No results found for "${query}"`);
      return;
    }

    const items = results.map(result => ({
      label: `${result.type}: ${result.name}`,
      description: `${result.file.relativePath}:${result.line}`,
      detail: result.details,
      result
    }));

    vscode.window.showQuickPick(items, {
      placeHolder: `Found ${results.length} results for "${query}"`
    }).then(selected => {
      if (selected) {
        // Open file and go to line
        vscode.workspace.openTextDocument(selected.result.file.path).then(doc => {
          vscode.window.showTextDocument(doc).then(editor => {
            const position = new vscode.Position(selected.result.line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
          });
        });
      }
    });
  }
}