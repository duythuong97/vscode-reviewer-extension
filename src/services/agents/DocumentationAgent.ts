import { createMachine, assign } from "xstate";
import { BaseAgentContext, AgentTool } from "../../types/agent";
import { BaseAgent } from "./BaseAgent";
import { JsonExtractor } from "../../utils/json";

// Extend base context for documentation specific properties
export interface DocumentationContext extends BaseAgentContext {
  className: string;
  methods: string[];
  documentation: string;
  docType: "api" | "user" | "technical";
  sections: string[];
}

export class DocumentationAgent extends BaseAgent<DocumentationContext> {
  constructor() {
    super();
  }

  protected getAgentName(): string {
    return "DocumentationAgent";
  }

  protected createMachine() {
    return createMachine({
      /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAOlwgBswBiAZQBUBBAJXoG0AGAXUVAAcA9rFwAXXAPy8QAD0QBGABwcSAdgCcANgUqAzBwCsAJgX79GnQBoQAT0SHD+kvY1mtxjXIAsAX29W0WHiEpASiAPoA7gIATgDWAGYUAhHUAOoA8swA0gBiADLpqWHMAKKMACIAmpw8SCCCwmISUrIIcmoqJDqGHDqKvSqDcioKVrYI3XIkGuoaaoaDRp4ccr7+GDgExGT44VFxiclpmbkFRSXMzJk1Ug2i4pJ1raadahwaDjoKOp6GOt1jOx6EhKNRvDj2UGGNYgAKbYIkdD4dAUawALwIUGojAAcow8pVaABJWhhADC6QAsgAFPIleglG51O5NR6gVr9VSabR6IwmMyWGyIMwKJwqDQcTwKX7qN76GFwoLbJEo9GY7F4gnE0kXK7MJn8IT3ZpPeRKLlaXQGYymcyAhCeRQkOTdBSKFSGRQaDwaBUbJWkGCEaLoMT4LEAcRKOIujHoRPSOPJVNp9MZ3FuRtZLWF+le70+31+-0M9pcor6Dg44sdSn0Oj9gS2gbAwdD6qjMeYcYTSd11wzzKzDxzCBeJDeH3rRb+AKFY48IP0ai+cjm+mG80b8O2YGi0Ri1FK9GY1UHhsaI9NCHXJHrcgcK44aiWGntbrvHC-vX5emfKl8PwQHwAQIDgKRFWbTNLxNdlEAAWjfedEO3AMyEoMBoONNkZEQBRDCcblZV6CEdCQ8Y5DkZRTDBb9DE0fQ61Q5sdj2GIEiSCIsOza9lk6BwRi8MjzHeSV7QcTwnAUDRPBEiEOko5iERVVEMXDbirzgh1S3nHR6zvStPBGZYfhUeslO2IM93bdShxgnDWkdTpPH0a1XRmZ9yOFNQpjMwwPAfCFpM0CzSEwARUD4KgREgDTYNwhA3X4qiV20ZYXPaMtzXrScwTUN0dBUHwgMghE9wPaI4ocvDhicFKviKyUNzUcTF3MGSRN+FwRnlQCgA */
      id: this.getAgentName(),
      initial: "idle",
      context: {
        sourceCode: "",
        className: "",
        methods: [],
        documentation: "",
        docType: "api",
        sections: [],
        errors: [] as string[],
        status: "idle",
      },
      states: {
        idle: {
          on: {
            START: {
              target: "init_workflow",
              actions: assign({
                sourceCode: ({ event }) => event.sourceCode,
                status: "init_workflow",
              }),
            },
          },
        },
        init_workflow: {
          on: {
            WORKFLOW_READY: {
              target: "analyzing",
              actions: assign({
                status: "analyzing",
              }),
            },
            WORKFLOW_ERROR: {
              target: "error",
              actions: assign({
                status: "error",
                errors: ({ context, event }) => [
                  ...context.errors,
                  event.error,
                ],
              }),
            },
          },
        },
        analyzing: {
          on: {
            ANALYSIS_COMPLETE: {
              target: "generating",
              actions: assign({
                status: "generating",
                className: ({ event }) => event.className,
                methods: ({ event }) => event.methods,
              }),
            },
            ANALYSIS_ERROR: {
              target: "error",
              actions: assign({
                status: "error",
                errors: ({ context, event }) => [
                  ...context.errors,
                  event.error,
                ],
              }),
            },
          },
        },
        generating: {
          on: {
            GENERATION_COMPLETE: {
              target: "completed",
              actions: assign({
                status: "completed",
                documentation: ({ event }) => event.documentation,
              }),
            },
            GENERATION_ERROR: {
              target: "error",
              actions: assign({
                status: "error",
                errors: ({ context, event }) => [
                  ...context.errors,
                  event.error,
                ],
              }),
            },
          },
        },
        completed: {
          type: "final",
        },
        error: {
          on: {
            RETRY: {
              target: "idle",
              actions: assign({
                errors: [],
                status: "idle",
              }),
            },
          },
        },
      },
    });
  }

  protected getAvailableTools(): AgentTool[] {
    return [
      {
        name: "analyzeSourceCode",
        description:
          "Analyze source code to extract class and method information",
      },
      {
        name: "generateAPIDocumentation",
        description:
          "Generate API documentation with method signatures and descriptions",
      },
      {
        name: "generateUserDocumentation",
        description: "Generate user-friendly documentation with examples",
      },
      {
        name: "generateTechnicalDocumentation",
        description:
          "Generate technical documentation with implementation details",
      },
      {
        name: "createDocumentationStructure",
        description: "Create documentation structure and table of contents",
      },
      {
        name: "addCodeExamples",
        description: "Add code examples and usage patterns",
      },
      {
        name: "validateDocumentation",
        description: "Validate documentation completeness and accuracy",
      },
    ];
  }

  protected getWorkflowPrompt(context: DocumentationContext): string {
    const tools = this.getToolsForPrompt();

    return `You are an expert technical writer specializing in software documentation.

Analyze the following source code and determine the optimal workflow steps for generating comprehensive documentation:

Source Code:
\`\`\`
${context.sourceCode}
\`\`\`

Available Tools:
${tools}

Based on the source code analysis, create a JSON array of workflow steps. Each step should have:
- id: unique identifier
- title: human-readable title
- description: detailed description of what this step does
- command: one of the available tool names
- priority: execution order (1 = highest priority)
- required: whether this step is mandatory
- estimatedTime: estimated execution time in seconds

Consider the following factors:
1. Code complexity and number of methods
2. Target audience (developers, users, technical)
3. Documentation type requirements
4. Examples and usage patterns needed
5. Validation and review requirements

Return only the JSON array, no additional text.`;
  }

  protected async executeStep(
    tool: AgentTool,
    context: DocumentationContext
  ): Promise<any> {
    switch (tool.name) {
      case "analyzeSourceCode":
        return await this.analyzeSourceCode(context.sourceCode);
      case "generateAPIDocumentation":
        return await this.generateAPIDocumentation(context);
      case "generateUserDocumentation":
        return await this.generateUserDocumentation(context);
      case "generateTechnicalDocumentation":
        return await this.generateTechnicalDocumentation(context);
      case "createDocumentationStructure":
        return await this.createDocumentationStructure(context);
      case "addCodeExamples":
        return await this.addCodeExamples(context);
      case "validateDocumentation":
        return await this.validateDocumentation(context.documentation);
      default:
        throw new Error(`Unknown tool: ${tool.name}`);
    }
  }

  protected async executeCustomStep(
    stepName: string,
    context: DocumentationContext
  ): Promise<void> {
    console.log(`DocumentationAgent - Executing custom step: ${stepName}`);

    // Find the step in cached workflow steps
    const workflowSteps = this.getCachedWorkflowSteps();
    const step = workflowSteps.find((s) => s.command === stepName);

    if (!step) {
      console.log(`Step ${stepName} not found in workflow`);
      return;
    }

    try {
      // Execute the step
      const result = await this.executeStep(
        { name: step.command, description: step.description },
        context
      );

      // Update step status
      step.status = "completed";
      step.result = result;

      // Send appropriate event based on step
      switch (stepName) {
        case "analyzeSourceCode":
          this.actor.send({
            type: "ANALYSIS_COMPLETE",
            className: result.className,
            methods: result.methods,
          });
          break;
        case "generateAPIDocumentation":
        case "generateUserDocumentation":
        case "generateTechnicalDocumentation":
          this.actor.send({
            type: "GENERATION_COMPLETE",
            documentation: result.documentation,
          });
          break;
        default:
          console.log(`No specific event for step: ${stepName}`);
      }

      // Continue to next step
      setTimeout(() => this.executeWorkflow(), 100);
    } catch (error) {
      console.error(`Error executing step ${stepName}:`, error);
      this.actor.send({
        type: `${stepName.toUpperCase()}_ERROR`,
        error: (error as Error).message,
      });
    }
  }

  // Tool implementations
  private async analyzeSourceCode(sourceCode: string): Promise<any> {
    const prompt = `Analyze this source code and extract class and method information:

\`\`\`
${sourceCode}
\`\`\`

Return a JSON object with:
- className: the main class name
- methods: array of method names
- complexity: estimated complexity (low/medium/high)
- dependencies: array of dependencies

Return only the JSON object, no additional text.`;

    try {
      const response = await this.llmProvider.callLLM(prompt);
      const analysis = JsonExtractor.extractJSONFromResponse(response.content);

      return {
        className: analysis.className || "UnknownClass",
        methods: analysis.methods || [],
        complexity: analysis.complexity || "medium",
        dependencies: analysis.dependencies || [],
      };
    } catch (error) {
      throw new Error(`Failed to analyze source code: ${error}`);
    }
  }

  private async generateAPIDocumentation(
    context: DocumentationContext
  ): Promise<any> {
    const prompt = `Generate API documentation for this class:

Class: ${context.className}
Methods: ${context.methods.join(", ")}

Source Code:
\`\`\`
${context.sourceCode}
\`\`\`

Generate comprehensive API documentation including:
1. Class overview
2. Method signatures and parameters
3. Return types and descriptions
4. Usage examples
5. Error handling

Return the complete API documentation as a string.`;

    try {
      const response = await this.llmProvider.callLLM(prompt);
      return {
        documentation: response.content,
      };
    } catch (error) {
      throw new Error(`Failed to generate API documentation: ${error}`);
    }
  }

  private async generateUserDocumentation(
    context: DocumentationContext
  ): Promise<any> {
    const prompt = `Generate user-friendly documentation for this class:

Class: ${context.className}
Methods: ${context.methods.join(", ")}

Generate user documentation including:
1. What this class does
2. How to use it
3. Common use cases
4. Examples for non-technical users
5. Troubleshooting tips

Return the complete user documentation as a string.`;

    try {
      const response = await this.llmProvider.callLLM(prompt);
      return {
        documentation: response.content,
      };
    } catch (error) {
      throw new Error(`Failed to generate user documentation: ${error}`);
    }
  }

  private async generateTechnicalDocumentation(
    context: DocumentationContext
  ): Promise<any> {
    const prompt = `Generate technical documentation for this class:

Class: ${context.className}
Methods: ${context.methods.join(", ")}

Generate technical documentation including:
1. Architecture overview
2. Implementation details
3. Design patterns used
4. Performance considerations
5. Integration guidelines

Return the complete technical documentation as a string.`;

    try {
      const response = await this.llmProvider.callLLM(prompt);
      return {
        documentation: response.content,
      };
    } catch (error) {
      throw new Error(`Failed to generate technical documentation: ${error}`);
    }
  }

  private async createDocumentationStructure(
    context: DocumentationContext
  ): Promise<any> {
    const prompt = `Create a documentation structure for this class:

Class: ${context.className}
Methods: ${context.methods.join(", ")}

Create a table of contents and structure including:
1. Introduction
2. Getting Started
3. API Reference
4. Examples
5. Troubleshooting
6. FAQ

Return the structure as JSON.`;

    try {
      const response = await this.llmProvider.callLLM(prompt);
      const structure = JsonExtractor.extractJSONFromResponse(response.content);

      return {
        structure,
      };
    } catch (error) {
      throw new Error(`Failed to create documentation structure: ${error}`);
    }
  }

  private async addCodeExamples(context: DocumentationContext): Promise<any> {
    const prompt = `Add code examples for this class:

Class: ${context.className}
Methods: ${context.methods.join(", ")}

Source Code:
\`\`\`
${context.sourceCode}
\`\`\`

Generate comprehensive code examples including:
1. Basic usage examples
2. Advanced usage patterns
3. Error handling examples
4. Integration examples

Return the examples as a string.`;

    try {
      const response = await this.llmProvider.callLLM(prompt);
      return {
        examples: response.content,
      };
    } catch (error) {
      throw new Error(`Failed to add code examples: ${error}`);
    }
  }

  private async validateDocumentation(documentation: string): Promise<any> {
    const prompt = `Validate this documentation for completeness and accuracy:

\`\`\`
${documentation}
\`\`\`

Check for:
1. Completeness of information
2. Accuracy of technical details
3. Clarity of explanations
4. Consistency in formatting
5. Missing sections

Return a JSON object with validation results.`;

    try {
      const response = await this.llmProvider.callLLM(prompt);
      const validation = JsonExtractor.extractJSONFromResponse(
        response.content
      );

      return {
        validationResults: validation,
      };
    } catch (error) {
      throw new Error(`Failed to validate documentation: ${error}`);
    }
  }
}
