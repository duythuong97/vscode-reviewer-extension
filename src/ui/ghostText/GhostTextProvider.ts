import * as vscode from "vscode";
import { Logger, VSCodeUtils, debugOutputChannel } from '../../utils';
import { LLMProviderFactory } from '../../services/llm/providers';
import { PromptManager } from '../../core/Prompts';
import { ConfigManager } from '../../core/managers/ConfigManager';

export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
  private _isEnabled: boolean = true;
  private _debounceTimer: NodeJS.Timeout | undefined;
  private configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  public setEnabled(enabled: boolean) {
    this._isEnabled = enabled;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<
    vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined
  > {
    if (!this._isEnabled) {
      return undefined;
    }

    // Debounce requests to avoid too many API calls
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    return new Promise((resolve) => {
      this._debounceTimer = setTimeout(async () => {
        try {
          const suggestions = await this.generateSuggestions(document, position, context);
          resolve(suggestions);
        } catch (error) {
          Logger.logDebug(debugOutputChannel, "Error generating ghost text suggestions", error);
          resolve(undefined);
        }
      }, 500); // 500ms debounce
    });
  }

  private async generateSuggestions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    const config = this.getConfiguration();

    if (!config.apiToken) {
      Logger.logDebug(debugOutputChannel, "Ghost text: No API token configured");
      return undefined;
    }

    // Get the current line and context
    const currentLine = document.lineAt(position.line);
    const lineText = currentLine.text;
    const cursorPosition = position.character;

    // More permissive condition - show suggestions when typing or at end of line
    if (cursorPosition < lineText.length && lineText.trim() === "") {
      Logger.logDebug(debugOutputChannel, "Ghost text: Skipping empty line");
      return undefined;
    }

    // Don't show suggestions if we're in the middle of a word (unless it's a function call)
    const currentWord =
      lineText.substring(0, cursorPosition).split(/\s+/).pop() || "";
    if (
      currentWord.length > 0 &&
      !currentWord.includes("(") &&
      !currentWord.includes("[") &&
      !currentWord.includes("{")
    ) {
      Logger.logDebug(
        debugOutputChannel,
        "Ghost text: In middle of word, skipping",
        {
          currentWord,
        }
      );
      return undefined;
    }

    // Get surrounding context (previous few lines)
    const contextLines = 5;
    const startLine = Math.max(0, position.line - contextLines);
    const contextText = [];

    for (let i = startLine; i < position.line; i++) {
      contextText.push(document.lineAt(i).text);
    }

    const contextString = contextText.join("\n");
    const currentLinePrefix = lineText.substring(0, cursorPosition);

    Logger.logDebug(debugOutputChannel, "Ghost text: Generating suggestion", {
      language: document.languageId,
      currentLine: currentLinePrefix,
      contextLines: contextText.length,
      cursorPosition: cursorPosition,
      lineLength: lineText.length,
    });

    // Create prompt for AI suggestion
    const promptManager = PromptManager.getInstance();
    const prompt = promptManager.getGhostTextPrompt(
      document,
      contextString + "\n" + currentLinePrefix
    );

    try {
      const llmProvider = LLMProviderFactory.createProvider();
      const llmResponse = await llmProvider.callLLM(prompt);
      const suggestion = llmResponse.content;

      Logger.logDebug(debugOutputChannel, "Ghost text: LLM response received", {
        originalSuggestion:
          suggestion?.substring(0, 100) +
          (suggestion && suggestion.length > 100 ? "..." : ""),
        suggestionLength: suggestion?.length || 0,
      });

      if (suggestion && suggestion.trim()) {
        // Clean and format the suggestion
        const cleanedSuggestion = this.cleanSuggestion(
          suggestion,
          currentLinePrefix
        );

        Logger.logDebug(debugOutputChannel, "Ghost text: Cleaned suggestion", {
          cleanedSuggestion: cleanedSuggestion,
          cleanedLength: cleanedSuggestion.length,
        });

        if (cleanedSuggestion) {
          // Ensure the suggestion is properly formatted for VS Code
          const finalSuggestion = cleanedSuggestion
            .replace(/\n/g, " ")
            .trim();

          if (finalSuggestion.length > 0) {
            const completionItem = new vscode.InlineCompletionItem(
              finalSuggestion,
              new vscode.Range(position, position)
            );

            // Don't add command - let VS Code handle Tab key naturally
            // This prevents double insertion

            Logger.logDebug(
              debugOutputChannel,
              "Ghost text: Returning completion item",
              {
                suggestion: finalSuggestion,
                position: position.toString(),
                suggestionLength: finalSuggestion.length,
              }
            );

            return [completionItem];
          }
        }
      }
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        "Error calling LLM for ghost text:",
        error
      );
    }

    return undefined;
  }

  private cleanSuggestion(
    suggestion: string,
    currentLinePrefix: string
  ): string {
    // Remove any markdown formatting or extra text
    let cleaned = suggestion.trim();

    // Remove common prefixes that might be included
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    }

    // Remove "Suggestion:" prefix if present
    cleaned = cleaned.replace(/^suggestion:\s*/i, "");

    // If the suggestion starts with the current line prefix, remove it
    if (cleaned.toLowerCase().startsWith(currentLinePrefix.toLowerCase())) {
      cleaned = cleaned.substring(currentLinePrefix.length);
    }

    // Remove "NO_SUGGESTION" responses
    if (cleaned.toLowerCase().includes("no_suggestion")) {
      return "";
    }

    // Remove any trailing punctuation that might be inappropriate
    cleaned = cleaned.replace(/[.!?]+$/, "");

    return cleaned;
  }

  private getConfiguration() {
    const config = this.configManager.getConfig();
    return {
      apiToken: config.apiToken,
      codingConvention: config.codingConvention
    };
  }
}