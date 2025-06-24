import * as vscode from "vscode";
import { ConfigManager } from "./configManager";
import { debugOutputChannel, logDebug } from "./extension";

// Interface for LLM configuration
export interface LLMConfig {
  apiToken: string;
  endpoint: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  cookie?: string; // For cookie-based authentication
  authType?: "token" | "cookie"; // Authentication type
}

// Interface for LLM response
export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// Interface for streaming chunk
export interface LLMChunk {
  content: string;
  isComplete: boolean;
}

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
}

// Concrete implementation for Ollama/OpenAI-compatible API
export class OllamaLLMProvider extends BaseLLMProvider {
  async callLLM(prompt: string): Promise<LLMResponse> {
    this.validateConfig();

    try {
      const requestBody = {
        model: this.config.model,
        prompt: prompt,
        stream: false,
        options: {
          num_predict: this.config.maxTokens,
          temperature: this.config.temperature,
        },
      };

      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        logDebug(debugOutputChannel, `[LLM Response] callLLM`, data);
        return {
          content: data?.response ?? "No response received from LLM",
          usage: data.usage,
        };
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

  async callLLMStream(
    prompt: string,
    cancellationToken: vscode.CancellationToken,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    this.validateConfig();

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

      const requestBody = {
        model: this.config.model,
        prompt: prompt,
        stream: true,
        options: {
          num_predict: this.config.maxTokens,
          temperature: this.config.temperature,
        },
      };

      // Make the API request
      fetch(this.config.endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `LLM API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
            );
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("Response body is not readable");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          const processStream = async () => {
            while (true) {
              // Check for cancellation before each read
              if (cancellationToken.isCancellationRequested) {
                reader.cancel();
                throw new Error("Request cancelled by user");
              }

              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.trim() === "") continue;

                try {
                  // Remove "data: " prefix if present
                  const jsonStr = line.startsWith("data: ")
                    ? line.slice(6)
                    : line;
                  if (jsonStr === "[DONE]") continue;

                  const data = JSON.parse(jsonStr) as any;
                  if (data.response) {
                    onChunk(data.response);
                  }
                } catch (e) {
                  console.error("Error parsing streaming response", {
                    line,
                    error: e,
                  });
                }
              }
            }
          };

          await processStream();
          resolve();
        })
        .catch((error) => {
          if (error.name === "AbortError") {
            reject(new Error("Request cancelled by user"));
          } else {
            reject(
              new Error(
                `Failed to call LLM API with streaming: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`
              )
            );
          }
        })
        .finally(() => {
          // Clean up cancellation listener
          cancellationListener.dispose();
        });
    });
  }
}

// Concrete implementation for OpenAI API
export class OpenAILLMProvider extends BaseLLMProvider {
  async callLLM(prompt: string): Promise<LLMResponse> {
    this.validateConfig();

    try {
      const requestBody = {
        model: this.config.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      };

      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        return {
          content:
            data.choices?.[0]?.message?.content ??
            "No response received from LLM",
          usage: data.usage,
        };
      }

      const errorText = await response.text();
      throw new Error(
        `OpenAI API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
      );
    } catch (error) {
      throw new Error(
        `Failed to call OpenAI API: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async callLLMStream(
    prompt: string,
    cancellationToken: vscode.CancellationToken,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    this.validateConfig();

    return new Promise((resolve, reject) => {
      const abortController = new AbortController();

      const cancellationListener = cancellationToken.onCancellationRequested(
        () => {
          abortController.abort();
          reject(new Error("Request cancelled by user"));
        }
      );

      const requestBody = {
        model: this.config.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
      };

      fetch(this.config.endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `OpenAI API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
            );
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("Response body is not readable");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          const processStream = async () => {
            while (true) {
              if (cancellationToken.isCancellationRequested) {
                reader.cancel();
                throw new Error("Request cancelled by user");
              }

              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.trim() === "") continue;

                try {
                  const jsonStr = line.startsWith("data: ")
                    ? line.slice(6)
                    : line;
                  if (jsonStr === "[DONE]") continue;

                  const data = JSON.parse(jsonStr) as any;
                  const content = data.choices?.[0]?.delta?.content;
                  if (content) {
                    onChunk(content);
                  }
                } catch (e) {
                  console.error("Error parsing OpenAI streaming response", {
                    line,
                    error: e,
                  });
                }
              }
            }
          };

          await processStream();
          resolve();
        })
        .catch((error) => {
          if (error.name === "AbortError") {
            reject(new Error("Request cancelled by user"));
          } else {
            reject(
              new Error(
                `Failed to call OpenAI API with streaming: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`
              )
            );
          }
        })
        .finally(() => {
          cancellationListener.dispose();
        });
    });
  }
}

// Factory class to create LLM providers
export class LLMProviderFactory {
  static createProvider(providerType?: "ollama" | "openai"): BaseLLMProvider {
    const config = BaseLLMProvider.getConfigFromSettings();
    const type = providerType || BaseLLMProvider.getProviderTypeFromSettings();

    switch (type) {
      case "openai":
        return new OpenAILLMProvider(config);
      case "ollama":
      default:
        return new OllamaLLMProvider(config);
    }
  }

  static createProviderWithConfig(
    config: LLMConfig,
    providerType: "ollama" | "openai" = "ollama"
  ): BaseLLMProvider {
    switch (providerType) {
      case "openai":
        return new OpenAILLMProvider(config);
      case "ollama":
      default:
        return new OllamaLLMProvider(config);
    }
  }
}
