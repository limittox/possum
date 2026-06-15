export interface LlmCompletionRequest {
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}

export interface LlmCompletionResponse {
  text: string;
}

export interface LlmClient {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}
