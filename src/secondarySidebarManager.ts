import * as vscode from 'vscode';

export interface ReviewHistoryItem {
  id: string;
  fileName: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
  reviewData?: any;
}

export interface AnalyticsData {
  totalReviews: number;
  totalIssues: number;
  successRate: number;
  weeklyData: number[];
}

export interface ReviewTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  prompt: string;
}

export class SecondarySidebarManager {
  private static instance: SecondarySidebarManager;
  private reviewHistory: ReviewHistoryItem[] = [];
  private analytics: AnalyticsData = {
    totalReviews: 0,
    totalIssues: 0,
    successRate: 0,
    weeklyData: [0, 0, 0, 0, 0, 0, 0]
  };
  private templates: ReviewTemplate[] = [
    {
      id: 'default',
      name: 'Default Review',
      description: 'Standard code review with quality and security checks',
      tags: ['default', 'quality', 'security'],
      prompt: 'Please review the following code based on these coding conventions: {conventions}\n\nCode to review:\n```{language}\n{code}\n```\n\nPlease provide a detailed review including:\n1. Code quality assessment\n2. Potential improvements\n3. Security concerns (if any)\n4. Performance considerations\n5. Adherence to the specified coding conventions'
    },
    {
      id: 'performance',
      name: 'Performance Review',
      description: 'Focus on performance optimization and efficiency',
      tags: ['performance', 'optimization', 'efficiency'],
      prompt: 'Please review the following code with a focus on performance optimization:\n\nCode to review:\n```{language}\n{code}\n```\n\nPlease analyze:\n1. Time complexity of algorithms\n2. Memory usage patterns\n3. Potential bottlenecks\n4. Optimization opportunities\n5. Performance best practices compliance'
    },
    {
      id: 'security',
      name: 'Security Review',
      description: 'Comprehensive security vulnerability assessment',
      tags: ['security', 'vulnerability', 'assessment'],
      prompt: 'Please perform a comprehensive security review of the following code:\n\nCode to review:\n```{language}\n{code}\n```\n\nPlease identify:\n1. Potential security vulnerabilities\n2. Input validation issues\n3. Authentication/authorization concerns\n4. Data exposure risks\n5. Security best practices compliance'
    }
  ];

  private constructor() {}

  public static getInstance(): SecondarySidebarManager {
    if (!SecondarySidebarManager.instance) {
      SecondarySidebarManager.instance = new SecondarySidebarManager();
    }
    return SecondarySidebarManager.instance;
  }

  // History Management
  public addReviewToHistory(fileName: string, status: 'success' | 'warning' | 'error', reviewData?: any): void {
    const historyItem: ReviewHistoryItem = {
      id: Date.now().toString(),
      fileName,
      timestamp: new Date().toLocaleString(),
      status,
      reviewData
    };

    this.reviewHistory.unshift(historyItem);
    this.updateAnalytics();
    this.saveHistory();
  }

  public getReviewHistory(): ReviewHistoryItem[] {
    return this.reviewHistory;
  }

  public getReviewById(id: string): ReviewHistoryItem | undefined {
    return this.reviewHistory.find(item => item.id === id);
  }

  // Analytics Management
  public getAnalytics(): AnalyticsData {
    return this.analytics;
  }

  private updateAnalytics(): void {
    this.analytics.totalReviews = this.reviewHistory.length;
    this.analytics.totalIssues = this.reviewHistory.filter(item => item.status !== 'success').length;
    this.analytics.successRate = this.reviewHistory.length > 0
      ? Math.round((this.reviewHistory.filter(item => item.status === 'success').length / this.reviewHistory.length) * 100)
      : 0;

    // Update weekly data (simplified - in real implementation, you'd track actual dates)
    const today = new Date().getDay();
    this.analytics.weeklyData[today] = this.analytics.weeklyData[today] + 1;
  }

  // Template Management
  public getTemplates(): ReviewTemplate[] {
    return this.templates;
  }

  public getTemplateById(id: string): ReviewTemplate | undefined {
    return this.templates.find(template => template.id === id);
  }

  public addTemplate(template: Omit<ReviewTemplate, 'id'>): void {
    const newTemplate: ReviewTemplate = {
      ...template,
      id: Date.now().toString()
    };
    this.templates.push(newTemplate);
    this.saveTemplates();
  }

  public updateTemplate(id: string, updates: Partial<ReviewTemplate>): void {
    const index = this.templates.findIndex(template => template.id === id);
    if (index !== -1) {
      this.templates[index] = { ...this.templates[index], ...updates };
      this.saveTemplates();
    }
  }

  public deleteTemplate(id: string): void {
    this.templates = this.templates.filter(template => template.id !== id);
    this.saveTemplates();
  }

  public duplicateTemplate(id: string): void {
    const original = this.getTemplateById(id);
    if (original) {
      const duplicated: ReviewTemplate = {
        ...original,
        id: Date.now().toString(),
        name: `${original.name} (Copy)`
      };
      this.templates.push(duplicated);
      this.saveTemplates();
    }
  }

  // Persistence
  private saveHistory(): void {
    // In a real implementation, you'd save to workspace storage or file system
    // For now, we'll keep it in memory
  }

  private saveTemplates(): void {
    // In a real implementation, you'd save to workspace storage or file system
    // For now, we'll keep it in memory
  }

  public loadData(): void {
    // In a real implementation, you'd load from workspace storage or file system
    // For now, we'll use the default data
  }
}