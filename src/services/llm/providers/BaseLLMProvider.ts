import * as vscode from "vscode";
import { Logger, debugOutputChannel } from '../../../utils';
import { ConfigManager } from '../../../core/managers/ConfigManager';
import {
  LLMConfig,
  LLMResponse,
  LLMRequestBody,
  LLMAPIResponse,
  LLMError
} from '../../../types/llm';

// Abstract base class for LLM providers
export abstract class BaseLLMProvider {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  // Abstract methods that must be implemented by concrete providers
  abstract callLLM(prompt: string): Promise<LLMResponse>;
  abstract callLLMStream(
    prompt: string,
    cancellationToken: vscode.CancellationToken,
    onChunk: (chunk: string) => void
  ): Promise<void>;

  // Helper method to get configuration from ConfigManager
  static getConfigFromSettings(): LLMConfig {
    const configManager = ConfigManager.getInstance();
    const config = configManager.getLLMConfig();
    return {
      apiToken: config.apiToken,
      endpoint: config.endpoint,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      cookie: config.cookie,
      authType: config.authType,
    };
  }

  // Helper method to get provider type from ConfigManager
  static getProviderTypeFromSettings(): "ollama" | "openai" {
    const configManager = ConfigManager.getInstance();
    const config = configManager.getConfig();
    return config.providerType;
  }

  // Helper method to validate configuration
  protected validateConfig(): void {
    if (this.config.authType === "cookie") {
      if (!this.config.cookie) {
        throw new Error("Cookie is required for cookie-based authentication");
      }
    } else {
      if (!this.config.apiToken) {
        throw new Error("API token is required for token-based authentication");
      }
    }
    if (!this.config.endpoint) {
      throw new Error("LLM endpoint is required");
    }
    if (!this.config.model) {
      throw new Error("LLM model is required");
    }
  }

  // Helper method to build headers based on authentication type
  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.authType === "cookie") {
      headers["Cookie"] = this.config.cookie!;
    } else {
      headers["Authorization"] = `Bearer ${this.config.apiToken}`;
    }

    return headers;
  }

  // Helper method to build request body
  protected buildRequestBody(prompt: string, stream: boolean = false): LLMRequestBody {
    return {
      model: this.config.model,
      prompt: prompt,
      stream: stream,
      options: {
        num_predict: this.config.maxTokens,
        temperature: this.config.temperature,
      },
    };
  }

  // Helper method to handle API errors
  protected handleAPIError(response: Response, errorText: string): LLMError {
    return {
      message: `LLM API error: ${response.status} - ${response.statusText}`,
      status: response.status,
      statusText: response.statusText,
      details: errorText,
    };
  }

  // Helper method to handle network errors
  protected handleNetworkError(error: any): LLMError {
    return {
      message: `Failed to call LLM API: ${error instanceof Error ? error.message : "Unknown error"}`,
      details: error instanceof Error ? error.stack : undefined,
    };
  }
}