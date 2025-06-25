export interface LLMConfig {
  apiToken: string;
  endpoint: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  cookie?: string; // For cookie-based authentication
  authType?: "token" | "cookie"; // Authentication type
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface LLMChunk {
  content: string;
  isComplete: boolean;
}

export type LLMProviderType = "ollama" | "openai";

export interface LLMRequestBody {
  model: string;
  prompt: string;
  stream: boolean;
  options?: {
    num_predict?: number;
    temperature?: number;
  };
}

export interface LLMAPIResponse {
  response?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  choices?: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content?: string;
    };
  }>;
}

export interface LLMError {
  message: string;
  status?: number;
  statusText?: string;
  details?: string;
}