import * as vscode from "vscode";
import { WorkspaceFileTemplate } from "../workspaceFileTemplate";
import { VSCodeUtils } from "../../utils";

export interface AIReviewerConfig {
  // Authentication
  authType: "token" | "cookie";
  apiToken: string;
  cookie: string;

  // LLM Configuration
  llmEndpoint: string;
  providerType: "ollama" | "openai";
  llmModel: string;
  maxTokens: number;
  temperature: number;

  // Review Settings
  codingConvention: string;
  baseBranch: string;
  suggestionDisplayMode: "panel" | "inline";
  autoReview: boolean;
  severityThreshold: "low" | "medium" | "high";
  includeSuggestions: boolean;

  // UI Settings
  showNotifications: boolean;
  themeAware: boolean;
  ghostTextEnabled: boolean;

  // Advanced Settings
  debugMode: boolean;
  customPrompt: string;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: vscode.WorkspaceConfiguration;
  private workspaceFileTemplate: WorkspaceFileTemplate;

  private constructor() {
    this.config = vscode.workspace.getConfiguration("aiReviewer");
    this.workspaceFileTemplate = WorkspaceFileTemplate.getInstance();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public getConfig(): AIReviewerConfig {
    // Ensure all workspace files exist
    this.workspaceFileTemplate.ensureAllFiles();

    return {
      // Authentication
      authType: this.config.get<"token" | "cookie">("authType", "token"),
      apiToken: this.config.get<string>("apiToken", ""),
      cookie: this.config.get<string>("cookie", ""),

      // LLM Configuration
      llmEndpoint: this.config.get<string>(
        "llmEndpoint",
        "http://localhost:11434/api/generate"
      ),
      providerType: this.config.get<"ollama" | "openai">(
        "providerType",
        "ollama"
      ),
      llmModel: this.config.get<string>("llmModel", "llama3"),
      maxTokens: this.config.get<number>("maxTokens", 2000),
      temperature: this.config.get<number>("temperature", 0.7),

      // Review Settings
      codingConvention: this.workspaceFileTemplate.readFile(
        ".vscode/ai-reviewer-coding-convention.md"
      ),
      baseBranch: this.config.get<string>("baseBranch", "main"),
      suggestionDisplayMode: this.config.get<"panel" | "inline">(
        "suggestionDisplayMode",
        "panel"
      ),
      autoReview: this.config.get<boolean>("autoReview", false),
      severityThreshold: this.config.get<"low" | "medium" | "high">(
        "severityThreshold",
        "medium"
      ),
      includeSuggestions: this.config.get<boolean>("includeSuggestions", true),

      // UI Settings
      showNotifications: this.config.get<boolean>("showNotifications", true),
      themeAware: this.config.get<boolean>("themeAware", true),
      ghostTextEnabled: this.config.get<boolean>("ghostTextEnabled", true),

      // Advanced Settings
      debugMode: this.config.get<boolean>("debugMode", false),
      customPrompt: this.workspaceFileTemplate.readFile(
        ".vscode/ai-reviewer-custom-prompt.md"
      ),
    };
  }

  public async updateConfig(updates: Partial<AIReviewerConfig>): Promise<void> {
    console.log("Updating config with:", updates);

    for (const [key, value] of Object.entries(updates)) {
      console.log(`Updating setting: ${key} = ${value}`);
      if (key === "codingConvention") {
        this.workspaceFileTemplate.writeFile(
          ".vscode/ai-reviewer-coding-convention.md",
          value as string
        );
      } else if (key === "customPrompt") {
        this.workspaceFileTemplate.writeFile(
          ".vscode/ai-reviewer-custom-prompt.md",
          value as string
        );
      } else {
        await this.config.update(key, value, vscode.ConfigurationTarget.Global);
        console.log(`Updated VS Code setting: ${key} = ${value}`);
      }
    }

    // Force refresh the configuration
    this.config = vscode.workspace.getConfiguration("aiReviewer");
    console.log("Configuration refreshed");

    // Show success message
    VSCodeUtils.showSuccess("Settings saved successfully!");
  }

  public refreshConfig(): void {
    this.config = vscode.workspace.getConfiguration("aiReviewer");
  }

  public async resetToDefaults(): Promise<void> {
    // Reset all workspace files to default content
    this.workspaceFileTemplate.resetAllFiles();

    const defaultConfig: AIReviewerConfig = {
      authType: "token",
      apiToken: "",
      cookie: "",
      llmEndpoint: "http://localhost:11434/api/generate",
      providerType: "ollama",
      llmModel: "llama3",
      maxTokens: 2000,
      temperature: 0.7,
      codingConvention: this.workspaceFileTemplate.readFile(
        ".vscode/ai-reviewer-coding-convention.md"
      ),
      baseBranch: "main",
      suggestionDisplayMode: "panel",
      autoReview: false,
      severityThreshold: "medium",
      includeSuggestions: true,
      showNotifications: true,
      themeAware: true,
      ghostTextEnabled: true,
      debugMode: false,
      customPrompt: this.workspaceFileTemplate.readFile(
        ".vscode/ai-reviewer-custom-prompt.md"
      ),
    };
    await this.updateConfig(defaultConfig);

    // Show success message for reset
    VSCodeUtils.showSuccess("Settings reset to defaults successfully!");
  }

  public validateConfig(): { isValid: boolean; errors: string[] } {
    const config = this.getConfig();
    const errors: string[] = [];

    if (config.authType === "cookie") {
      if (!config.cookie) {
        errors.push("Cookie is required for cookie-based authentication");
      }
    } else {
      if (!config.apiToken) {
        errors.push("API token is required for token-based authentication");
      }
    }

    if (!config.llmEndpoint) {
      errors.push("LLM endpoint is required");
    }

    if (!config.llmModel) {
      errors.push("LLM model is required");
    }

    if (config.temperature < 0 || config.temperature > 2) {
      errors.push("Temperature must be between 0 and 2");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public getLLMConfig() {
    const config = this.getConfig();
    return {
      apiToken: config.apiToken,
      endpoint: config.llmEndpoint,
      model: config.llmModel,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      cookie: config.cookie,
      authType: config.authType,
    };
  }

  public getReviewConfig() {
    const config = this.getConfig();
    return {
      codingConvention: config.codingConvention,
      baseBranch: config.baseBranch,
      suggestionDisplayMode: config.suggestionDisplayMode,
      autoReview: config.autoReview,
      severityThreshold: config.severityThreshold,
      includeSuggestions: config.includeSuggestions,
    };
  }

  public getUIConfig() {
    const config = this.getConfig();
    return {
      showNotifications: config.showNotifications,
      themeAware: config.themeAware,
      ghostTextEnabled: config.ghostTextEnabled,
    };
  }

  // Helper methods for workspace file management
  public getWorkspaceFileTemplate(): WorkspaceFileTemplate {
    return this.workspaceFileTemplate;
  }

  public getPromptFilePaths(): { [key: string]: string } {
    return {
      codeReview: ".vscode/ai-reviewer-code-review-prompt.md",
      ghostText: ".vscode/ai-reviewer-ghost-text-prompt.md",
      codingConvention: ".vscode/ai-reviewer-coding-convention.md",
      customPrompt: ".vscode/ai-reviewer-custom-prompt.md",
    };
  }
}
