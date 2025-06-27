import { FileViolationStorage } from "./FileViolationStorage";

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
  updateViolationStatus(
    reviewId: string,
    violationIndex: number,
    status: "approved" | "rejected",
    note?: string
  ): Promise<boolean>;
  getViolationsForReReview(
    file: string
  ): Promise<{ approved: Violation[]; rejected: Violation[] }>;
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

  public async updateViolationStatus(
    reviewId: string,
    violationIndex: number,
    status: "approved" | "rejected",
    note?: string
  ): Promise<boolean> {
    return this.storage.updateViolationStatus(
      reviewId,
      violationIndex,
      status,
      note
    );
  }

  public async getViolationsForReReview(
    file: string
  ): Promise<{ approved: Violation[]; rejected: Violation[] }> {
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
    const violationsWithStatus = violations.map((violation) => ({
      ...violation,
      status: "pending" as const,
    }));

    return {
      id: this.generateId(),
      file,
      violations: violationsWithStatus,
      summary,
      timestamp: Date.now(),
      status,
    };
  }

  private generateId(): string {
    return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
