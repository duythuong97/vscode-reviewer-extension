import * as vscode from "vscode";
import { ConfigManager } from "./configManager";
import { debugOutputChannel, logDebug } from "./utils";

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

    // Show progress indication
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AI Reviewer - Calling LLM",
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        try {
          logDebug(
            debugOutputChannel,
            `[LLM] Starting request to ${this.config.endpoint}`
          );
          progress.report({ message: "Connecting to LLM..." });

          const requestBody = {
            model: this.config.model,
            prompt: prompt,
            stream: false,
            options: {
              num_predict: this.config.maxTokens,
              temperature: this.config.temperature,
            },
          };

          progress.report({ message: "Sending request..." });
          logDebug(debugOutputChannel, `[LLM] Request body:`, requestBody);

          const response = await fetch(this.config.endpoint, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(requestBody),
          });

          progress.report({ message: "Processing response..." });

          if (response.ok) {
            const data = (await response.json()) as any;
            logDebug(
              debugOutputChannel,
              `[LLM] Response received successfully`,
              {
                responseLength: data?.response?.length || 0,
                usage: data.usage,
              }
            );

            progress.report({ message: "Response processed successfully" });

            return {
              content: data?.response ?? "No response received from LLM",
              usage: data.usage,
            };
          }

          const errorText = await response.text();
          logDebug(
            debugOutputChannel,
            `[LLM] API Error: ${response.status} - ${response.statusText}`,
            errorText
          );
          throw new Error(
            `LLM API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
          );
        } catch (error) {
          logDebug(debugOutputChannel, `[LLM] Request failed:`, error);
          throw new Error(
            `Failed to call LLM API: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    );
  }

  async callLLMStream(
    prompt: string,
    cancellationToken: vscode.CancellationToken,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    this.validateConfig();

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AI Reviewer - Streaming LLM Response",
        cancellable: true,
      },
      async (progress, progressCancellationToken) => {
        return new Promise((resolve, reject) => {
          // Create AbortController for fetch cancellation
          const abortController = new AbortController();

          // Combine both cancellation tokens
          const combinedCancellationToken =
            new vscode.CancellationTokenSource();
          cancellationToken.onCancellationRequested(() => {
            combinedCancellationToken.cancel();
            abortController.abort();
            reject(new Error("Request cancelled by user"));
          });
          progressCancellationToken.onCancellationRequested(() => {
            combinedCancellationToken.cancel();
            abortController.abort();
            reject(new Error("Request cancelled by user"));
          });

          let chunkCount = 0;
          let totalContent = "";

          try {
            logDebug(
              debugOutputChannel,
              `[LLM Stream] Starting streaming request to ${this.config.endpoint}`
            );
            progress.report({ message: "Connecting to LLM..." });

            const requestBody = {
              model: this.config.model,
              prompt: prompt,
              stream: true,
              options: {
                num_predict: this.config.maxTokens,
                temperature: this.config.temperature,
              },
            };

            progress.report({ message: "Sending streaming request..." });
            logDebug(
              debugOutputChannel,
              `[LLM Stream] Request body:`,
              requestBody
            );

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
                  logDebug(
                    debugOutputChannel,
                    `[LLM Stream] API Error: ${response.status} - ${response.statusText}`,
                    errorText
                  );
                  throw new Error(
                    `LLM API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
                  );
                }

                progress.report({ message: "Receiving stream..." });
                logDebug(
                  debugOutputChannel,
                  `[LLM Stream] Stream started successfully`
                );

                const reader = response.body?.getReader();
                if (!reader) {
                  throw new Error("Response body is not readable");
                }

                const decoder = new TextDecoder();
                let buffer = "";

                const processStream = async () => {
                  try {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) {
                        logDebug(
                          debugOutputChannel,
                          `[LLM Stream] Stream completed`,
                          {
                            chunkCount,
                            totalLength: totalContent.length,
                          }
                        );
                        progress.report({ message: "Stream completed" });
                        resolve();
                        break;
                      }

                      buffer += decoder.decode(value, { stream: true });
                      const lines = buffer.split("\n");
                      buffer = lines.pop() || "";

                      for (const line of lines) {
                        if (line.trim() === "") continue;

                        try {
                          const data = JSON.parse(line);
                          if (data.response) {
                            chunkCount++;
                            totalContent += data.response;
                            onChunk(data.response);

                            // Update progress every 10 chunks
                            if (chunkCount % 10 === 0) {
                              progress.report({
                                message: `Received ${chunkCount} chunks (${totalContent.length} chars)`,
                              });
                            }
                          }
                        } catch (parseError) {
                          // Skip malformed JSON lines
                          continue;
                        }
                      }
                    }
                  } catch (error) {
                    logDebug(
                      debugOutputChannel,
                      `[LLM Stream] Stream processing error:`,
                      error
                    );
                    reject(error);
                  } finally {
                    reader.releaseLock();
                  }
                };

                processStream();
              })
              .catch((error) => {
                logDebug(
                  debugOutputChannel,
                  `[LLM Stream] Request failed:`,
                  error
                );
                reject(error);
              });
          } catch (error) {
            logDebug(debugOutputChannel, `[LLM Stream] Setup failed:`, error);
            reject(error);
          }
        });
      }
    );
  }
}

// Concrete implementation for OpenAI API
export class OpenAILLMProvider extends BaseLLMProvider {
  async callLLM(prompt: string): Promise<LLMResponse> {
    this.validateConfig();

    // Show progress indication
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AI Reviewer - Calling OpenAI",
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        try {
          logDebug(
            debugOutputChannel,
            `[OpenAI] Starting request to ${this.config.endpoint}`
          );
          progress.report({ message: "Connecting to OpenAI..." });

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

          progress.report({ message: "Sending request..." });
          logDebug(debugOutputChannel, `[OpenAI] Request body:`, {
            model: this.config.model,
            promptLength: prompt.length,
          });

          const response = await fetch(this.config.endpoint, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(requestBody),
          });

          progress.report({ message: "Processing response..." });

          if (response.ok) {
            const data = (await response.json()) as any;
            logDebug(
              debugOutputChannel,
              `[OpenAI] Response received successfully`,
              {
                responseLength:
                  data.choices?.[0]?.message?.content?.length || 0,
                usage: data.usage,
              }
            );

            progress.report({ message: "Response processed successfully" });

            return {
              content:
                data.choices?.[0]?.message?.content ??
                "No response received from LLM",
              usage: data.usage,
            };
          }

          const errorText = await response.text();
          logDebug(
            debugOutputChannel,
            `[OpenAI] API Error: ${response.status} - ${response.statusText}`,
            errorText
          );
          throw new Error(
            `OpenAI API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
          );
        } catch (error) {
          logDebug(debugOutputChannel, `[OpenAI] Request failed:`, error);
          throw new Error(
            `Failed to call OpenAI API: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    );
  }

  async callLLMStream(
    prompt: string,
    cancellationToken: vscode.CancellationToken,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    this.validateConfig();

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AI Reviewer - Streaming OpenAI Response",
        cancellable: true,
      },
      async (progress, progressCancellationToken) => {
        return new Promise((resolve, reject) => {
          const abortController = new AbortController();

          // Combine both cancellation tokens
          const combinedCancellationToken =
            new vscode.CancellationTokenSource();
          cancellationToken.onCancellationRequested(() => {
            combinedCancellationToken.cancel();
            abortController.abort();
            reject(new Error("Request cancelled by user"));
          });
          progressCancellationToken.onCancellationRequested(() => {
            combinedCancellationToken.cancel();
            abortController.abort();
            reject(new Error("Request cancelled by user"));
          });

          let chunkCount = 0;
          let totalContent = "";

          try {
            logDebug(
              debugOutputChannel,
              `[OpenAI Stream] Starting streaming request to ${this.config.endpoint}`
            );
            progress.report({ message: "Connecting to OpenAI..." });

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

            progress.report({ message: "Sending streaming request..." });
            logDebug(debugOutputChannel, `[OpenAI Stream] Request body:`, {
              model: this.config.model,
              promptLength: prompt.length,
            });

            fetch(this.config.endpoint, {
              method: "POST",
              headers: this.buildHeaders(),
              body: JSON.stringify(requestBody),
              signal: abortController.signal,
            })
              .then(async (response) => {
                if (!response.ok) {
                  const errorText = await response.text();
                  logDebug(
                    debugOutputChannel,
                    `[OpenAI Stream] API Error: ${response.status} - ${response.statusText}`,
                    errorText
                  );
                  throw new Error(
                    `OpenAI API error: ${response.status} - ${response.statusText}. Details: ${errorText}`
                  );
                }

                progress.report({ message: "Receiving stream..." });
                logDebug(
                  debugOutputChannel,
                  `[OpenAI Stream] Stream started successfully`
                );

                const reader = response.body?.getReader();
                if (!reader) {
                  throw new Error("Response body is not readable");
                }

                const decoder = new TextDecoder();
                let buffer = "";

                const processStream = async () => {
                  try {
                    while (true) {
                      const { done, value } = await reader.read();

                      if (done) {
                        logDebug(
                          debugOutputChannel,
                          `[OpenAI Stream] Stream completed`,
                          {
                            chunkCount,
                            totalLength: totalContent.length,
                          }
                        );
                        progress.report({ message: "Stream completed" });
                        resolve();
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
                            chunkCount++;
                            totalContent += content;
                            onChunk(content);

                            // Update progress every 10 chunks
                            if (chunkCount % 10 === 0) {
                              progress.report({
                                message: `Received ${chunkCount} chunks (${totalContent.length} chars)`,
                              });
                            }
                          }
                        } catch (parseError) {
                          // Skip malformed JSON lines
                          continue;
                        }
                      }
                    }
                  } catch (error) {
                    logDebug(
                      debugOutputChannel,
                      `[OpenAI Stream] Stream processing error:`,
                      error
                    );
                    reject(error);
                  } finally {
                    reader.releaseLock();
                  }
                };

                processStream();
              })
              .catch((error) => {
                logDebug(
                  debugOutputChannel,
                  `[OpenAI Stream] Request failed:`,
                  error
                );
                reject(error);
              });
          } catch (error) {
            logDebug(
              debugOutputChannel,
              `[OpenAI Stream] Setup failed:`,
              error
            );
            reject(error);
          }
        });
      }
    );
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
