import * as fs from "fs";
import * as path from "path";
import { AgentTaskBase } from "./AgentTaskBase";

export interface UnitTestInput {
  filePath: string;
  framework?: "jest" | "mocha" | "vitest";
  testType?: "unit" | "integration" | "e2e";
  coverage?: boolean;
}

export class UnitTestGeneratorTask extends AgentTaskBase<UnitTestInput> {
  constructor(taskId: string, onStateChange: (state: any) => void) {
    super(taskId, onStateChange);
  }

  protected initializeTools(): void {
    // Register tools for unit test generation
    this.registerTool({
      name: "readFile",
      description:
        "Read the content of a file to analyze its structure and generate appropriate tests",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path to the file to read",
            required: true,
          },
        },
        required: ["filePath"],
      },
    });

    this.registerTool({
      name: "analyzeCodeStructure",
      description:
        "Analyze the code structure to identify functions, classes, and dependencies",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The source code to analyze",
            required: true,
          },
          language: {
            type: "string",
            description:
              "Programming language (typescript, javascript, python, etc.)",
            required: true,
          },
        },
        required: ["code", "language"],
      },
    });

    this.registerTool({
      name: "generateTestFile",
      description:
        "Generate a test file with unit tests based on the analyzed code structure",
      parameters: {
        type: "object",
        properties: {
          testContent: {
            type: "string",
            description: "The generated test content",
            required: true,
          },
          testFilePath: {
            type: "string",
            description: "Path where the test file should be created",
            required: true,
          },
          framework: {
            type: "string",
            description: "Testing framework to use (jest, mocha, vitest)",
            required: true,
          },
        },
        required: ["testContent", "testFilePath", "framework"],
      },
    });

    this.registerTool({
      name: "validateTestFile",
      description:
        "Validate the generated test file for syntax and best practices",
      parameters: {
        type: "object",
        properties: {
          testFilePath: {
            type: "string",
            description: "Path to the test file to validate",
            required: true,
          },
          originalFilePath: {
            type: "string",
            description: "Path to the original source file",
            required: true,
          },
        },
        required: ["testFilePath", "originalFilePath"],
      },
    });
  }

  protected getSystemPrompt(): string {
    return `You are an expert software developer specializing in unit test generation.
Your task is to analyze source code files and generate comprehensive, high-quality unit tests.

Key responsibilities:
1. Analyze the source code structure and identify testable components
2. Generate appropriate test cases covering normal cases, edge cases, and error scenarios
3. Follow testing best practices and conventions for the specified framework
4. Ensure good test coverage and maintainable test code
5. Include proper setup, teardown, and mocking where necessary

Testing principles to follow:
- Test one thing at a time
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Test both success and failure scenarios
- Keep tests simple and readable`;
  }

  protected validateInput(input: UnitTestInput): boolean {
    if (!input.filePath) {
      return false;
    }

    // Check if file exists
    try {
      const stats = fs.statSync(input.filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  protected async executeTool(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    switch (toolName) {
      case "readFile":
        return await this.readFile(parameters.filePath);

      case "analyzeCodeStructure":
        return await this.analyzeCodeStructure(
          parameters.code,
          parameters.language
        );

      case "generateTestFile":
        return await this.generateTestFile(
          parameters.testContent,
          parameters.testFilePath,
          parameters.framework
        );

      case "validateTestFile":
        return await this.validateTestFile(
          parameters.testFilePath,
          parameters.originalFilePath
        );

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return content;
    } catch (error) {
      throw new Error(
        `Failed to read file ${filePath}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async analyzeCodeStructure(
    code: string,
    language: string
  ): Promise<any> {
    // This would typically use AST parsing or LLM analysis
    // For now, we'll return a simple analysis
    const analysis: {
      language: string;
      functions: string[];
      classes: string[];
      imports: string[];
      exports: string[];
      dependencies: string[];
    } = {
      language,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
    };

    // Simple regex-based analysis for demonstration
    const functionMatches = code.match(
      /function\s+(\w+)|(\w+)\s*[:=]\s*function|(\w+)\s*[:=]\s*\(/g
    );
    if (functionMatches) {
      analysis.functions = functionMatches.map((match) =>
        match.replace(/[:=]\s*(function|\().*/, "")
      );
    }

    const classMatches = code.match(/class\s+(\w+)/g);
    if (classMatches) {
      analysis.classes = classMatches.map((match) =>
        match.replace("class ", "")
      );
    }

    const importMatches = code.match(/import\s+.*from\s+['"]([^'"]+)['"]/g);
    if (importMatches) {
      analysis.imports = importMatches.map((match) =>
        match.replace(/import\s+.*from\s+['"]([^'"]+)['"]/, "$1")
      );
    }

    return analysis;
  }

  private async generateTestFile(
    testContent: string,
    testFilePath: string,
    framework: string
  ): Promise<string> {
    try {
      // Ensure the directory exists
      const testDir = path.dirname(testFilePath);
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      // Write the test file
      fs.writeFileSync(testFilePath, testContent, "utf-8");

      return `Test file generated successfully at ${testFilePath}`;
    } catch (error) {
      throw new Error(
        `Failed to generate test file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async validateTestFile(
    testFilePath: string,
    originalFilePath: string
  ): Promise<any> {
    try {
      const testContent = fs.readFileSync(testFilePath, "utf-8");
      const originalContent = fs.readFileSync(originalFilePath, "utf-8");

      // Basic validation checks
      const validation = {
        hasTestCases:
          testContent.includes("test(") ||
          testContent.includes("it(") ||
          testContent.includes("describe("),
        hasImports:
          testContent.includes("import") || testContent.includes("require"),
        hasAssertions:
          testContent.includes("expect(") || testContent.includes("assert("),
        fileExists: fs.existsSync(testFilePath),
        testCount: (testContent.match(/test\(|it\(/g) || []).length,
        describeCount: (testContent.match(/describe\(/g) || []).length,
      };

      return {
        isValid:
          validation.hasTestCases &&
          validation.hasImports &&
          validation.hasAssertions,
        validation,
        message: `Test file validation completed. Found ${validation.testCount} test cases.`,
      };
    } catch (error) {
      throw new Error(
        `Failed to validate test file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
