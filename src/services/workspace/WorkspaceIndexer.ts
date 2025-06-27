import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Logger, debugOutputChannel } from "../../utils";
import {
  WorkspaceIndex,
  WorkspaceFile,
  ParsedFile,
  ProjectStructure,
  DependencyInfo,
  WorkspaceStatistics,
  IndexingProgress,
} from "../../types";
import { WorkspaceScanner } from "./WorkspaceScanner";
import { ASTParserFactory, BaseASTParser } from "./ASTParser";

export interface IndexingOptions {
  includeHiddenFiles?: boolean;
  maxFileSize?: number;
  parseTimeout?: number;
  concurrency?: number;
  skipPatterns?: string[];
}

export class WorkspaceIndexer {
  private static instance: WorkspaceIndexer;
  private scanner: WorkspaceScanner;
  private currentIndex: WorkspaceIndex | null = null;
  private isIndexing = false;
  private progressCallback?: (progress: IndexingProgress) => void;

  private constructor() {
    this.scanner = WorkspaceScanner.getInstance();
  }

  public static getInstance(): WorkspaceIndexer {
    if (!WorkspaceIndexer.instance) {
      WorkspaceIndexer.instance = new WorkspaceIndexer();
    }
    return WorkspaceIndexer.instance;
  }

  /**
   * Index toàn bộ workspace
   */
  public async indexWorkspace(
    options: IndexingOptions = {}
  ): Promise<WorkspaceIndex> {
    if (this.isIndexing) {
      throw new Error("Workspace indexing is already in progress");
    }

    this.isIndexing = true;
    const startTime = Date.now();

    try {
      // Phase 1: Scan files
      this.updateProgress({
        currentFile: "Scanning workspace...",
        totalFiles: 0,
        processedFiles: 0,
        currentPhase: "scanning",
        percentage: 0,
      });

      const files = await this.scanner.scanWorkspace();

      // Filter files based on options
      const filteredFiles = this.filterFiles(files, options);

      // Phase 2: Parse files
      this.updateProgress({
        currentFile: "Parsing files...",
        totalFiles: filteredFiles.length,
        processedFiles: 0,
        currentPhase: "parsing",
        percentage: 0,
      });

      const parsedFiles = await this.parseFiles(filteredFiles, options);

      // Phase 3: Analyze project structure
      this.updateProgress({
        currentFile: "Analyzing project structure...",
        totalFiles: filteredFiles.length,
        processedFiles: filteredFiles.length,
        currentPhase: "analyzing",
        percentage: 90,
      });

      const projectStructure =
        this.scanner.analyzeProjectStructure(filteredFiles);
      const dependencies = await this.analyzeDependencies(filteredFiles);
      const statistics = this.calculateStatistics(filteredFiles, parsedFiles);

      // Create workspace index
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workspacePath = workspaceFolders?.[0]?.uri.fsPath || "";

      this.currentIndex = {
        id: this.generateIndexId(),
        workspacePath,
        files: filteredFiles,
        parsedFiles,
        projectStructure,
        dependencies,
        statistics,
        createdAt: startTime,
        updatedAt: Date.now(),
      };

      this.updateProgress({
        currentFile: "Indexing complete",
        totalFiles: filteredFiles.length,
        processedFiles: filteredFiles.length,
        currentPhase: "complete",
        percentage: 100,
      });

      return this.currentIndex;
    } catch (error) {
      throw error;
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Lọc files dựa trên options
   */
  private filterFiles(
    files: WorkspaceFile[],
    options: IndexingOptions
  ): WorkspaceFile[] {
    return files.filter((file) => {
      // Skip hidden files if not included
      if (!options.includeHiddenFiles && file.isHidden) {
        return false;
      }

      // Skip files based on size
      if (options.maxFileSize && file.size > options.maxFileSize) {
        return false;
      }

      // Skip files based on patterns
      if (options.skipPatterns) {
        for (const pattern of options.skipPatterns) {
          if (file.relativePath.includes(pattern)) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Parse tất cả files
   */
  private async parseFiles(
    files: WorkspaceFile[],
    options: IndexingOptions
  ): Promise<ParsedFile[]> {
    const parsedFiles: ParsedFile[] = [];
    const concurrency = options.concurrency || 5;
    const batchSize = Math.ceil(files.length / concurrency);

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchPromises = batch.map((file) => this.parseFile(file, options));

      const batchResults = await Promise.allSettled(batchPromises);

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === "fulfilled") {
          parsedFiles.push(result.value);
        } else {
          // Failed to parse file
        }
      }

      // Update progress
      this.updateProgress({
        currentFile: `Parsing ${
          files[Math.min(i + batchSize, files.length - 1)].name
        }...`,
        totalFiles: files.length,
        processedFiles: Math.min(i + batchSize, files.length),
        currentPhase: "parsing",
        percentage: Math.round(((i + batchSize) / files.length) * 80),
      });
    }

    return parsedFiles;
  }

  /**
   * Parse một file cụ thể
   */
  private async parseFile(
    file: WorkspaceFile,
    options: IndexingOptions
  ): Promise<ParsedFile> {
    try {
      const parser = ASTParserFactory.getParser(file);

      if (parser) {
        const parserOptions = {
          maxFileSize: options.maxFileSize,
          timeout: options.parseTimeout,
        };

        const parserInstance = new (parser.constructor as any)(parserOptions);
        return await parserInstance.parseFile(file);
      } else {
        // Return basic file info for unsupported file types
        return {
          file,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          variables: [],
          dependencies: [],
          complexity: 0,
          linesOfCode: 0,
          commentLines: 0,
        };
      }
    } catch (error) {
      return {
        file,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        variables: [],
        dependencies: [],
        complexity: 0,
        linesOfCode: 0,
        commentLines: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Phân tích dependencies
   */
  private async analyzeDependencies(
    files: WorkspaceFile[]
  ): Promise<DependencyInfo> {
    const dependencies: DependencyInfo = {
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
      scripts: {},
      frameworks: [],
      buildTools: [],
    };

    try {
      // Find package.json
      const packageJsonFile = files.find((f) => f.name === "package.json");
      if (packageJsonFile) {
        const content = await fs.promises.readFile(
          packageJsonFile.path,
          "utf-8"
        );
        const packageJson = JSON.parse(content);

        dependencies.packageJson = packageJson;
        dependencies.dependencies = Object.keys(packageJson.dependencies || {});
        dependencies.devDependencies = Object.keys(
          packageJson.devDependencies || {}
        );
        dependencies.peerDependencies = Object.keys(
          packageJson.peerDependencies || {}
        );
        dependencies.scripts = packageJson.scripts || {};

        // Detect frameworks and build tools
        const allDeps = [
          ...dependencies.dependencies,
          ...dependencies.devDependencies,
        ];

        // Framework detection
        if (allDeps.includes("react")) dependencies.frameworks.push("React");
        if (allDeps.includes("vue")) dependencies.frameworks.push("Vue");
        if (allDeps.includes("angular"))
          dependencies.frameworks.push("Angular");
        if (allDeps.includes("express"))
          dependencies.frameworks.push("Express");
        if (allDeps.includes("next")) dependencies.frameworks.push("Next.js");
        if (allDeps.includes("nuxt")) dependencies.frameworks.push("Nuxt.js");

        // Build tool detection
        if (allDeps.includes("webpack"))
          dependencies.buildTools.push("Webpack");
        if (allDeps.includes("vite")) dependencies.buildTools.push("Vite");
        if (allDeps.includes("rollup")) dependencies.buildTools.push("Rollup");
        if (allDeps.includes("parcel")) dependencies.buildTools.push("Parcel");
        if (allDeps.includes("esbuild"))
          dependencies.buildTools.push("esbuild");
      }
    } catch (error) {
      // Error analyzing dependencies
    }

    return dependencies;
  }

  /**
   * Tính toán statistics
   */
  private calculateStatistics(
    files: WorkspaceFile[],
    parsedFiles: ParsedFile[]
  ): WorkspaceStatistics {
    const stats: WorkspaceStatistics = {
      totalFiles: files.length,
      totalLines: 0,
      totalFunctions: 0,
      totalClasses: 0,
      totalInterfaces: 0,
      totalVariables: 0,
      averageComplexity: 0,
      languages: {},
      fileTypes: {},
      largestFiles: [],
      mostComplexFiles: [],
    };

    // Count languages and file types
    for (const file of files) {
      stats.languages[file.language] =
        (stats.languages[file.language] || 0) + 1;
      stats.fileTypes[file.extension] =
        (stats.fileTypes[file.extension] || 0) + 1;
    }

    // Calculate totals from parsed files
    let totalComplexity = 0;
    for (const parsedFile of parsedFiles) {
      stats.totalLines += parsedFile.linesOfCode;
      stats.totalFunctions += parsedFile.functions.length;
      stats.totalClasses += parsedFile.classes.length;
      stats.totalInterfaces += parsedFile.interfaces.length;
      stats.totalVariables += parsedFile.variables.length;
      totalComplexity += parsedFile.complexity;
    }

    stats.averageComplexity =
      parsedFiles.length > 0 ? totalComplexity / parsedFiles.length : 0;

    // Find largest files
    stats.largestFiles = [...files]
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    // Find most complex files
    stats.mostComplexFiles = [...parsedFiles]
      .filter((p) => !p.error)
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 10);

    return stats;
  }

  /**
   * Tạo ID cho index
   */
  private generateIndexId(): string {
    return `index_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cập nhật progress
   */
  private updateProgress(progress: IndexingProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Set progress callback
   */
  public setProgressCallback(
    callback: (progress: IndexingProgress) => void
  ): void {
    this.progressCallback = callback;
  }

  /**
   * Lấy index hiện tại
   */
  public getCurrentIndex(): WorkspaceIndex | null {
    return this.currentIndex;
  }

  /**
   * Kiểm tra xem có đang indexing không
   */
  public isCurrentlyIndexing(): boolean {
    return this.isIndexing;
  }

  /**
   * Refresh index cho một file cụ thể
   */
  public async refreshFile(filePath: string): Promise<void> {
    if (!this.currentIndex) {
      return;
    }

    try {
      const file = this.currentIndex.files.find((f) => f.path === filePath);
      if (!file) {
        return;
      }

      // Update file info
      const stats = await fs.promises.stat(filePath);
      file.size = stats.size;
      file.lastModified = stats.mtime.getTime();

      // Re-parse file
      const parser = ASTParserFactory.getParser(file);
      if (parser) {
        const parsedFile = await parser.parseFile(file);
        const existingIndex = this.currentIndex.parsedFiles.findIndex(
          (p) => p.file.path === filePath
        );

        if (existingIndex >= 0) {
          this.currentIndex.parsedFiles[existingIndex] = parsedFile;
        } else {
          this.currentIndex.parsedFiles.push(parsedFile);
        }

        // Recalculate statistics
        this.currentIndex.statistics = this.calculateStatistics(
          this.currentIndex.files,
          this.currentIndex.parsedFiles
        );
        this.currentIndex.updatedAt = Date.now();
      }
    } catch (error) {
      // Error refreshing file
    }
  }

  /**
   * Xóa index hiện tại
   */
  public clearIndex(): void {
    this.currentIndex = null;
  }

  /**
   * Lưu index vào file
   */
  public async saveIndex(filePath: string): Promise<void> {
    if (!this.currentIndex) {
      throw new Error("No index to save");
    }

    try {
      await fs.promises.writeFile(
        filePath,
        JSON.stringify(this.currentIndex, null, 2)
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Load index từ file
   */
  public async loadIndex(filePath: string): Promise<WorkspaceIndex> {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      this.currentIndex = JSON.parse(content);
      if (!this.currentIndex) {
        throw new Error("Failed to load index from file");
      }
      return this.currentIndex;
    } catch (error) {
      throw error;
    }
  }
}
