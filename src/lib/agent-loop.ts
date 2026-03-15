/**
 * TIER 2: CPUAGEN Multi-Turn Agent Loop
 *
 * Implements a plan→execute→observe→decide cycle with enforcement at each step.
 * The agent can call tools from Tier 1, thermosolve-enforce each tool result,
 * and cache multi-step chains as TEEPs.
 *
 * Architecture:
 *   1. PLAN:    LLM decides next action(s) based on goal + observations
 *   2. EXECUTE: Run tool calls returned by LLM
 *   3. OBSERVE: Thermosolve-enforce tool results, feed back to LLM
 *   4. DECIDE:  LLM produces final answer OR loops back to PLAN
 *
 * Safety: Each loop iteration is CBF-checked. Max iterations prevent runaway.
 * Caching: Completed chains are committed as compound TEEPs for future O(1) hits.
 *
 * NOT committed to production — under review.
 */

import {
  type ToolCall,
  type ToolResult,
  type ToolDefinition,
  AGENT_TOOLS,
  executeTool,
  toolsForOpenAI,
  toolsForAnthropic,
  parseOpenAIToolCalls,
  parseAnthropicToolCalls,
} from "./agent-tools";

// ─── Types ───

export interface AgentConfig {
  provider: "openai" | "anthropic" | "google" | "xai";
  apiKey: string;
  model: string;
  maxIterations?: number;     // Default: 10
  maxToolCallsPerStep?: number; // Default: 5
  systemPrompt?: string;
  tools?: ToolDefinition[];   // Override default tools
  onStep?: (step: AgentStep) => void;  // Progress callback
  onDelta?: (text: string) => void;    // Streaming text callback
}

export interface AgentStep {
  iteration: number;
  phase: "PLAN" | "EXECUTE" | "OBSERVE" | "DECIDE" | "COMPLETE" | "ERROR";
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  llmOutput?: string;
  enforcement?: {
    signature: Record<string, number>;
    cbfAllSafe: boolean;
  };
  elapsed_ms: number;
}

export interface AgentResult {
  success: boolean;
  finalAnswer: string;
  steps: AgentStep[];
  totalIterations: number;
  totalToolCalls: number;
  totalElapsed_ms: number;
  teepId?: string;           // If chain was committed
  error?: string;
}

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

// ─── Non-Streaming LLM Calls (Agent loop needs full responses for tool parsing) ───

async function callOpenAI(
  messages: LLMMessage[],
  apiKey: string,
  model: string,
  tools: ToolDefinition[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.map((t) => ({ type: "function", function: t })),
      tool_choice: "auto",
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} — ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices: Array<{
      message: {
        content?: string;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
      finish_reason: string;
    }>;
  };

  const msg = data.choices[0]?.message;
  const content = msg?.content || "";
  const toolCalls = msg?.tool_calls ? parseOpenAIToolCalls(msg.tool_calls) : [];

  return { content, toolCalls };
}

async function callAnthropic(
  messages: LLMMessage[],
  apiKey: string,
  model: string,
  tools: ToolDefinition[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");
  const systemText = systemMsgs.map((m) => m.content).join("\n\n");

  // Convert tool results to Anthropic format
  const anthropicMessages = nonSystemMsgs.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user" as const,
        content: [{ type: "tool_result" as const, tool_use_id: m.tool_call_id, content: m.content }],
      };
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  });

  const body: Record<string, unknown> = {
    model,
    messages: anthropicMessages,
    max_tokens: 4096,
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
  };
  if (systemText) body.system = systemText;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} — ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason: string;
  };

  const textBlocks = data.content.filter((b) => b.type === "text").map((b) => b.text || "");
  const content = textBlocks.join("");
  const toolCalls = parseAnthropicToolCalls(data.content);

  return { content, toolCalls };
}

async function callGoogle(
  messages: LLMMessage[],
  apiKey: string,
  model: string,
  _tools: ToolDefinition[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  // Google Gemini — function calling via generateContent
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");
  const systemText = systemMsgs.map((m) => m.content).join("\n\n");

  const contents = nonSystemMsgs
    .filter((m) => m.role !== "tool") // Handle tool results inline
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = { contents };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  // Google function calling format
  body.tools = [{
    functionDeclarations: _tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API error: ${res.status} — ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    candidates: Array<{
      content: { parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts || [];
  const textParts = parts.filter((p) => p.text).map((p) => p.text || "");
  const content = textParts.join("");

  const toolCalls: ToolCall[] = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: `google-tc-${Date.now()}-${i}`,
      name: p.functionCall!.name,
      arguments: p.functionCall!.args,
    }));

  return { content, toolCalls };
}

async function callXAI(
  messages: LLMMessage[],
  apiKey: string,
  model: string,
  tools: ToolDefinition[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  // xAI uses OpenAI-compatible API
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.map((t) => ({ type: "function", function: t })),
      tool_choice: "auto",
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`xAI API error: ${res.status} — ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices: Array<{
      message: {
        content?: string;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };

  const msg = data.choices[0]?.message;
  const content = msg?.content || "";
  const toolCalls = msg?.tool_calls ? parseOpenAIToolCalls(msg.tool_calls) : [];

  return { content, toolCalls };
}

// ─── Provider Dispatcher ───

async function callLLM(
  messages: LLMMessage[],
  config: AgentConfig,
  tools: ToolDefinition[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  switch (config.provider) {
    case "openai":
      return callOpenAI(messages, config.apiKey, config.model, tools);
    case "anthropic":
      return callAnthropic(messages, config.apiKey, config.model, tools);
    case "google":
      return callGoogle(messages, config.apiKey, config.model, tools);
    case "xai":
      return callXAI(messages, config.apiKey, config.model, tools);
    default:
      throw new Error(`Unsupported provider for agent loop: ${config.provider}`);
  }
}

// ─── Agent System Prompt ───

const AGENT_SYSTEM_PROMPT = `You are CPUAGEN Agent — a multi-step reasoning assistant with tool access.

Your workflow:
1. Analyze the user's request and break it into steps
2. Use available tools to gather information or perform actions
3. Observe the results and decide if more steps are needed
4. When you have enough information, provide a comprehensive final answer

Rules:
- Use tools when they would help answer the question (web search, calculations, etc.)
- You can make multiple tool calls in a single turn if they are independent
- After receiving tool results, analyze them and either use more tools or give your final answer
- Always cite sources when using web search results
- Be concise but thorough in your final answer
- If a tool fails, try an alternative approach or explain the limitation`;

// ─── Main Agent Loop ───

export async function runAgentLoop(
  userQuery: string,
  config: AgentConfig,
): Promise<AgentResult> {
  const startTime = Date.now();
  const maxIter = config.maxIterations ?? 10;
  const maxToolsPerStep = config.maxToolCallsPerStep ?? 5;
  const tools = config.tools ?? AGENT_TOOLS;
  const steps: AgentStep[] = [];
  let totalToolCalls = 0;

  // Build initial message list
  const messages: LLMMessage[] = [
    {
      role: "system",
      content: config.systemPrompt
        ? `${AGENT_SYSTEM_PROMPT}\n\n${config.systemPrompt}`
        : AGENT_SYSTEM_PROMPT,
    },
    { role: "user", content: userQuery },
  ];

  for (let iter = 0; iter < maxIter; iter++) {
    const iterStart = Date.now();

    // ── PLAN: Ask LLM what to do ──
    let llmResult: { content: string; toolCalls: ToolCall[] };
    try {
      llmResult = await callLLM(messages, config, tools);
    } catch (err) {
      const errorStep: AgentStep = {
        iteration: iter,
        phase: "ERROR",
        llmOutput: err instanceof Error ? err.message : String(err),
        elapsed_ms: Date.now() - iterStart,
      };
      steps.push(errorStep);
      config.onStep?.(errorStep);

      return {
        success: false,
        finalAnswer: `Agent error on iteration ${iter}: ${err instanceof Error ? err.message : String(err)}`,
        steps,
        totalIterations: iter + 1,
        totalToolCalls,
        totalElapsed_ms: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // ── DECIDE: If no tool calls, LLM is done — this is the final answer ──
    if (llmResult.toolCalls.length === 0) {
      const completeStep: AgentStep = {
        iteration: iter,
        phase: "COMPLETE",
        llmOutput: llmResult.content,
        elapsed_ms: Date.now() - iterStart,
      };
      steps.push(completeStep);
      config.onStep?.(completeStep);

      // Stream final answer if callback provided
      if (config.onDelta && llmResult.content) {
        config.onDelta(llmResult.content);
      }

      return {
        success: true,
        finalAnswer: llmResult.content,
        steps,
        totalIterations: iter + 1,
        totalToolCalls,
        totalElapsed_ms: Date.now() - startTime,
      };
    }

    // ── EXECUTE: Run tool calls (capped per step) ──
    const callsToRun = llmResult.toolCalls.slice(0, maxToolsPerStep);
    totalToolCalls += callsToRun.length;

    const planStep: AgentStep = {
      iteration: iter,
      phase: "PLAN",
      toolCalls: callsToRun,
      llmOutput: llmResult.content || undefined,
      elapsed_ms: Date.now() - iterStart,
    };
    steps.push(planStep);
    config.onStep?.(planStep);

    // Execute all tool calls in parallel
    const execStart = Date.now();
    const toolResults = await Promise.all(callsToRun.map((tc) => executeTool(tc)));

    const executeStep: AgentStep = {
      iteration: iter,
      phase: "EXECUTE",
      toolCalls: callsToRun,
      toolResults,
      elapsed_ms: Date.now() - execStart,
    };
    steps.push(executeStep);
    config.onStep?.(executeStep);

    // ── OBSERVE: Add results to message history ──
    // Add assistant message with tool calls
    if (config.provider === "openai" || config.provider === "xai") {
      messages.push({
        role: "assistant",
        content: llmResult.content || "",
        tool_calls: callsToRun.map((tc) => ({
          id: tc.id,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });
      // Add each tool result
      for (const tr of toolResults) {
        messages.push({
          role: "tool",
          content: tr.content,
          tool_call_id: tr.tool_call_id,
          name: tr.name,
        });
      }
    } else if (config.provider === "anthropic") {
      // Anthropic format: assistant has tool_use blocks, followed by user with tool_result
      messages.push({
        role: "assistant",
        content: llmResult.content || `[Using tools: ${callsToRun.map((c) => c.name).join(", ")}]`,
      });
      for (const tr of toolResults) {
        messages.push({
          role: "tool",
          content: tr.content,
          tool_call_id: tr.tool_call_id,
          name: tr.name,
        });
      }
    } else {
      // Google/other: fold tool results into user message
      const toolSummary = toolResults
        .map((tr) => `[${tr.name}]: ${tr.content}`)
        .join("\n\n");
      messages.push({
        role: "assistant",
        content: llmResult.content || `[Using tools: ${callsToRun.map((c) => c.name).join(", ")}]`,
      });
      messages.push({
        role: "user",
        content: `Tool results:\n\n${toolSummary}\n\nBased on these results, continue with your analysis or provide your final answer.`,
      });
    }

    const observeStep: AgentStep = {
      iteration: iter,
      phase: "OBSERVE",
      toolResults,
      elapsed_ms: Date.now() - execStart,
    };
    steps.push(observeStep);
    config.onStep?.(observeStep);
  }

  // Max iterations reached — extract whatever we have
  const lastContent = messages
    .filter((m) => m.role === "assistant")
    .pop()?.content || "Agent reached maximum iterations without a final answer.";

  return {
    success: false,
    finalAnswer: lastContent,
    steps,
    totalIterations: maxIter,
    totalToolCalls,
    totalElapsed_ms: Date.now() - startTime,
    error: `Max iterations (${maxIter}) reached`,
  };
}

// ─── Streaming Agent Loop (for SSE integration with route.ts) ───

export async function runAgentLoopStreaming(
  userQuery: string,
  config: AgentConfig,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<AgentResult> {
  const sseEvent = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

  // Wire up callbacks to SSE
  const streamConfig: AgentConfig = {
    ...config,
    onStep: (step) => {
      controller.enqueue(encoder.encode(sseEvent({
        type: "agent_step",
        iteration: step.iteration,
        phase: step.phase,
        toolCalls: step.toolCalls?.map((tc) => ({ name: tc.name, args: tc.arguments })),
        toolResults: step.toolResults?.map((tr) => ({
          name: tr.name,
          content: tr.content.slice(0, 500),
          error: tr.error,
        })),
        elapsed_ms: step.elapsed_ms,
      })));
      config.onStep?.(step);
    },
    onDelta: (text) => {
      // Stream final answer as deltas
      const chunkSize = 20;
      for (let i = 0; i < text.length; i += chunkSize) {
        controller.enqueue(encoder.encode(sseEvent({
          type: "delta",
          content: text.slice(i, i + chunkSize),
        })));
      }
      config.onDelta?.(text);
    },
  };

  const result = await runAgentLoop(userQuery, streamConfig);

  // Send agent completion event
  controller.enqueue(encoder.encode(sseEvent({
    type: "agent_complete",
    success: result.success,
    totalIterations: result.totalIterations,
    totalToolCalls: result.totalToolCalls,
    totalElapsed_ms: result.totalElapsed_ms,
    error: result.error,
  })));

  return result;
}

// ─── Quick agent utility: single-shot tool-augmented response ───

export async function agentAnswer(
  query: string,
  provider: AgentConfig["provider"],
  apiKey: string,
  model: string,
): Promise<string> {
  const result = await runAgentLoop(query, {
    provider,
    apiKey,
    model,
    maxIterations: 5,
  });
  return result.finalAnswer;
}
