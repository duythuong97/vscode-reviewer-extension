import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { debugOutputChannel, logDebug } from "./utils";

export interface Violation {
  line: number;
  severity: "high" | "medium" | "low";
  message: string;
  originalCode?: string;
  suggestion?: string;
  status?: "pending" | "approved" | "rejected";
  reviewNote?: string;
}

export interface ReviewResult {
  id: string;
  file: string;
  violations: Violation[];
  summary: string;
  timestamp: number;
  status: "completed" | "failed";
  approvedViolations?: Violation[];
  rejectedViolations?: Violation[];
  lastReviewTimestamp?: number;
}

export interface ViolationStorage {
  saveReviewResult(result: ReviewResult): Promise<boolean>;
  loadReviewResults(): Promise<ReviewResult[]>;
  loadReviewResultById(id: string): Promise<ReviewResult | null>;
  deleteReviewResult(id: string): Promise<boolean>;
  clearAllResults(): Promise<boolean>;
  updateViolationStatus(reviewId: string, violationIndex: number, status: "approved" | "rejected", note?: string): Promise<boolean>;
  getViolationsForReReview(file: string): Promise<{ approved: Violation[], rejected: Violation[] }>;
}

export class FileViolationStorage implements ViolationStorage {
  private storagePath: string;

  constructor() {
    this.storagePath = this.getStoragePath();
    this.ensureStorageDirectory();
  }

  private getStoragePath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }
    return path.join(workspaceFolder.uri.fsPath, ".vscode", "ai-reviewer-violations.json");
  }

  private ensureStorageDirectory(): void {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public async saveReviewResult(result: ReviewResult): Promise<boolean> {
    try {
      const existingResults = await this.loadReviewResults();

      // Remove existing result with same file if exists
      const filteredResults = existingResults.filter(r => r.file !== result.file);

      // Add new result
      const updatedResults = [...filteredResults, result];

      // Save to file
      fs.writeFileSync(this.storagePath, JSON.stringify(updatedResults, null, 2), "utf8");

      logDebug(debugOutputChannel, `[ViolationStorage] Saved review result for ${result.file}`, {
        violationsCount: result.violations.length,
        timestamp: new Date(result.timestamp).toISOString()
      });

      return true;
    } catch (error) {
      logDebug(debugOutputChannel, `[ViolationStorage] Failed to save review result:`, error);
      return false;
    }
  }

  public async loadReviewResults(): Promise<ReviewResult[]> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return [];
      }

      const content = fs.readFileSync(this.storagePath, "utf8");
      const results = JSON.parse(content) as ReviewResult[];

      // Debug: Log violations status for each result
      results.forEach((result, index) => {
        logDebug(debugOutputChannel, `[ViolationStorage] Loaded review result ${index}:`, {
          file: result.file,
          violationsCount: result.violations.length,
          violationsStatus: result.violations.map(v => ({
            line: v.line,
            status: v.status,
            hasStatus: v.hasOwnProperty('status')
          }))
        });
      });

      logDebug(debugOutputChannel, `[ViolationStorage] Loaded ${results.length} review results`);

      return results;
    } catch (error) {
      logDebug(debugOutputChannel, `[ViolationStorage] Failed to load review results:`, error);
      return [];
    }
  }

  public async loadReviewResultById(id: string): Promise<ReviewResult | null> {
    try {
      const results = await this.loadReviewResults();
      return results.find(r => r.id === id) || null;
    } catch (error) {
      logDebug(debugOutputChannel, `[ViolationStorage] Failed to load review result by ID ${id}:`, error);
      return null;
    }
  }

  public async deleteReviewResult(id: string): Promise<boolean> {
    try {
      const results = await this.loadReviewResults();
      const filteredResults = results.filter(r => r.id !== id);

      if (filteredResults.length === results.length) {
        return false; // No result found with this ID
      }

      fs.writeFileSync(this.storagePath, JSON.stringify(filteredResults, null, 2), "utf8");

      logDebug(debugOutputChannel, `[ViolationStorage] Deleted review result with ID ${id}`);

      return true;
    } catch (error) {
      logDebug(debugOutputChannel, `[ViolationStorage] Failed to delete review result ${id}:`, error);
      return false;
    }
  }

  public async clearAllResults(): Promise<boolean> {
    try {
      if (fs.existsSync(this.storagePath)) {
        fs.unlinkSync(this.storagePath);
      }

      logDebug(debugOutputChannel, `[ViolationStorage] Cleared all review results`);

      return true;
    } catch (error) {
      logDebug(debugOutputChannel, `[ViolationStorage] Failed to clear all results:`, error);
      return false;
    }
  }

  public async updateViolationStatus(reviewId: string, violationIndex: number, status: "approved" | "rejected", note?: string): Promise<boolean> {
    try {
      const results = await this.loadReviewResults();
      const result = results.find(r => r.id === reviewId);

      if (!result) {
        return false; // Review result not found
      }

      const violations = result.violations.map((violation, index) =>
        index === violationIndex ? { ...violation, status, reviewNote: note } : violation
      );

      const updatedResult = {
        ...result,
        violations,
        lastReviewTimestamp: Date.now()
      };

      await this.saveReviewResult(updatedResult);

      logDebug(debugOutputChannel, `[ViolationStorage] Updated violation status for review ${reviewId}`, {
        violationIndex,
        status,
        note
      });

      return true;
    } catch (error) {
      logDebug(debugOutputChannel, `[ViolationStorage] Failed to update violation status:`, error);
      return false;
    }
  }

  public async getViolationsForReReview(file: string): Promise<{ approved: Violation[], rejected: Violation[] }> {
    try {
      // Validate input
      if (!file || typeof file !== 'string') {
        logDebug(debugOutputChannel, `[ViolationStorage] Invalid file parameter:`, file);
        return { approved: [], rejected: [] };
      }

      const results = await this.loadReviewResults();

      logDebug(debugOutputChannel, `[ViolationStorage] Searching for violations for file: ${file}`);
      logDebug(debugOutputChannel, `[ViolationStorage] Available results:`, results.map(r => ({
        file: r.file,
        violationsCount: r.violations.length,
        hasApproved: r.violations.some(v => v.status === "approved"),
        hasRejected: r.violations.some(v => v.status === "rejected"),
        violationsStatus: r.violations.map(v => ({ line: v.line, status: v.status }))
      })));

      // First, try to find files with violations that match the target file
      const fileName = file.split(/[\\/]/).pop() || file;
      const filesWithViolations = results.filter(r => {
        if (!r.file || typeof r.file !== 'string') {
          return false;
        }
        const resultFileName = r.file.split(/[\\/]/).pop() || r.file;
        return resultFileName === fileName && r.violations.length > 0;
      });

      logDebug(debugOutputChannel, `[ViolationStorage] Files with violations matching filename ${fileName}:`,
        filesWithViolations.map(r => ({
          file: r.file,
          violationsCount: r.violations.length,
          hasApproved: r.violations.some(v => v.status === "approved"),
          hasRejected: r.violations.some(v => v.status === "rejected")
        }))
      );

      // If we found files with violations, use the first one
      if (filesWithViolations.length > 0) {
        const result = filesWithViolations[0];
        logDebug(debugOutputChannel, `[ViolationStorage] Using file with violations:`, {
          file: result.file,
          violationsCount: result.violations.length
        });

        const approvedViolations = result.violations.filter(v => v.status === "approved");
        const rejectedViolations = result.violations.filter(v => v.status === "rejected");

        logDebug(debugOutputChannel, `[ViolationStorage] Loaded ${approvedViolations.length} approved and ${rejectedViolations.length} rejected violations for review ${file}`);
        logDebug(debugOutputChannel, `[ViolationStorage] Approved violations:`, approvedViolations.map(v => ({ line: v.line, message: v.message })));
        logDebug(debugOutputChannel, `[ViolationStorage] Rejected violations:`, rejectedViolations.map(v => ({ line: v.line, message: v.message })));

        return { approved: approvedViolations, rejected: rejectedViolations };
      }

      // Fallback to original matching logic if no files with violations found
      let result = results.find(r => r.file === file);
      logDebug(debugOutputChannel, `[ViolationStorage] Exact match result:`, result ? { file: result.file, violationsCount: result.violations.length } : 'No exact match');

      if (!result) {
        // Try matching by filename only
        logDebug(debugOutputChannel, `[ViolationStorage] Trying to match by filename: ${fileName}`);
        result = results.find(r => {
          if (!r.file || typeof r.file !== 'string') {
            return false;
          }
          const resultFileName = r.file.split(/[\\/]/).pop() || r.file;
          const match = resultFileName === fileName;
          logDebug(debugOutputChannel, `[ViolationStorage] Filename comparison:`, {
            resultFile: r.file,
            resultFileName: resultFileName,
            targetFileName: fileName,
            match: match
          });
          return match;
        });
        logDebug(debugOutputChannel, `[ViolationStorage] Filename match result:`, result ? { file: result.file, violationsCount: result.violations.length } : 'No filename match');
      }

      if (!result) {
        // Try matching by file path containing
        logDebug(debugOutputChannel, `[ViolationStorage] Trying to match by path containing`);
        result = results.find(r => {
          if (!r.file || typeof r.file !== 'string') {
            return false;
          }
          const match = r.file.includes(file) || file.includes(r.file);
          logDebug(debugOutputChannel, `[ViolationStorage] Path contains comparison:`, {
            resultFile: r.file,
            targetFile: file,
            resultContainsTarget: r.file.includes(file),
            targetContainsResult: file.includes(r.file),
            match: match
          });
          return match;
        });
        logDebug(debugOutputChannel, `[ViolationStorage] Path contains match result:`, result ? { file: result.file, violationsCount: result.violations.length } : 'No path contains match');
      }

      if (!result) {
        // Try matching by relative path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder && workspaceFolder.uri && workspaceFolder.uri.fsPath) {
          const relativePath = file.replace(workspaceFolder.uri.fsPath, '').replace(/^[\\/]/, '');
          logDebug(debugOutputChannel, `[ViolationStorage] Trying to match by relative path: ${relativePath}`);
          result = results.find(r => {
            if (!r.file || typeof r.file !== 'string') {
              return false;
            }
            const match = r.file.includes(relativePath) || relativePath.includes(r.file);
            logDebug(debugOutputChannel, `[ViolationStorage] Relative path comparison:`, {
              resultFile: r.file,
              relativePath: relativePath,
              resultContainsRelative: r.file.includes(relativePath),
              relativeContainsResult: relativePath.includes(r.file),
              match: match
            });
            return match;
          });
          logDebug(debugOutputChannel, `[ViolationStorage] Relative path match result:`, result ? { file: result.file, violationsCount: result.violations.length } : 'No relative path match');
        }
      }

      if (!result) {
        // Try matching by normalized paths
        logDebug(debugOutputChannel, `[ViolationStorage] Trying to match by normalized paths`);
        const normalizePath = (p: string) => {
          if (!p || typeof p !== 'string') return '';
          return p.replace(/[\\/]/g, '/').toLowerCase();
        };
        const normalizedFile = normalizePath(file);
        result = results.find(r => {
          if (!r.file || typeof r.file !== 'string') {
            return false;
          }
          const normalizedResult = normalizePath(r.file);
          const match = normalizedResult === normalizedFile;
          logDebug(debugOutputChannel, `[ViolationStorage] Normalized path comparison:`, {
            resultFile: r.file,
            normalizedResult: normalizedResult,
            targetFile: file,
            normalizedTarget: normalizedFile,
            match: match
          });
          return match;
        });
        logDebug(debugOutputChannel, `[ViolationStorage] Normalized path match result:`, result ? { file: result.file, violationsCount: result.violations.length } : 'No normalized path match');
      }

      if (!result) {
        logDebug(debugOutputChannel, `[ViolationStorage] No review result found for file: ${file}`);
        logDebug(debugOutputChannel, `[ViolationStorage] Available files:`, results.map(r => r.file));
        return { approved: [], rejected: [] };
      }

      logDebug(debugOutputChannel, `[ViolationStorage] Found review result:`, {
        file: result.file,
        violationsCount: result.violations.length,
        violations: result.violations.map(v => ({
          line: v.line,
          status: v.status,
          message: v.message.substring(0, 50) + "..."
        }))
      });

      const approvedViolations = result.violations.filter(v => v.status === "approved");
      const rejectedViolations = result.violations.filter(v => v.status === "rejected");

      logDebug(debugOutputChannel, `[ViolationStorage] Loaded ${approvedViolations.length} approved and ${rejectedViolations.length} rejected violations for review ${file}`);
      logDebug(debugOutputChannel, `[ViolationStorage] Approved violations:`, approvedViolations.map(v => ({ line: v.line, message: v.message })));
      logDebug(debugOutputChannel, `[ViolationStorage] Rejected violations:`, rejectedViolations.map(v => ({ line: v.line, message: v.message })));

      return { approved: approvedViolations, rejected: rejectedViolations };
    } catch (error) {
      logDebug(debugOutputChannel, `[ViolationStorage] Failed to load violations for re-review:`, error);
      return { approved: [], rejected: [] };
    }
  }
}

// Future API implementation example (for easy replacement)
export class APIViolationStorage implements ViolationStorage {
  private apiEndpoint: string;
  private apiKey?: string;

  constructor(apiEndpoint: string, apiKey?: string) {
    this.apiEndpoint = apiEndpoint;
    this.apiKey = apiKey;
  }

  public async saveReviewResult(result: ReviewResult): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify(result)
      });

      return response.ok;
    } catch (error) {
      logDebug(debugOutputChannel, `[APIViolationStorage] Failed to save review result:`, error);
      return false;
    }
  }

  public async loadReviewResults(): Promise<ReviewResult[]> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results`, {
        headers: {
          ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` })
        }
      });

      if (response.ok) {
        return await response.json() as ReviewResult[];
      }

      return [];
    } catch (error) {
      logDebug(debugOutputChannel, `[APIViolationStorage] Failed to load review results:`, error);
      return [];
    }
  }

  public async loadReviewResultById(id: string): Promise<ReviewResult | null> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results/${id}`, {
        headers: {
          ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` })
        }
      });

      if (response.ok) {
        return await response.json() as ReviewResult;
      }

      return null;
    } catch (error) {
      logDebug(debugOutputChannel, `[APIViolationStorage] Failed to load review result by ID ${id}:`, error);
      return null;
    }
  }

  public async deleteReviewResult(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results/${id}`, {
        method: "DELETE",
        headers: {
          ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` })
        }
      });

      return response.ok;
    } catch (error) {
      logDebug(debugOutputChannel, `[APIViolationStorage] Failed to delete review result ${id}:`, error);
      return false;
    }
  }

  public async clearAllResults(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results`, {
        method: "DELETE",
        headers: {
          ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` })
        }
      });

      return response.ok;
    } catch (error) {
      logDebug(debugOutputChannel, `[APIViolationStorage] Failed to clear all results:`, error);
      return false;
    }
  }

  public async updateViolationStatus(reviewId: string, violationIndex: number, status: "approved" | "rejected", note?: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results/${reviewId}/violations/${violationIndex}/status`, {
        method: "PUT",
        headers: {
          ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status, note })
      });

      return response.ok;
    } catch (error) {
      logDebug(debugOutputChannel, `[APIViolationStorage] Failed to update violation status:`, error);
      return false;
    }
  }

  public async getViolationsForReReview(file: string): Promise<{ approved: Violation[], rejected: Violation[] }> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results/violations?file=${file}`, {
        headers: {
          ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` })
        }
      });

      if (response.ok) {
        const { approved, rejected } = await response.json() as { approved: Violation[], rejected: Violation[] };
        logDebug(debugOutputChannel, `[APIViolationStorage] Loaded ${approved.length} approved and ${rejected.length} rejected violations for file ${file}`);
        return { approved, rejected };
      }

      return { approved: [], rejected: [] };
    } catch (error) {
      logDebug(debugOutputChannel, `[APIViolationStorage] Failed to load violations for re-review:`, error);
      return { approved: [], rejected: [] };
    }
  }
}

export class ViolationStorageManager {
  private static instance: ViolationStorageManager;
  private storage: ViolationStorage;

  private constructor() {
    // Default to file storage, can be changed to API storage later
    this.storage = new FileViolationStorage();
  }

  public static getInstance(): ViolationStorageManager {
    if (!ViolationStorageManager.instance) {
      ViolationStorageManager.instance = new ViolationStorageManager();
    }
    return ViolationStorageManager.instance;
  }

  // Method to switch storage implementation (for future API migration)
  public setStorage(storage: ViolationStorage): void {
    this.storage = storage;
    logDebug(debugOutputChannel, `[ViolationStorageManager] Storage implementation changed`);
  }

  public async saveReviewResult(result: ReviewResult): Promise<boolean> {
    return this.storage.saveReviewResult(result);
  }

  public async loadReviewResults(): Promise<ReviewResult[]> {
    return this.storage.loadReviewResults();
  }

  public async loadReviewResultById(id: string): Promise<ReviewResult | null> {
    return this.storage.loadReviewResultById(id);
  }

  public async deleteReviewResult(id: string): Promise<boolean> {
    return this.storage.deleteReviewResult(id);
  }

  public async clearAllResults(): Promise<boolean> {
    return this.storage.clearAllResults();
  }

  public async updateViolationStatus(reviewId: string, violationIndex: number, status: "approved" | "rejected", note?: string): Promise<boolean> {
    return this.storage.updateViolationStatus(reviewId, violationIndex, status, note);
  }

  public async getViolationsForReReview(file: string): Promise<{ approved: Violation[], rejected: Violation[] }> {
    return this.storage.getViolationsForReReview(file);
  }

  // Helper method to create a review result
  public createReviewResult(
    file: string,
    violations: Violation[],
    summary: string,
    status: "completed" | "failed" = "completed"
  ): ReviewResult {
    // Initialize violations with pending status
    const violationsWithStatus = violations.map(violation => ({
      ...violation,
      status: "pending" as const
    }));

    return {
      id: this.generateId(),
      file,
      violations: violationsWithStatus,
      summary,
      timestamp: Date.now(),
      status
    };
  }

  private generateId(): string {
    return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}