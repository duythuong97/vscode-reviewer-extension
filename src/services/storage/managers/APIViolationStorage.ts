import {
  Violation,
  ReviewResult,
  ViolationStorage,
} from "../../../types/violation";
import { Logger, debugOutputChannel } from "../../../utils";

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
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify(result),
      });
      return response.ok;
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[APIViolationStorage] Failed to save review result:`,
        error
      );
      return false;
    }
  }

  public async loadReviewResults(): Promise<ReviewResult[]> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results`, {
        headers: {
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      });
      if (response.ok) {
        return (await response.json()) as ReviewResult[];
      }
      return [];
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[APIViolationStorage] Failed to load review results:`,
        error
      );
      return [];
    }
  }

  public async loadReviewResultById(id: string): Promise<ReviewResult | null> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results/${id}`, {
        headers: {
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      });
      if (response.ok) {
        return (await response.json()) as ReviewResult;
      }
      return null;
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[APIViolationStorage] Failed to load review result by ID ${id}:`,
        error
      );
      return null;
    }
  }

  public async deleteReviewResult(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results/${id}`, {
        method: "DELETE",
        headers: {
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      });
      return response.ok;
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[APIViolationStorage] Failed to delete review result ${id}:`,
        error
      );
      return false;
    }
  }

  public async clearAllResults(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/review-results`, {
        method: "DELETE",
        headers: {
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      });
      return response.ok;
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[APIViolationStorage] Failed to clear all results:`,
        error
      );
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
      const response = await fetch(
        `${this.apiEndpoint}/review-results/${reviewId}/violations/${violationIndex}/status`,
        {
          method: "PUT",
          headers: {
            ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status, note }),
        }
      );
      return response.ok;
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[APIViolationStorage] Failed to update violation status:`,
        error
      );
      return false;
    }
  }

  public async getViolationsForReReview(
    file: string
  ): Promise<{ approved: Violation[]; rejected: Violation[] }> {
    try {
      const response = await fetch(
        `${this.apiEndpoint}/review-results/violations?file=${file}`,
        {
          headers: {
            ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
          },
        }
      );
      if (response.ok) {
        const { approved, rejected } = (await response.json()) as {
          approved: Violation[];
          rejected: Violation[];
        };
        Logger.logDebug(
          debugOutputChannel,
          `[APIViolationStorage] Loaded ${approved.length} approved and ${rejected.length} rejected violations for file ${file}`
        );
        return { approved, rejected };
      }
      return { approved: [], rejected: [] };
    } catch (error) {
      Logger.logDebug(
        debugOutputChannel,
        `[APIViolationStorage] Failed to load violations for re-review:`,
        error
      );
      return { approved: [], rejected: [] };
    }
  }
}
