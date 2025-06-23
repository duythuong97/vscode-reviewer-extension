import * as vscode from "vscode";

// Function to call LLM
export async function callLLM(
  apiToken: string,
  prompt: string,
  endpoint: string,
  model: string
): Promise<string> {
  try {
    const requestBody = {
      model: model,
      prompt: prompt,
      stream: false,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data = (await response.json()) as { response?: string };
      const llmResponse = data.response ?? "No response received from LLM";

      return llmResponse;
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

// Function to call LLM with streaming and cancellation support
export async function callLLMStreamWithCancellation(
  apiToken: string,
  prompt: string,
  endpoint: string,
  model: string,
  cancellationToken: vscode.CancellationToken,
  onChunk: (chunk: string) => void
): Promise<void> {
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
      model: model,
      prompt: prompt,
      stream: true,
    };

    // Make the API request
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
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
