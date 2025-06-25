import * as vscode from "vscode";
import * as JSON5 from "json5";
const stripJsonComments = require("strip-json-comments");

// Create output channel for debug messages
export const debugOutputChannel =
  vscode.window.createOutputChannel("AI Reviewer Debug");

// Log debug message helper function
export function logDebug(
  channel: vscode.OutputChannel,
  message: string,
  data?: any
): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  if (data) {
    channel.appendLine(`${logMessage}\n${JSON.stringify(data, null, 2)}`);
  } else {
    channel.appendLine(logMessage);
  }
}

// JSON extraction utility using JSON5 and strip-json-comments for better tolerance
export function extractJSONFromResponse(response: string): any {
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
              logDebug(debugOutputChannel, `[JSON Extraction] Successfully parsed with JSON5`);
              return parsed;
            },
            // Strategy 2: Strip comments then JSON5
            () => {
              const stripped = stripJsonComments(jsonStr);
              const parsed = JSON5.parse(stripped);
              logDebug(debugOutputChannel, `[JSON Extraction] Successfully parsed with strip-comments + JSON5`);
              return parsed;
            },
            // Strategy 3: Clean then regular JSON
            () => {
              const cleaned = cleanJsonString(jsonStr);
              const parsed = JSON.parse(cleaned);
              logDebug(debugOutputChannel, `[JSON Extraction] Successfully parsed with clean + regular JSON`);
              return parsed;
            },
            // Strategy 4: Strip comments then regular JSON
            () => {
              const stripped = stripJsonComments(jsonStr);
              const cleaned = cleanJsonString(stripped);
              const parsed = JSON.parse(cleaned);
              logDebug(debugOutputChannel, `[JSON Extraction] Successfully parsed with strip-comments + clean + regular JSON`);
              return parsed;
            }
          ];

          for (const strategy of parsingStrategies) {
            try {
              const parsed = strategy();
              if (parsed && typeof parsed === 'object') {
                // Check if it has violations array or other expected properties
                if (parsed.violations || parsed.summary || Object.keys(parsed).length > 0) {
                  logDebug(debugOutputChannel, `[JSON Extraction] Successfully extracted JSON:`, parsed);
                  return parsed;
                }
              }
            } catch (error) {
              // Continue to next strategy
              continue;
            }
          }
        } catch (parseError) {
          logDebug(debugOutputChannel, `[JSON Extraction] Failed to parse JSON block: ${parseError}`);
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
          () => JSON.parse(cleanJsonString(match)),
          () => JSON.parse(cleanJsonString(stripJsonComments(match)))
        ];

        for (const strategy of parsingStrategies) {
          try {
            const parsed = strategy();
            if (parsed && typeof parsed === 'object') {
              logDebug(debugOutputChannel, `[JSON Extraction] Found JSON using fallback strategy:`, parsed);
              return parsed;
            }
          } catch (error) {
            continue;
          }
        }
      }
    }
  } catch (error) {
    logDebug(debugOutputChannel, `[JSON Extraction] Fallback extraction failed: ${error}`);
  }

  // Last resort: try to fix common JSON issues and parse
  try {
    const fixedJson = fixCommonJsonIssues(cleanedResponse);
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
            logDebug(debugOutputChannel, `[JSON Extraction] Found JSON using fix method:`, parsed);
            return parsed;
          }
        } catch (error) {
          continue;
        }
      }
    }
  } catch (error) {
    logDebug(debugOutputChannel, `[JSON Extraction] Fix method failed: ${error}`);
  }

  throw new Error('No valid JSON found in LLM response');
}

// Helper function to clean JSON string
function cleanJsonString(jsonStr: string): string {
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
function fixCommonJsonIssues(response: string): string | null {
  // Try to find the largest JSON-like structure and fix it
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let jsonStr = jsonMatch[0];

  // Fix common issues
  jsonStr = jsonStr
    // Remove trailing commas
    .replace(/,(\s*[}\]])/g, '$1')
    // Fix missing quotes around property names
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    // Fix single quotes to double quotes
    .replace(/'/g, '"')
    // Fix unescaped quotes in strings
    .replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"')
    // Remove any trailing text after the JSON
    .replace(/\}[^}]*$/, '}');

  // Validate that it looks like JSON
  if (jsonStr.includes('"') && jsonStr.includes('{') && jsonStr.includes('}')) {
    return jsonStr;
  }

  return null;
}

// File reading utility
export async function readFileContent(filePath: string): Promise<string> {
  try {
    const fs = require("fs");
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8");
    } else {
      throw new Error(`File not found: ${filePath}`);
    }
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error}`);
  }
}

// Progress reporting utility
export function createProgressOptions(title: string): vscode.ProgressOptions {
  return {
    location: vscode.ProgressLocation.Notification,
    title: `AI Reviewer - ${title}`,
    cancellable: false,
  };
}

// Error handling utility
export function handleError(error: any, context: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logDebug(debugOutputChannel, `[${context}] Error:`, error);
  vscode.window.showErrorMessage(`${context}: ${errorMessage}`);
}

// Success notification utility
export function showSuccess(message: string): void {
  vscode.window.showInformationMessage(message);
}

// Warning notification utility
export function showWarning(message: string): void {
  vscode.window.showWarningMessage(message);
}

// Code formatting utility with line numbers
export function formatCodeWithLineNumbers(code: string, startLineNumber: number = 1): string {
  const lines = code.split('\n');
  const formattedLines = lines.map((line, index) => {
    const lineNumber = startLineNumber + index;
    return `${lineNumber.toString().padStart(4, ' ')} | ${line}`;
  });
  return formattedLines.join('\n');
}

// Extract line number from formatted code line
export function extractLineNumberFromFormattedLine(formattedLine: string): number | null {
  const match = formattedLine.match(/^(\d+)\s*\|\s*(.*)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// Parse line number from LLM response
export function parseLineNumberFromResponse(lineReference: string): number | null {
  // Try to extract line number from various formats
  const patterns = [
    /line\s*(\d+)/i,
    /line\s*number\s*(\d+)/i,
    /at\s*line\s*(\d+)/i,
    /on\s*line\s*(\d+)/i,
    /(\d+):/,
    /^(\d+)\s*\|\s*/, // From formatted code
  ];

  for (const pattern of patterns) {
    const match = lineReference.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}
