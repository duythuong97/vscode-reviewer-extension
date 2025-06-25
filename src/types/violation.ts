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