import { LlmClient, LlmCompletionRequest, LlmCompletionResponse } from "./client.js";

export class ScriptedLlmClient implements LlmClient {
  public readonly requests: LlmCompletionRequest[] = [];
  private index = 0;

  constructor(private readonly responses: string[]) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.requests.push(request);
    const text = this.responses[this.index];
    if (text === undefined) {
      throw new Error("ScriptedLlmClient: no scripted response left");
    }
    this.index += 1;
    return { text };
  }
}
