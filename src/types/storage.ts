export interface IReviewResult {
  id: string;
  file: string;
  violations: IViolation[];
  summary: string;
  timestamp: number;
  status: string;
  feedbackContext?: string;
}

export interface IViolation {
  line: number;
  message: string;
  severity: 'high' | 'medium' | 'low';
  originalCode?: string;
  suggestion?: string;
  status?: 'pending' | 'approved' | 'rejected';
  note?: string;
}

export interface IStorageProvider {
  saveReviewResult(result: IReviewResult): Promise<boolean>;
  loadReviewResults(): Promise<IReviewResult[]>;
  updateViolationStatus(reviewId: string, violationIndex: number, status: string): Promise<boolean>;
  clearAllResults(): Promise<boolean>;
}