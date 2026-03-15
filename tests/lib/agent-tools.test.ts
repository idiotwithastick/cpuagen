import { describe, it, expect } from "vitest";
import {
  AGENT_TOOLS,
  toolsForOpenAI,
  toolsForAnthropic,
  parseOpenAIToolCalls,
  parseAnthropicToolCalls,
} from "@/lib/agent-tools";

describe("AGENT_TOOLS", () => {
  it("has at least one tool defined", () => {
    expect(AGENT_TOOLS.length).toBeGreaterThan(0);
  });

  it("each tool has required fields", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("parameters");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it("tool names are unique", () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("toolsForOpenAI", () => {
  it("wraps each tool in OpenAI format", () => {
    const result = toolsForOpenAI();
    expect(result.length).toBe(AGENT_TOOLS.length);
    for (const item of result) {
      expect(item.type).toBe("function");
      expect(item.function).toHaveProperty("name");
      expect(item.function).toHaveProperty("description");
      expect(item.function).toHaveProperty("parameters");
    }
  });
});

describe("toolsForAnthropic", () => {
  it("maps tools to Anthropic format", () => {
    const result = toolsForAnthropic();
    expect(result.length).toBe(AGENT_TOOLS.length);
    for (const item of result) {
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("description");
      expect(item).toHaveProperty("input_schema");
    }
  });
});

describe("parseOpenAIToolCalls", () => {
  it("parses well-formed tool calls", () => {
    const raw = [
      { id: "call_1", function: { name: "web_search", arguments: '{"query":"test"}' } },
      { id: "call_2", function: { name: "read_file", arguments: '{"path":"/tmp/a.txt"}' } },
    ];
    const result = parseOpenAIToolCalls(raw);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("call_1");
    expect(result[0].name).toBe("web_search");
    expect(result[0].arguments).toEqual({ query: "test" });
    expect(result[1].name).toBe("read_file");
  });

  it("returns empty array for empty input", () => {
    expect(parseOpenAIToolCalls([])).toEqual([]);
  });
});

describe("parseAnthropicToolCalls", () => {
  it("filters only tool_use blocks", () => {
    const blocks = [
      { type: "text", text: "Hello" },
      { type: "tool_use", id: "tu_1", name: "web_search", input: { query: "test" } },
      { type: "text", text: "Done" },
      { type: "tool_use", id: "tu_2", name: "read_file", input: { path: "/a.txt" } },
    ];
    const result = parseAnthropicToolCalls(blocks);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("tu_1");
    expect(result[0].name).toBe("web_search");
    expect(result[0].arguments).toEqual({ query: "test" });
  });

  it("handles missing optional fields gracefully", () => {
    const blocks = [{ type: "tool_use" }];
    const result = parseAnthropicToolCalls(blocks);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("unknown");
    expect(result[0].arguments).toEqual({});
  });

  it("returns empty for no tool_use blocks", () => {
    const blocks = [{ type: "text" }, { type: "image" }];
    expect(parseAnthropicToolCalls(blocks)).toEqual([]);
  });
});
