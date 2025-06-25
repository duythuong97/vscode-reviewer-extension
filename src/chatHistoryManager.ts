import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { debugOutputChannel, logDebug } from "./utils";

export interface ChatMessage {
  id: string;
  timestamp: number;
  isUser: boolean;
  content: string;
  fileName?: string;
  lineStart?: number;
  lineEnd?: number;
  codeSelections?: any[];
}

export interface ChatSession {
  id: string;
  timestamp: number;
  messages: ChatMessage[];
  title: string;
}

export class ChatHistoryManager {
  private static instance: ChatHistoryManager;
  private dbPath: string;
  private currentSession: ChatSession | null = null;
  private maxHistorySize: number = 100; // Maximum number of sessions to keep

  private constructor() {
    // Create .vscode folder in workspace if it doesn't exist
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const vscodeFolder = path.join(workspaceFolder.uri.fsPath, '.vscode');
      if (!fs.existsSync(vscodeFolder)) {
        fs.mkdirSync(vscodeFolder, { recursive: true });
      }
      this.dbPath = path.join(vscodeFolder, 'ai-reviewer-chat-history.json');
    } else {
      // Fallback to global storage if no workspace
      this.dbPath = path.join(vscode.env.appRoot, 'ai-reviewer-chat-history.json');
    }
  }

  public static getInstance(): ChatHistoryManager {
    if (!ChatHistoryManager.instance) {
      ChatHistoryManager.instance = new ChatHistoryManager();
      // Initialize after construction
      ChatHistoryManager.instance.init();
    }
    return ChatHistoryManager.instance;
  }

  /**
   * Initialize the manager (load most recent session)
   */
  private async init(): Promise<void> {
    await this.loadMostRecentSession();
  }

  /**
   * Start a new chat session
   */
  public startNewSession(): string {
    const sessionId = this.generateId();
    this.currentSession = {
      id: sessionId,
      timestamp: Date.now(),
      messages: [],
      title: `Chat Session ${new Date().toLocaleString()}`
    };

    logDebug(debugOutputChannel, `[ChatHistory] Started new session: ${sessionId}`);
    return sessionId;
  }

  /**
   * Add a message to the current session
   */
  public addMessage(content: string, isUser: boolean, codeSelections?: any[], fileName?: string, lineStart?: number, lineEnd?: number): void {
    if (!this.currentSession) {
      this.startNewSession();
    }

    const message: ChatMessage = {
      id: this.generateId(),
      timestamp: Date.now(),
      isUser,
      content,
      fileName,
      lineStart,
      lineEnd,
      codeSelections
    };

    this.currentSession!.messages.push(message);

    // Auto-save after each message
    this.saveCurrentSession();

    logDebug(debugOutputChannel, `[ChatHistory] Added ${isUser ? 'user' : 'AI'} message to session ${this.currentSession!.id}`);
  }

  /**
   * Get conversation context for LLM (last N messages)
   */
  public getConversationContext(maxMessages: number = 10): string {
    if (!this.currentSession || this.currentSession.messages.length === 0) {
      return "";
    }

    const recentMessages = this.currentSession.messages.slice(-maxMessages);
    let context = "Previous conversation context:\n\n";

    recentMessages.forEach((message, index) => {
      const role = message.isUser ? "User" : "AI";
      const timestamp = new Date(message.timestamp).toLocaleTimeString();

      context += `[${timestamp}] ${role}:\n`;

      // Add code context if available
      if (message.codeSelections && message.codeSelections.length > 0) {
        context += `Code context: ${message.codeSelections.length} selection(s)\n`;
        message.codeSelections.forEach((selection: any, idx: number) => {
          context += `Selection ${idx + 1}: ${selection.fileName} (lines ${selection.lineStart}-${selection.lineEnd})\n`;
          context += `\`\`\`\n${selection.selectedCode}\n\`\`\`\n`;
        });
      }

      context += `${message.content}\n\n`;
    });

    return context;
  }

  /**
   * Get all chat sessions
   */
  public async getAllSessions(): Promise<ChatSession[]> {
    try {
      if (!fs.existsSync(this.dbPath)) {
        return [];
      }

      const data = fs.readFileSync(this.dbPath, 'utf8');
      const sessions: ChatSession[] = JSON.parse(data);

      // Sort by timestamp (newest first)
      return sessions.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logDebug(debugOutputChannel, `[ChatHistory] Error reading sessions: ${error}`);
      return [];
    }
  }

  /**
   * Load a specific session
   */
  public async loadSession(sessionId: string): Promise<ChatSession | null> {
    const sessions = await this.getAllSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (session) {
      this.currentSession = session;
      logDebug(debugOutputChannel, `[ChatHistory] Loaded session: ${sessionId}`);
      return session;
    }

    return null;
  }

  /**
   * Save current session to database
   */
  private saveCurrentSession(): void {
    if (!this.currentSession) {
      return;
    }

    try {
      let sessions: ChatSession[] = [];

      // Read existing sessions
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf8');
        sessions = JSON.parse(data);
      }

      // Update or add current session
      const existingIndex = sessions.findIndex(s => s.id === this.currentSession!.id);
      if (existingIndex >= 0) {
        sessions[existingIndex] = this.currentSession!;
      } else {
        sessions.push(this.currentSession!);
      }

      // Limit history size
      if (sessions.length > this.maxHistorySize) {
        sessions = sessions.slice(0, this.maxHistorySize);
      }

      // Save to file
      fs.writeFileSync(this.dbPath, JSON.stringify(sessions, null, 2));

      logDebug(debugOutputChannel, `[ChatHistory] Saved session: ${this.currentSession.id}`);
    } catch (error) {
      logDebug(debugOutputChannel, `[ChatHistory] Error saving session: ${error}`);
    }
  }

  /**
   * Delete a session
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessions = await this.getAllSessions();
      const filteredSessions = sessions.filter(s => s.id !== sessionId);

      fs.writeFileSync(this.dbPath, JSON.stringify(filteredSessions, null, 2));

      // If we deleted the current session, start a new one
      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
      }

      logDebug(debugOutputChannel, `[ChatHistory] Deleted session: ${sessionId}`);
      return true;
    } catch (error) {
      logDebug(debugOutputChannel, `[ChatHistory] Error deleting session: ${error}`);
      return false;
    }
  }

  /**
   * Clear all chat history
   */
  public async clearAllHistory(): Promise<boolean> {
    try {
      if (fs.existsSync(this.dbPath)) {
        fs.unlinkSync(this.dbPath);
      }
      this.currentSession = null;

      logDebug(debugOutputChannel, `[ChatHistory] Cleared all history`);
      return true;
    } catch (error) {
      logDebug(debugOutputChannel, `[ChatHistory] Error clearing history: ${error}`);
      return false;
    }
  }

  /**
   * Get current session
   */
  public getCurrentSession(): ChatSession | null {
    return this.currentSession;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get database path for debugging
   */
  public getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Test and verify database content (for debugging)
   */
  public async testDatabase(): Promise<any> {
    try {
      if (!fs.existsSync(this.dbPath)) {
        return { exists: false, error: "Database file does not exist" };
      }

      const data = fs.readFileSync(this.dbPath, 'utf8');
      const sessions = JSON.parse(data);

      return {
        exists: true,
        fileSize: data.length,
        sessionCount: sessions.length,
        sessions: sessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          messageCount: s.messages?.length || 0,
          timestamp: new Date(s.timestamp).toLocaleString()
        })),
        rawData: data.substring(0, 500) + (data.length > 500 ? "..." : "")
      };
    } catch (error) {
      return {
        exists: fs.existsSync(this.dbPath),
        error: error instanceof Error ? error.message : "Unknown error",
        fileSize: fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0
      };
    }
  }

  /**
   * Load the most recent session automatically
   */
  private async loadMostRecentSession(): Promise<void> {
    try {
      const sessions = await this.getAllSessions();
      if (sessions.length > 0) {
        this.currentSession = sessions[0]; // Most recent session (already sorted)
        logDebug(debugOutputChannel, `[ChatHistory] Auto-loaded most recent session: ${this.currentSession.id}`);
      }
    } catch (error) {
      logDebug(debugOutputChannel, `[ChatHistory] Error auto-loading most recent session: ${error}`);
    }
  }

  /**
   * Force load the most recent session (public method)
   */
  public async forceLoadMostRecentSession(): Promise<boolean> {
    try {
      const sessions = await this.getAllSessions();
      if (sessions.length > 0) {
        this.currentSession = sessions[0];
        logDebug(debugOutputChannel, `[ChatHistory] Force-loaded most recent session: ${this.currentSession.id}`);
        return true;
      }
      return false;
    } catch (error) {
      logDebug(debugOutputChannel, `[ChatHistory] Error force-loading most recent session: ${error}`);
      return false;
    }
  }
}