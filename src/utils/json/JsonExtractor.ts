import * as JSON5 from "json5";
import { Logger, debugOutputChannel } from '../logging/Logger';

const stripJsonComments = require("strip-json-comments");

export class JsonExtractor {
  // JSON extraction utility using JSON5 and strip-json-comments for better tolerance
  static extractJSONFromResponse(response: string): any {
    // Clean the response first - remove any trailing error messages or stack traces
    const cleanedResponse = response.replace(/SyntaxError.*$/s, '').trim();

    // First, try to find JSON blocks with more specific patterns
    const jsonPatterns = [
      // Look for JSON blocks that might be wrapped in ```json or ``` blocks
      /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g,
      // Look for JSON blocks that might be wrapped in ``` blocks without json specifier
      /```\s*(\{[\s\S]*?\})\s*```/g,
      // Look for JSON blocks that start with { and end with } (non-greedy)
      /\{[\s\S]*?\}/g
    ];

    for (const pattern of jsonPatterns) {
      const matches = response.match(pattern);
      if (matches) {
        for (const match of matches) {
          try {
            // Clean up the match - remove markdown code block markers if present
            let jsonStr = match;
            if (match.startsWith('```')) {
              // Extract content from markdown code blocks
              const contentMatch = match.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
              if (contentMatch) {
                jsonStr = contentMatch[1];
              }
            }

            // Try multiple parsing strategies
            const parsingStrategies = [
              // Strategy 1: JSON5 (most tolerant)
              () => {
                const parsed = JSON5.parse(jsonStr);
                Logger.logDebug(debugOutputChannel, `[JSON Extraction] Successfully parsed with JSON5`);
                return parsed;
              },
              // Strategy 2: Strip comments then JSON5
              () => {
                const stripped = stripJsonComments(jsonStr);
                const parsed = JSON5.parse(stripped);
                Logger.logDebug(debugOutputChannel, `[JSON Extraction] Successfully parsed with strip-comments + JSON5`);
                return parsed;
              },
              // Strategy 3: Clean then regular JSON
              () => {
                const cleaned = JsonExtractor.cleanJsonString(jsonStr);
                const parsed = JSON.parse(cleaned);
                Logger.logDebug(debugOutputChannel, `[JSON Extraction] Successfully parsed with clean + regular JSON`);
                return parsed;
              },
              // Strategy 4: Strip comments then regular JSON
              () => {
                const stripped = stripJsonComments(jsonStr);
                const cleaned = JsonExtractor.cleanJsonString(stripped);
                const parsed = JSON.parse(cleaned);
                Logger.logDebug(debugOutputChannel, `[JSON Extraction] Successfully parsed with strip-comments + clean + regular JSON`);
                return parsed;
              }
            ];

            for (const strategy of parsingStrategies) {
              try {
                const parsed = strategy();
                if (parsed && typeof parsed === 'object') {
                  // Check if it has violations array or other expected properties
                  if (parsed.violations || parsed.summary || Object.keys(parsed).length > 0) {
                    Logger.logDebug(debugOutputChannel, `[JSON Extraction] Successfully extracted JSON:`, parsed);
                    return parsed;
                  }
                }
              } catch (error) {
                // Continue to next strategy
                continue;
              }
            }
          } catch (parseError) {
            Logger.logDebug(debugOutputChannel, `[JSON Extraction] Failed to parse JSON block: ${parseError}`);
            continue;
          }
        }
      }
    }

    // If no valid JSON found, try to extract the largest JSON-like structure
    try {
      // Find all potential JSON objects in the response using a more robust pattern
      const allMatches = response.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
      if (allMatches) {
        // Sort by length (longest first) to get the most complete JSON
        allMatches.sort((a, b) => b.length - a.length);

        for (const match of allMatches) {
          const parsingStrategies = [
            () => JSON5.parse(match),
            () => JSON5.parse(stripJsonComments(match)),
            () => JSON.parse(JsonExtractor.cleanJsonString(match)),
            () => JSON.parse(JsonExtractor.cleanJsonString(stripJsonComments(match)))
          ];

          for (const strategy of parsingStrategies) {
            try {
              const parsed = strategy();
              if (parsed && typeof parsed === 'object') {
                Logger.logDebug(debugOutputChannel, `[JSON Extraction] Found JSON using fallback strategy:`, parsed);
                return parsed;
              }
            } catch (error) {
              continue;
            }
          }
        }
      }
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[JSON Extraction] Fallback extraction failed: ${error}`);
    }

    // Last resort: try to fix common JSON issues and parse
    try {
      const fixedJson = JsonExtractor.fixCommonJsonIssues(cleanedResponse);
      if (fixedJson) {
        const parsingStrategies = [
          () => JSON5.parse(fixedJson),
          () => JSON5.parse(stripJsonComments(fixedJson)),
          () => JSON.parse(fixedJson),
          () => JSON.parse(stripJsonComments(fixedJson))
        ];

        for (const strategy of parsingStrategies) {
          try {
            const parsed = strategy();
            if (parsed && typeof parsed === 'object') {
              Logger.logDebug(debugOutputChannel, `[JSON Extraction] Found JSON using fix method:`, parsed);
              return parsed;
            }
          } catch (error) {
            continue;
          }
        }
      }
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[JSON Extraction] Fix method failed: ${error}`);
    }

    throw new Error('No valid JSON found in LLM response');
  }

  // Helper function to clean JSON string
  private static cleanJsonString(jsonStr: string): string {
    return jsonStr
      .trim()
      // Remove any trailing commas before closing braces/brackets
      .replace(/,(\s*[}\]])/g, '$1')
      // Remove any trailing commas in objects
      .replace(/,(\s*})/g, '$1')
      // Remove any trailing commas in arrays
      .replace(/,(\s*\])/g, '$1')
      // Fix unescaped quotes in strings
      .replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"')
      // Remove any control characters
      .replace(/[\x00-\x1F\x7F]/g, '');
  }

  // Helper function to fix common JSON issues
  private static fixCommonJsonIssues(response: string): string | null {
    // Try to find the largest JSON-like structure and fix it
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {return null;}

    let jsonStr = jsonMatch[0];

    // Fix common issues
    jsonStr = jsonStr
      // Remove trailing commas
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix unescaped quotes
      .replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"')
      // Remove control characters
      .replace(/[\x00-\x1F\x7F]/g, '');

    return jsonStr;
  }
}
