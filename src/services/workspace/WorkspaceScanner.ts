import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Logger, debugOutputChannel } from "../../utils";
import { WorkspaceFile, ProjectStructure } from "../../types";

export class WorkspaceScanner {
  private static instance: WorkspaceScanner;
  private ignorePatterns: string[] = [
    'node_modules',
    '.git',
    '.vscode',
    'dist',
    'build',
    'coverage',
    '.DS_Store',
    '*.log',
    '*.tmp',
    '*.cache'
  ];

  private constructor() {}

  public static getInstance(): WorkspaceScanner {
    if (!WorkspaceScanner.instance) {
      WorkspaceScanner.instance = new WorkspaceScanner();
    }
    return WorkspaceScanner.instance;
  }

  /**
   * Quét toàn bộ workspace và trả về danh sách files
   */
  public async scanWorkspace(): Promise<WorkspaceFile[]> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error("No workspace folder found");
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      Logger.logDebug(debugOutputChannel, `[WorkspaceScanner] Scanning workspace: ${workspacePath}`);

      const files: WorkspaceFile[] = [];
      await this.scanDirectory(workspacePath, '', files);

      Logger.logDebug(debugOutputChannel, `[WorkspaceScanner] Found ${files.length} files`);
      return files;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[WorkspaceScanner] Error scanning workspace:`, error);
      throw error;
    }
  }

  /**
   * Quét một directory cụ thể
   */
  private async scanDirectory(
    fullPath: string,
    relativePath: string,
    files: WorkspaceFile[]
  ): Promise<void> {
    try {
      const items = await fs.promises.readdir(fullPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(fullPath, item.name);
        const itemRelativePath = path.join(relativePath, item.name);

        // Kiểm tra ignore patterns
        if (this.shouldIgnore(itemRelativePath)) {
          continue;
        }

        if (item.isDirectory()) {
          // Quét subdirectory
          await this.scanDirectory(itemPath, itemRelativePath, files);
        } else {
          // Thêm file
          const fileInfo = await this.getFileInfo(itemPath, itemRelativePath);
          files.push(fileInfo);
        }
      }
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[WorkspaceScanner] Error scanning directory ${fullPath}:`, error);
    }
  }

  /**
   * Kiểm tra xem file/directory có nên bỏ qua không
   */
  private shouldIgnore(relativePath: string): boolean {
    const normalizedPath = relativePath.replace(/\\/g, '/');

    for (const pattern of this.ignorePatterns) {
      if (pattern.includes('*')) {
        // Wildcard pattern
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        if (regex.test(normalizedPath)) {
          return true;
        }
      } else {
        // Exact match
        if (normalizedPath.includes(pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Lấy thông tin chi tiết của một file
   */
  private async getFileInfo(fullPath: string, relativePath: string): Promise<WorkspaceFile> {
    try {
      const stats = await fs.promises.stat(fullPath);
      const ext = path.extname(fullPath);
      const name = path.basename(fullPath);

      return {
        path: fullPath,
        relativePath: relativePath,
        name: name,
        extension: ext,
        language: this.getLanguageFromExtension(ext),
        size: stats.size,
        lastModified: stats.mtime.getTime(),
        isDirectory: false,
        isHidden: name.startsWith('.')
      };
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[WorkspaceScanner] Error getting file info for ${fullPath}:`, error);
      throw error;
    }
  }

  /**
   * Xác định ngôn ngữ từ extension
   */
  private getLanguageFromExtension(extension: string): string {
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.txt': 'text',
      '.sql': 'sql',
      '.sh': 'shell',
      '.bat': 'batch',
      '.ps1': 'powershell'
    };

    return languageMap[extension.toLowerCase()] || 'unknown';
  }

  /**
   * Phân tích cấu trúc project từ danh sách files
   */
  public analyzeProjectStructure(files: WorkspaceFile[]): ProjectStructure {
    const structure: ProjectStructure = {
      rootFiles: [],
      directories: [],
      packageFiles: [],
      configFiles: [],
      sourceFiles: [],
      testFiles: [],
      documentationFiles: []
    };

    for (const file of files) {
      const relativePath = file.relativePath;
      const name = file.name.toLowerCase();

      // Root files
      if (!relativePath.includes('/') && !relativePath.includes('\\')) {
        structure.rootFiles.push(file);
      }

      // Package files
      if (name === 'package.json' || name === 'package-lock.json' || name === 'yarn.lock') {
        structure.packageFiles.push(file);
      }

      // Config files
      if (this.isConfigFile(name)) {
        structure.configFiles.push(file);
      }

      // Source files
      if (this.isSourceFile(file)) {
        structure.sourceFiles.push(file);
      }

      // Test files
      if (this.isTestFile(relativePath, name)) {
        structure.testFiles.push(file);
      }

      // Documentation files
      if (this.isDocumentationFile(name)) {
        structure.documentationFiles.push(file);
      }
    }

    // Build directory structure
    structure.directories = this.buildDirectoryStructure(files);

    return structure;
  }

  /**
   * Kiểm tra xem có phải config file không
   */
  private isConfigFile(name: string): boolean {
    const configPatterns = [
      'tsconfig', 'webpack', 'rollup', 'vite', 'eslint', 'prettier',
      'babel', 'jest', 'karma', 'cypress', 'playwright', 'dockerfile',
      '.env', '.gitignore', '.editorconfig', '.eslintrc', '.prettierrc'
    ];

    return configPatterns.some(pattern => name.includes(pattern));
  }

  /**
   * Kiểm tra xem có phải source file không
   */
  private isSourceFile(file: WorkspaceFile): boolean {
    const sourceExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala'];
    return sourceExtensions.includes(file.extension.toLowerCase());
  }

  /**
   * Kiểm tra xem có phải test file không
   */
  private isTestFile(relativePath: string, name: string): boolean {
    const testPatterns = ['test', 'spec', '__tests__', '__mocks__'];
    const testExtensions = ['.test.', '.spec.'];

    return testPatterns.some(pattern =>
      relativePath.includes(pattern) || name.includes(pattern)
    ) || testExtensions.some(ext => name.includes(ext));
  }

  /**
   * Kiểm tra xem có phải documentation file không
   */
  private isDocumentationFile(name: string): boolean {
    const docExtensions = ['.md', '.txt', '.rst', '.adoc'];
    return docExtensions.includes(path.extname(name).toLowerCase()) ||
           name === 'readme' || name === 'license' || name === 'changelog';
  }

  /**
   * Xây dựng cấu trúc directory
   */
  private buildDirectoryStructure(files: WorkspaceFile[]): any[] {
    const directories = new Map<string, any>();

    for (const file of files) {
      const pathParts = file.relativePath.split(/[\/\\]/);

      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirPath = pathParts.slice(0, i + 1).join('/');

        if (!directories.has(dirPath)) {
          directories.set(dirPath, {
            path: dirPath,
            name: pathParts[i],
            files: [],
            subdirectories: [],
            depth: i + 1
          });
        }
      }
    }

    // Add files to their directories
    for (const file of files) {
      const dirPath = path.dirname(file.relativePath);
      if (directories.has(dirPath)) {
        directories.get(dirPath).files.push(file);
      }
    }

    return Array.from(directories.values());
  }

  /**
   * Thêm ignore pattern
   */
  public addIgnorePattern(pattern: string): void {
    if (!this.ignorePatterns.includes(pattern)) {
      this.ignorePatterns.push(pattern);
    }
  }

  /**
   * Xóa ignore pattern
   */
  public removeIgnorePattern(pattern: string): void {
    const index = this.ignorePatterns.indexOf(pattern);
    if (index > -1) {
      this.ignorePatterns.splice(index, 1);
    }
  }
}