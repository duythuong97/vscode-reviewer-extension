import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface WorkspaceFile {
  path: string;
  defaultContent: string;
  description: string;
}

export class WorkspaceFileTemplate {
  private static instance: WorkspaceFileTemplate;
  private workspaceRoot: string | undefined;

  // Define all workspace files
  private static readonly WORKSPACE_FILES: WorkspaceFile[] = [
    {
      path: ".vscode/ai-reviewer-code-review-prompt.md",
      defaultContent: `# Code Review Prompt Template

You are an expert code reviewer. Please review the following code and provide:

## Code Quality Assessment
- Overall structure and readability
- Code organization and best practices
- Potential improvements

## Security Concerns
- Security vulnerabilities
- Input validation issues
- Data handling concerns

## Performance Considerations
- Optimization opportunities
- Resource usage
- Scalability concerns

## Convention Adherence
- How well the code follows defined standards
- Style consistency
- Naming conventions

## Suggestions
Provide specific, actionable suggestions for improvement.

## Code to Review
\`\`\`{language}
{code}
\`\`\``,
      description: "Template for code review prompts"
    },

    {
      path: ".vscode/ai-reviewer-ghost-text-prompt.md",
      defaultContent: `# Ghost Text Suggestion Prompt

Provide intelligent code completion suggestions based on the current context.

## Context
- Current file type: {language}
- Cursor position context
- Previous code patterns

## Guidelines
- Suggest meaningful completions
- Follow established patterns
- Consider best practices
- Keep suggestions concise

## Current Code Context
\`\`\`{language}
{context}
\`\`\`

## Suggestion
Provide a natural continuation of the code that would be helpful for the developer.`,
      description: "Template for ghost text suggestions"
    },
    {
      path: ".vscode/ai-reviewer-coding-convention.md",
      defaultContent: `# Coding Conventions

## Naming Conventions
- Use camelCase for variables and functions
- Use PascalCase for classes and interfaces
- Use UPPER_CASE for constants
- Use descriptive, meaningful names

## Code Structure
- Maximum function length: 50 lines
- Maximum file length: 500 lines
- Use meaningful variable names
- Keep functions focused and single-purpose

## Formatting
- Use consistent indentation (2 or 4 spaces)
- Add spaces around operators
- Use semicolons where required
- Add blank lines for readability

## Documentation
- Add JSDoc comments for public functions
- Include parameter types and descriptions
- Document complex algorithms
- Keep comments up-to-date

## Security Guidelines
- Always validate user input
- Use parameterized queries for database operations
- Avoid hardcoding sensitive information
- Implement proper error handling

## Performance
- Avoid unnecessary computations
- Use appropriate data structures
- Consider memory usage
- Optimize critical paths`,
      description: "Coding convention rules for AI review"
    },
    {
      path: ".vscode/ai-reviewer-custom-prompt.md",
      defaultContent: `# Custom Review Prompt

You can customize this template for your specific review needs.

## Review Guidelines
- Focus on your team's specific requirements
- Consider your project's architecture
- Follow your organization's standards

## Custom Instructions
Add your custom review instructions here.

## Example Usage
This template will be used when you want to apply custom review criteria.`,
      description: "Custom review prompt template"
    }
  ];

  private constructor() {
    this.workspaceRoot = this.getWorkspaceRoot();
  }

  public static getInstance(): WorkspaceFileTemplate {
    if (!WorkspaceFileTemplate.instance) {
      WorkspaceFileTemplate.instance = new WorkspaceFileTemplate();
    }
    return WorkspaceFileTemplate.instance;
  }

  private getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].uri.fsPath;
    }
    return undefined;
  }

  /**
   * Ensure all workspace files exist with default content
   */
  public ensureAllFiles(): void {
    if (!this.workspaceRoot) {
      console.warn("No workspace root found");
      return;
    }

    WorkspaceFileTemplate.WORKSPACE_FILES.forEach(file => {
      this.ensureFile(file);
    });
  }

  /**
   * Ensure a specific file exists with default content
   */
  public ensureFile(fileInfo: WorkspaceFile): void {
    if (!this.workspaceRoot) {
      console.warn("No workspace root found");
      return;
    }

    const fullPath = path.join(this.workspaceRoot, fileInfo.path);

    if (!fs.existsSync(fullPath)) {
      // Create directory if it doesn't exist
      const dirPath = path.dirname(fullPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Write default content
      fs.writeFileSync(fullPath, fileInfo.defaultContent, "utf8");
      console.log(`Created ${fileInfo.path} with default content`);
    }
  }

  /**
   * Read file content, create with default if not exists
   */
  public readFile(filePath: string): string {
    if (!this.workspaceRoot) {
      return "";
    }

    const fullPath = path.join(this.workspaceRoot, filePath);

    if (!fs.existsSync(fullPath)) {
      // Find the file info
      const fileInfo = WorkspaceFileTemplate.WORKSPACE_FILES.find(
        file => file.path === filePath
      );

      if (fileInfo) {
        this.ensureFile(fileInfo);
        return fileInfo.defaultContent;
      } else {
        console.warn(`File ${filePath} not found in workspace files template`);
        return "";
      }
    }

    try {
      return fs.readFileSync(fullPath, "utf8");
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return "";
    }
  }

  /**
   * Write content to file
   */
  public writeFile(filePath: string, content: string): void {
    if (!this.workspaceRoot) {
      console.warn("No workspace root found");
      return;
    }

    const fullPath = path.join(this.workspaceRoot, filePath);

    try {
      // Create directory if it doesn't exist
      const dirPath = path.dirname(fullPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(fullPath, content, "utf8");
      console.log(`Updated ${filePath}`);
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error);
    }
  }

  /**
   * Get all workspace file paths
   */
  public getFilePaths(): string[] {
    return WorkspaceFileTemplate.WORKSPACE_FILES.map(file => file.path);
  }

  /**
   * Get file info by path
   */
  public getFileInfo(filePath: string): WorkspaceFile | undefined {
    return WorkspaceFileTemplate.WORKSPACE_FILES.find(
      file => file.path === filePath
    );
  }

  /**
   * Get all file infos
   */
  public getAllFileInfos(): WorkspaceFile[] {
    return [...WorkspaceFileTemplate.WORKSPACE_FILES];
  }

  /**
   * Check if file exists
   */
  public fileExists(filePath: string): boolean {
    if (!this.workspaceRoot) {
      return false;
    }

    const fullPath = path.join(this.workspaceRoot, filePath);
    return fs.existsSync(fullPath);
  }

  /**
   * Reset file to default content
   */
  public resetFile(filePath: string): void {
    const fileInfo = this.getFileInfo(filePath);
    if (fileInfo) {
      this.writeFile(filePath, fileInfo.defaultContent);
    }
  }

  /**
   * Reset all files to default content
   */
  public resetAllFiles(): void {
    WorkspaceFileTemplate.WORKSPACE_FILES.forEach(file => {
      this.writeFile(file.path, file.defaultContent);
    });
  }
}