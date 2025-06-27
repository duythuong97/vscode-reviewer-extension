import * as vscode from "vscode";
import { BaseLLMProvider } from "./BaseLLMProvider";
import { LLMResponse, LLMAPIResponse } from "../../../types/llm";

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
          progress.report({ message: "Connecting to LLM..." });

          const requestBody = this.buildRequestBody(prompt, false);

          progress.report({ message: "Sending request..." });
          console.log("Sending request:", requestBody);

          const response = await fetch(this.config.endpoint, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(requestBody),
          });

          progress.report({ message: "Processing response..." });

          if (response.ok) {
            const data = (await response.json()) as LLMAPIResponse;
            console.log("Call LLM Response:", data);
            progress.report({ message: "Response processed successfully" });

            return {
              content: data?.response ?? "No response received from LLM",
              usage: data.usage,
            };
          }

          const errorText = await response.text();
          const error = this.handleAPIError(response, errorText);
          throw new Error(error.message);
        } catch (error) {
          const networkError = this.handleNetworkError(error);
          throw new Error(networkError.message);
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
        try {
          progress.report({ message: "Connecting to LLM..." });

          const requestBody = this.buildRequestBody(prompt, true);

          progress.report({ message: "Sending streaming request..." });

          const response = await fetch(this.config.endpoint, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error = this.handleAPIError(response, errorText);
            throw new Error(error.message);
          }

          progress.report({ message: "Processing streaming response..." });

          if (!response.body) {
            throw new Error("No response body available for streaming");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          try {
            const processStream = async () => {
              while (true) {
                // Check for cancellation
                if (
                  cancellationToken.isCancellationRequested ||
                  progressCancellationToken.isCancellationRequested
                ) {
                  break;
                }

                const { done, value } = await reader.read();

                if (done) {
                  break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");

                for (const line of lines) {
                  if (line.trim() === "") {
                    continue;
                  }

                  try {
                    const jsonStr = line.startsWith("data: ")
                      ? line.slice(6)
                      : line;
                    if (jsonStr === "[DONE]") {
                      continue;
                    }

                    const data = JSON.parse(jsonStr) as LLMAPIResponse;
                    const content = data?.response || "";

                    if (content) {
                      onChunk(content);
                      progress.report({ message: "Receiving response..." });
                    }
                  } catch (parseError) {}
                }
              }
            };

            await processStream();
            progress.report({ message: "Streaming completed" });
          } finally {
            reader.releaseLock();
          }
        } catch (error) {
          const networkError = this.handleNetworkError(error);
          throw new Error(networkError.message);
        }
      }
    );
  }
}
