import * as vscode from "vscode";
import { Logger, VSCodeUtils, debugOutputChannel } from '../../../utils';
import * as path from "path";
import * as fs from "fs";
import { Violation, ReviewResult, ViolationStorage } from '../../../types/violation';

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
      const filteredResults = existingResults.filter(r => r.file !== result.file);
      const updatedResults = [...filteredResults, result];
      fs.writeFileSync(this.storagePath, JSON.stringify(updatedResults, null, 2), "utf8");
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Saved review result for ${result.file}`, {
        violationsCount: result.violations.length,
        timestamp: new Date(result.timestamp).toISOString()
      });
      return true;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Failed to save review result:`, error);
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
      results.forEach((result, index) => {
        Logger.logDebug(debugOutputChannel, `[ViolationStorage] Loaded review result ${index}:`, {
          file: result.file,
          violationsCount: result.violations.length,
          violationsStatus: result.violations.map(v => ({
            line: v.line,
            status: v.status,
            hasStatus: v.hasOwnProperty('status')
          }))
        });
      });
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Loaded ${results.length} review results`);
      return results;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Failed to load review results:`, error);
      return [];
    }
  }

  public async loadReviewResultById(id: string): Promise<ReviewResult | null> {
    try {
      const results = await this.loadReviewResults();
      return results.find(r => r.id === id) || null;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Failed to load review result by ID ${id}:`, error);
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
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Deleted review result with ID ${id}`);
      return true;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Failed to delete review result ${id}:`, error);
      return false;
    }
  }

  public async clearAllResults(): Promise<boolean> {
    try {
      if (fs.existsSync(this.storagePath)) {
        fs.unlinkSync(this.storagePath);
      }
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Cleared all review results`);
      return true;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Failed to clear all results:`, error);
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
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Updated violation status for review ${reviewId}`, {
        violationIndex,
        status,
        note
      });
      return true;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Failed to update violation status:`, error);
      return false;
    }
  }

  public async getViolationsForReReview(file: string): Promise<{ approved: Violation[], rejected: Violation[] }> {
    try {
      if (!file || typeof file !== 'string') {
        Logger.logDebug(debugOutputChannel, `[ViolationStorage] Invalid file parameter:`, file);
        return { approved: [], rejected: [] };
      }
      const results = await this.loadReviewResults();
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Searching for violations for file: ${file}`);
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Available results:`, results.map(r => ({
        file: r.file,
        violationsCount: r.violations.length,
        hasApproved: r.violations.some(v => v.status === "approved"),
        hasRejected: r.violations.some(v => v.status === "rejected"),
        violationsStatus: r.violations.map(v => ({ line: v.line, status: v.status }))
      })));
      const fileName = file.split(/[\\/]/).pop() || file;
      const filesWithViolations = results.filter(r => {
        if (!r.file || typeof r.file !== 'string') {
          return false;
        }
        const resultFileName = r.file.split(/[\\/]/).pop() || r.file;
        return resultFileName === fileName && r.violations.length > 0;
      });
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Files with violations matching filename ${fileName}:`,
        filesWithViolations.map(r => ({
          file: r.file,
          violationsCount: r.violations.length,
          hasApproved: r.violations.some(v => v.status === "approved"),
          hasRejected: r.violations.some(v => v.status === "rejected")
        }))
      );
      if (filesWithViolations.length > 0) {
        const result = filesWithViolations[0];
        Logger.logDebug(debugOutputChannel, `[ViolationStorage] Using file with violations:`, {
          file: result.file,
          violationsCount: result.violations.length
        });
        const approvedViolations = result.violations.filter(v => v.status === "approved");
        const rejectedViolations = result.violations.filter(v => v.status === "rejected");
        Logger.logDebug(debugOutputChannel, `[ViolationStorage] Loaded ${approvedViolations.length} approved and ${rejectedViolations.length} rejected violations for review ${file}`);
        Logger.logDebug(debugOutputChannel, `[ViolationStorage] Approved violations:`, approvedViolations.map(v => ({ line: v.line, message: v.message })));
        Logger.logDebug(debugOutputChannel, `[ViolationStorage] Rejected violations:`, rejectedViolations.map(v => ({ line: v.line, message: v.message })));
        return { approved: approvedViolations, rejected: rejectedViolations };
      }
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] No violations found for file: ${file}`);
      return { approved: [], rejected: [] };
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[ViolationStorage] Failed to get violations for re-review:`, error);
      return { approved: [], rejected: [] };
    }
  }
}