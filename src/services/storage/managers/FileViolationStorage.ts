import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  Violation,
  ReviewResult,
  ViolationStorage,
} from "../../../types/violation";

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
    return path.join(
      workspaceFolder.uri.fsPath,
      ".vscode",
      "ai-reviewer-violations.json"
    );
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
      const filteredResults = existingResults.filter(
        (r) => r.file !== result.file
      );
      const updatedResults = [...filteredResults, result];
      fs.writeFileSync(
        this.storagePath,
        JSON.stringify(updatedResults, null, 2),
        "utf8"
      );
      return true;
    } catch (error) {
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
      return results;
    } catch (error) {
      return [];
    }
  }

  public async loadReviewResultById(id: string): Promise<ReviewResult | null> {
    try {
      const results = await this.loadReviewResults();
      return results.find((r) => r.id === id) || null;
    } catch (error) {
      return null;
    }
  }

  public async deleteReviewResult(id: string): Promise<boolean> {
    try {
      const results = await this.loadReviewResults();
      const filteredResults = results.filter((r) => r.id !== id);
      if (filteredResults.length === results.length) {
        return false; // No result found with this ID
      }
      fs.writeFileSync(
        this.storagePath,
        JSON.stringify(filteredResults, null, 2),
        "utf8"
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  public async clearAllResults(): Promise<boolean> {
    try {
      if (fs.existsSync(this.storagePath)) {
        fs.unlinkSync(this.storagePath);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  public async updateViolationStatus(
    reviewId: string,
    violationIndex: number,
    status: "approved" | "rejected",
    note?: string
  ): Promise<boolean> {
    try {
      const results = await this.loadReviewResults();
      const result = results.find((r) => r.id === reviewId);
      if (!result) {
        return false; // Review result not found
      }
      const violations = result.violations.map((violation, index) =>
        index === violationIndex
          ? { ...violation, status, reviewNote: note }
          : violation
      );
      const updatedResult = {
        ...result,
        violations,
        lastReviewTimestamp: Date.now(),
      };
      await this.saveReviewResult(updatedResult);
      return true;
    } catch (error) {
      return false;
    }
  }

  public async getViolationsForReReview(
    file: string
  ): Promise<{ approved: Violation[]; rejected: Violation[] }> {
    try {
      if (!file || typeof file !== "string") {
        return { approved: [], rejected: [] };
      }
      const results = await this.loadReviewResults();
      const fileName = file.split(/[\\/]/).pop() || file;
      const filesWithViolations = results.filter((r) => {
        if (!r.file || typeof r.file !== "string") {
          return false;
        }
        const resultFileName = r.file.split(/[\\/]/).pop() || r.file;
        return resultFileName === fileName && r.violations.length > 0;
      });
      if (filesWithViolations.length > 0) {
        const result = filesWithViolations[0];
        const approvedViolations = result.violations.filter(
          (v) => v.status === "approved"
        );
        const rejectedViolations = result.violations.filter(
          (v) => v.status === "rejected"
        );
        return { approved: approvedViolations, rejected: rejectedViolations };
      }
      return { approved: [], rejected: [] };
    } catch (error) {
      return { approved: [], rejected: [] };
    }
  }
}
