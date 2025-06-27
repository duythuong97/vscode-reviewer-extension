import * as JSON5 from "json5";
import { Logger, debugOutputChannel } from '../logging/Logger';

const stripJsonComments = require("strip-json-comments");

export class JsonExtractor {
  // JSON extraction utility using JSON5 and strip-json-comments for better tolerance
  static extractJSONFromResponse(response: string): any {
    // Clean the response first - remove any trailing error messages or stack traces
    const cleanedResponse = response.replace(/SyntaxError.*$/s, '').trim();

    // First, try to find JSON blocks with more specific patterns
    // Prioritize arrays first, then objects
    const jsonPatterns = [
      // Look for JSON arrays that might be wrapped in ```json or ``` blocks
      /```(?:json)?\s*(\[[\s\S]*?\])\s*```/g,
      // Look for JSON arrays that might be wrapped in ``` blocks without json specifier
      /```\s*(\[[\s\S]*?\])\s*```/g,
      // Look for JSON arrays that start with [ and end with ] (greedy to capture full array)
      /\[[\s\S]*\]/g,
      // Look for JSON blocks that might be wrapped in ```json or ``` blocks (objects)
      /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g,
      // Look for JSON blocks that might be wrapped in ``` blocks without json specifier (objects)
      /```\s*(\{[\s\S]*?\})\s*```/g,
      // Look for JSON blocks that start with { and end with } (non-greedy) - objects
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
              // Extract content from markdown code blocks (both objects and arrays)
              const objectMatch = match.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
              const arrayMatch = match.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
              if (objectMatch) {
                jsonStr = objectMatch[1];
              } else if (arrayMatch) {
                jsonStr = arrayMatch[1];
              }
            }

            // Try multiple parsing strategies
            const parsingStrategies = [
              // Strategy 1: JSON5 (most tolerant)
              () => {
                const parsed = JSON5.parse(jsonStr);
                return parsed;
              },
              // Strategy 2: Strip comments then JSON5
              () => {
                const stripped = stripJsonComments(jsonStr);
                const parsed = JSON5.parse(stripped);
                return parsed;
              },
              // Strategy 3: Clean then regular JSON
              () => {
                const cleaned = JsonExtractor.cleanJsonString(jsonStr);
                const parsed = JSON.parse(cleaned);
                return parsed;
              },
              // Strategy 4: Strip comments then regular JSON
              () => {
                const stripped = stripJsonComments(jsonStr);
                const cleaned = JsonExtractor.cleanJsonString(stripped);
                const parsed = JSON.parse(cleaned);
                return parsed;
              }
            ];

            for (const strategy of parsingStrategies) {
              try {
                const parsed = strategy();
                if (parsed && (typeof parsed === 'object' || Array.isArray(parsed))) {
                  // Check if it has violations array or other expected properties, or is a valid array
                  if (parsed.violations || parsed.summary || Array.isArray(parsed) || Object.keys(parsed).length > 0) {
                    console.log("Successfully parsed JSON:", typeof parsed, Array.isArray(parsed) ? `Array with ${parsed.length} items` : "Object");
                    return parsed;
                  }
                }
              } catch (error) {
                // Continue to next strategy
                continue;
              }
            }
          } catch (parseError) {
            continue;
          }
        }
      }
    }

    // If no valid JSON found, try to extract the largest JSON-like structure
    try {
      // Find all potential JSON objects and arrays in the response using a more robust pattern
      const allMatches = response.match(/(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})|(?:\[[^\[\]]*(?:\{[^{}]*\}[^\[\]]*)*\])/g);
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
              if (parsed && (typeof parsed === 'object' || Array.isArray(parsed))) {
                console.log("Successfully parsed JSON from fallback:", typeof parsed, Array.isArray(parsed) ? `Array with ${parsed.length} items` : "Object");
                return parsed;
              }
            } catch (error) {
              continue;
            }
          }
        }
      }
    } catch (error) {
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
            if (parsed && (typeof parsed === 'object' || Array.isArray(parsed))) {
              console.log("Successfully parsed JSON from last resort:", typeof parsed, Array.isArray(parsed) ? `Array with ${parsed.length} items` : "Object");
              return parsed;
            }
          } catch (error) {
            continue;
          }
        }
      }
    } catch (error) {
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
    // Try to find the largest JSON-like structure and fix it (both objects and arrays)
    const objectMatch = response.match(/\{[\s\S]*\}/);
    const arrayMatch = response.match(/\[[\s\S]*\]/);

    let jsonStr = null;
    if (objectMatch && arrayMatch) {
      // If both found, use the longer one
      jsonStr = objectMatch[0].length > arrayMatch[0].length ? objectMatch[0] : arrayMatch[0];
    } else if (objectMatch) {
      jsonStr = objectMatch[0];
    } else if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }

    if (!jsonStr) {return null;}

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
