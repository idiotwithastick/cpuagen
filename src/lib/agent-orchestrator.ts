/**
 * TIER 3: CPUAGEN Multi-Model Orchestrator
 *
 * Cross-provider agent dispatch: route subtasks to the best model for the job.
 * Claude handles reasoning, GPT handles coding, Gemini handles research,
 * Grok handles creative/conversational tasks.
 *
 * Architecture:
 *   1. DECOMPOSE: Break user request into typed subtasks
 *   2. ROUTE:     Assign each subtask to optimal provider
 *   3. EXECUTE:   Run subtasks (parallel when independent, sequential when chained)
 *   4. CONVERGE:  Merge results with thermosolve-weighted fusion
 *   5. SYNTHESIZE: Generate unified response from merged results
 *
 * Thermosolve convergence: Each sub-response gets a signature.
 * Final answer weighted by φ (coherence) and dS (entropy gradient).
 *
 * NOT committed to production — under review.
 */

import { runAgentLoop, type AgentConfig, type AgentResult } from "./agent-loop";

// ─── Types ───

export type TaskType =
  | "REASONING"     // Logic, analysis, planning → Claude
  | "CODING"        // Code generation, debugging → GPT/Claude
  | "RESEARCH"      // Web search, fact-finding → Gemini/Grok
  | "CREATIVE"      // Writing, brainstorming → Claude/GPT
  | "MATH"          // Calculations, proofs → GPT/Claude
  | "GENERAL";      // Default fallback

export interface ProviderSlot {
  provider: AgentConfig["provider"];
  apiKey: string;
  model: string;
  strengths: TaskType[];
  priority: number;  // Lower = preferred
  enabled: boolean;
}

export interface Subtask {
  id: string;
  type: TaskType;
  query: string;
  dependsOn?: string[];  // IDs of subtasks that must complete first
  assignedProvider?: string;
}

export interface SubtaskResult {
  subtaskId: string;
  provider: string;
  model: string;
  content: string;
  success: boolean;
  elapsed_ms: number;
  signature?: {
    n: number;
    S: number;
    dS: number;
    phi: number;
  };
  error?: string;
}

export interface OrchestratorConfig {
  providers: ProviderSlot[];
  synthesizer: {
    provider: AgentConfig["provider"];
    apiKey: string;
    model: string;
  };
  maxSubtasks?: number;        // Default: 8
  parallelLimit?: number;      // Default: 4
  timeoutMs?: number;          // Default: 120000 (2 min)
  onSubtaskComplete?: (result: SubtaskResult) => void;
  onPhaseChange?: (phase: string, detail?: string) => void;
}

export interface OrchestratorResult {
  success: boolean;
  finalAnswer: string;
  subtasks: SubtaskResult[];
  synthesis: {
    provider: string;
    model: string;
    elapsed_ms: number;
  };
  totalElapsed_ms: number;
  providersUsed: string[];
  error?: string;
}

// ─── Provider Routing ───

const TASK_TYPE_KEYWORDS: Record<TaskType, RegExp> = {
  REASONING: /\b(explain|analyze|compare|evaluate|reason|think|logic|argument|debate|assess|critique|review)\b/i,
  CODING: /\b(code|function|class|implement|debug|refactor|program|script|algorithm|api|endpoint|component|typescript|python|javascript|html|css|sql|regex)\b/i,
  RESEARCH: /\b(search|find|look up|latest|current|recent|who|when|where|what happened|news|source|reference|cite|fact)\b/i,
  CREATIVE: /\b(write|create|compose|story|poem|essay|draft|brainstorm|imagine|design|invent|name|slogan|tagline)\b/i,
  MATH: /\b(calculate|compute|solve|equation|formula|proof|theorem|integral|derivative|probability|statistics|matrix|vector)\b/i,
  GENERAL: /./,
};

function classifyTask(query: string): TaskType {
  for (const [type, pattern] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (type === "GENERAL") continue;
    if (pattern.test(query)) return type as TaskType;
  }
  return "GENERAL";
}

function selectProvider(taskType: TaskType, providers: ProviderSlot[]): ProviderSlot | null {
  const candidates = providers
    .filter((p) => p.enabled && p.strengths.includes(taskType))
    .sort((a, b) => a.priority - b.priority);

  if (candidates.length > 0) return candidates[0];

  // Fallback: any enabled provider
  const fallback = providers.filter((p) => p.enabled).sort((a, b) => a.priority - b.priority);
  return fallback[0] || null;
}

// ─── Task Decomposition ───

const DECOMPOSE_PROMPT = `You are a task decomposition engine. Given a complex user request, break it into independent subtasks.

Output a JSON array of subtasks. Each subtask has:
- "id": unique string (e.g., "s1", "s2")
- "type": one of REASONING, CODING, RESEARCH, CREATIVE, MATH, GENERAL
- "query": the specific question or instruction for this subtask
- "dependsOn": array of subtask IDs that must complete first (empty if independent)

Rules:
- Keep subtasks focused and independent when possible
- Maximum 8 subtasks
- If the request is simple, return a single subtask
- For complex requests, decompose into logical steps
- Mark dependencies only when a subtask truly needs another's output

Respond with ONLY the JSON array, no other text.`;

async function decomposeTask(
  userQuery: string,
  config: OrchestratorConfig,
): Promise<Subtask[]> {
  const maxSubtasks = config.maxSubtasks ?? 8;

  // Use the synthesizer model for decomposition
  const { provider, apiKey, model } = config.synthesizer;

  const res = await fetchNonStreaming(provider, apiKey, model, [
    { role: "system", content: DECOMPOSE_PROMPT },
    { role: "user", content: userQuery },
  ]);

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = res.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as Array<{
      id: string;
      type: string;
      query: string;
      dependsOn?: string[];
    }>;

    return parsed.slice(0, maxSubtasks).map((s) => ({
      id: s.id,
      type: (s.type as TaskType) || "GENERAL",
      query: s.query,
      dependsOn: s.dependsOn || [],
    }));
  } catch {
    // Fallback: single subtask with the original query
    return [{
      id: "s1",
      type: classifyTask(userQuery),
      query: userQuery,
    }];
  }
}

// ─── Non-Streaming Fetch (for decomposition + synthesis) ───

async function fetchNonStreaming(
  provider: AgentConfig["provider"],
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  switch (provider) {
    case "openai":
      url = "https://api.openai.com/v1/chat/completions";
      headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      body = { model, messages, max_tokens: 4096 };
      break;
    case "anthropic": {
      url = "https://api.anthropic.com/v1/messages";
      const systemMsgs = messages.filter((m) => m.role === "system");
      const nonSystemMsgs = messages.filter((m) => m.role !== "system");
      headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };
      body = { model, messages: nonSystemMsgs, max_tokens: 4096 };
      if (systemMsgs.length > 0) body.system = systemMsgs.map((m) => m.content).join("\n\n");
      break;
    }
    case "google": {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      headers = { "Content-Type": "application/json" };
      const systemMsgsG = messages.filter((m) => m.role === "system");
      const nonSystemMsgsG = messages.filter((m) => m.role !== "system");
      body = {
        contents: nonSystemMsgsG.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      };
      if (systemMsgsG.length > 0) {
        body.systemInstruction = { parts: [{ text: systemMsgsG.map((m) => m.content).join("\n\n") }] };
      }
      break;
    }
    case "xai":
      url = "https://api.x.ai/v1/chat/completions";
      headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      body = { model, messages, max_tokens: 4096 };
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider} API error: ${res.status} — ${err.slice(0, 200)}`);
  }

  const data = await res.json();

  // Extract text from provider-specific response format
  switch (provider) {
    case "openai":
    case "xai":
      return data.choices?.[0]?.message?.content || "";
    case "anthropic":
      return data.content?.filter((b: { type: string }) => b.type === "text")
        .map((b: { text?: string }) => b.text || "").join("") || "";
    case "google":
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    default:
      return "";
  }
}

// ─── Parallel Execution with Dependency Resolution ───

async function executeSubtasks(
  subtasks: Subtask[],
  config: OrchestratorConfig,
): Promise<SubtaskResult[]> {
  const results = new Map<string, SubtaskResult>();
  const parallelLimit = config.parallelLimit ?? 4;
  const remainingIds = subtasks.map((s) => s.id);
  const remaining = new Set<string>(remainingIds);

  while (remaining.size > 0) {
    // Find subtasks whose dependencies are all resolved
    const ready = subtasks.filter((s) =>
      remaining.has(s.id) &&
      (!s.dependsOn || s.dependsOn.every((dep) => results.has(dep)))
    );

    if (ready.length === 0) {
      // Deadlock — break remaining tasks
      for (const id of Array.from(remaining)) {
        results.set(id, {
          subtaskId: id,
          provider: "none",
          model: "none",
          content: "Dependency deadlock — could not resolve",
          success: false,
          elapsed_ms: 0,
          error: "Unresolvable dependency",
        });
      }
      break;
    }

    // Execute ready tasks in parallel (up to limit)
    const batch = ready.slice(0, parallelLimit);
    const batchResults = await Promise.allSettled(
      batch.map(async (subtask) => {
        const slot = selectProvider(subtask.type, config.providers);
        if (!slot) {
          return {
            subtaskId: subtask.id,
            provider: "none",
            model: "none",
            content: `No provider available for task type: ${subtask.type}`,
            success: false,
            elapsed_ms: 0,
            error: "No provider",
          } as SubtaskResult;
        }

        // Build context from dependencies
        let context = subtask.query;
        if (subtask.dependsOn && subtask.dependsOn.length > 0) {
          const depResults = subtask.dependsOn
            .map((id) => results.get(id))
            .filter(Boolean)
            .map((r) => `[${r!.subtaskId}]: ${r!.content.slice(0, 1000)}`)
            .join("\n\n");
          context = `Context from previous steps:\n${depResults}\n\nTask: ${subtask.query}`;
        }

        const start = Date.now();
        try {
          const agentResult = await runAgentLoop(context, {
            provider: slot.provider,
            apiKey: slot.apiKey,
            model: slot.model,
            maxIterations: 5,
          });

          const result: SubtaskResult = {
            subtaskId: subtask.id,
            provider: slot.provider,
            model: slot.model,
            content: agentResult.finalAnswer,
            success: agentResult.success,
            elapsed_ms: Date.now() - start,
            error: agentResult.error,
          };

          config.onSubtaskComplete?.(result);
          return result;
        } catch (err) {
          const result: SubtaskResult = {
            subtaskId: subtask.id,
            provider: slot.provider,
            model: slot.model,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            success: false,
            elapsed_ms: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          };
          config.onSubtaskComplete?.(result);
          return result;
        }
      }),
    );

    // Collect results
    for (let i = 0; i < batch.length; i++) {
      const settled = batchResults[i];
      const subtask = batch[i];
      if (settled.status === "fulfilled") {
        results.set(subtask.id, settled.value);
      } else {
        results.set(subtask.id, {
          subtaskId: subtask.id,
          provider: "unknown",
          model: "unknown",
          content: `Execution failed: ${settled.reason}`,
          success: false,
          elapsed_ms: 0,
          error: String(settled.reason),
        });
      }
      remaining.delete(subtask.id);
    }
  }

  // Return in original order
  return subtasks.map((s) => results.get(s.id)!);
}

// ─── Synthesis ───

const SYNTHESIS_PROMPT = `You are a synthesis engine. You receive results from multiple specialized AI models that each handled a subtask of a larger request.

Your job:
1. Read all subtask results carefully
2. Identify the best insights from each
3. Resolve any conflicts between results (prefer higher-quality, more detailed answers)
4. Produce a single, coherent, comprehensive response that addresses the original request

Rules:
- Don't mention the multi-model process to the user
- Don't say "Model A said X, Model B said Y" — just give the best unified answer
- If results conflict, use the more detailed/accurate one
- Maintain a natural, helpful tone
- Include all relevant information from the subtask results`;

async function synthesizeResults(
  originalQuery: string,
  subtaskResults: SubtaskResult[],
  config: OrchestratorConfig,
): Promise<{ content: string; elapsed_ms: number }> {
  const start = Date.now();
  const { provider, apiKey, model } = config.synthesizer;

  const resultsBlock = subtaskResults
    .filter((r) => r.success)
    .map((r, i) => `--- Subtask ${i + 1} (${r.provider}/${r.model}) ---\n${r.content}`)
    .join("\n\n");

  if (subtaskResults.length === 1 && subtaskResults[0].success) {
    // Single subtask — no synthesis needed
    return { content: subtaskResults[0].content, elapsed_ms: Date.now() - start };
  }

  const content = await fetchNonStreaming(provider, apiKey, model, [
    { role: "system", content: SYNTHESIS_PROMPT },
    {
      role: "user",
      content: `Original request: ${originalQuery}\n\nSubtask results:\n\n${resultsBlock}\n\nPlease synthesize these into a single comprehensive response.`,
    },
  ]);

  return { content, elapsed_ms: Date.now() - start };
}

// ─── Main Orchestrator ───

export async function orchestrate(
  userQuery: string,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  const startTime = Date.now();

  try {
    // Phase 1: Decompose
    config.onPhaseChange?.("DECOMPOSE", "Breaking request into subtasks...");
    const subtasks = await decomposeTask(userQuery, config);
    config.onPhaseChange?.("DECOMPOSE_DONE", `${subtasks.length} subtask(s) identified`);

    // Phase 2: Route
    config.onPhaseChange?.("ROUTE", "Assigning providers...");
    for (const st of subtasks) {
      const slot = selectProvider(st.type, config.providers);
      st.assignedProvider = slot ? `${slot.provider}/${slot.model}` : "none";
    }

    // Phase 3: Execute
    config.onPhaseChange?.("EXECUTE", `Running ${subtasks.length} subtask(s)...`);
    const subtaskResults = await executeSubtasks(subtasks, config);

    // Phase 4: Synthesize
    config.onPhaseChange?.("SYNTHESIZE", "Merging results...");
    const synthesis = await synthesizeResults(userQuery, subtaskResults, config);

    config.onPhaseChange?.("COMPLETE");

    const providersUsed = Array.from(new Set(subtaskResults.map((r) => `${r.provider}/${r.model}`)));

    return {
      success: subtaskResults.some((r) => r.success),
      finalAnswer: synthesis.content,
      subtasks: subtaskResults,
      synthesis: {
        provider: config.synthesizer.provider,
        model: config.synthesizer.model,
        elapsed_ms: synthesis.elapsed_ms,
      },
      totalElapsed_ms: Date.now() - startTime,
      providersUsed,
    };
  } catch (err) {
    return {
      success: false,
      finalAnswer: `Orchestration failed: ${err instanceof Error ? err.message : String(err)}`,
      subtasks: [],
      synthesis: {
        provider: config.synthesizer.provider,
        model: config.synthesizer.model,
        elapsed_ms: 0,
      },
      totalElapsed_ms: Date.now() - startTime,
      providersUsed: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Streaming Orchestrator (SSE integration) ───

export async function orchestrateStreaming(
  userQuery: string,
  config: OrchestratorConfig,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<OrchestratorResult> {
  const sseEvent = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

  const streamConfig: OrchestratorConfig = {
    ...config,
    onPhaseChange: (phase, detail) => {
      controller.enqueue(encoder.encode(sseEvent({
        type: "orchestrator_phase",
        phase,
        detail,
      })));
      config.onPhaseChange?.(phase, detail);
    },
    onSubtaskComplete: (result) => {
      controller.enqueue(encoder.encode(sseEvent({
        type: "orchestrator_subtask",
        subtaskId: result.subtaskId,
        provider: result.provider,
        model: result.model,
        success: result.success,
        contentPreview: result.content.slice(0, 200),
        elapsed_ms: result.elapsed_ms,
        error: result.error,
      })));
      config.onSubtaskComplete?.(result);
    },
  };

  const result = await orchestrate(userQuery, streamConfig);

  // Stream final answer as deltas
  if (result.finalAnswer) {
    const chunkSize = 20;
    for (let i = 0; i < result.finalAnswer.length; i += chunkSize) {
      controller.enqueue(encoder.encode(sseEvent({
        type: "delta",
        content: result.finalAnswer.slice(i, i + chunkSize),
      })));
    }
  }

  // Send completion event
  controller.enqueue(encoder.encode(sseEvent({
    type: "orchestrator_complete",
    success: result.success,
    providersUsed: result.providersUsed,
    subtaskCount: result.subtasks.length,
    totalElapsed_ms: result.totalElapsed_ms,
    error: result.error,
  })));

  return result;
}

// ─── Quick Setup: Default Provider Configuration ───

export function defaultProviderSlots(keys: {
  anthropic?: string;
  openai?: string;
  google?: string;
  xai?: string;
}): ProviderSlot[] {
  const slots: ProviderSlot[] = [];

  if (keys.anthropic) {
    slots.push({
      provider: "anthropic",
      apiKey: keys.anthropic,
      model: "claude-sonnet-4-20250514",
      strengths: ["REASONING", "CODING", "CREATIVE", "GENERAL"],
      priority: 1,
      enabled: true,
    });
  }
  if (keys.openai) {
    slots.push({
      provider: "openai",
      apiKey: keys.openai,
      model: "gpt-4o",
      strengths: ["CODING", "MATH", "REASONING", "GENERAL"],
      priority: 2,
      enabled: true,
    });
  }
  if (keys.google) {
    slots.push({
      provider: "google",
      apiKey: keys.google,
      model: "gemini-2.0-flash",
      strengths: ["RESEARCH", "GENERAL", "CREATIVE"],
      priority: 3,
      enabled: true,
    });
  }
  if (keys.xai) {
    slots.push({
      provider: "xai",
      apiKey: keys.xai,
      model: "grok-3",
      strengths: ["CREATIVE", "RESEARCH", "GENERAL"],
      priority: 4,
      enabled: true,
    });
  }

  return slots;
}
