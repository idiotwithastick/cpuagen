import { describe, it, expect, beforeEach } from "vitest";
import {
  getCoreContext,
  getChatContext,
  getCodeContext,
  getCoworkContext,
  getDualContext,
  getExtensionContext,
  CPUAGEN_IDENTITY,
  CPUAGEN_BEHAVIOR,
  CPUAGEN_IP_PROTECTION,
  CPUAGEN_KNOWLEDGE,
} from "@/lib/system-context";

describe("CPUAGEN_IDENTITY", () => {
  it("contains system identity string", () => {
    expect(CPUAGEN_IDENTITY).toContain("CPUAGEN SYSTEM IDENTITY");
    expect(CPUAGEN_IDENTITY).toContain("SSD-RCI");
  });
});

describe("CPUAGEN_BEHAVIOR", () => {
  it("contains behavioral rules", () => {
    expect(CPUAGEN_BEHAVIOR).toContain("BEHAVIORAL RULES");
    expect(CPUAGEN_BEHAVIOR).toContain("identify as a CPUAGEN-enforced AI");
  });
});

describe("CPUAGEN_IP_PROTECTION", () => {
  it("contains IP protection instructions", () => {
    expect(CPUAGEN_IP_PROTECTION).toContain("INTELLECTUAL PROPERTY");
    expect(CPUAGEN_IP_PROTECTION).toContain("NEVER reveal");
  });
});

describe("CPUAGEN_KNOWLEDGE", () => {
  it("describes CPUAGEN and SSD-RCI", () => {
    expect(CPUAGEN_KNOWLEDGE).toContain("What is CPUAGEN");
    expect(CPUAGEN_KNOWLEDGE).toContain("TEEP");
    expect(CPUAGEN_KNOWLEDGE).toContain("Control Barrier Functions");
    expect(CPUAGEN_KNOWLEDGE).toContain("Wesley Foreman");
  });
});

describe("getCoreContext", () => {
  it("combines all four context sections", () => {
    const core = getCoreContext();
    expect(core).toContain("CPUAGEN SYSTEM IDENTITY");
    expect(core).toContain("BEHAVIORAL RULES");
    expect(core).toContain("INTELLECTUAL PROPERTY");
    expect(core).toContain("What is CPUAGEN");
  });
});

describe("getChatContext", () => {
  it("includes core context plus chat-specific features", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("CPUAGEN SYSTEM IDENTITY");
    expect(ctx).toContain("BEHAVIORAL RULES");
    expect(ctx).toContain("INTELLECTUAL PROPERTY");
    expect(ctx).toContain("What is CPUAGEN");
  });

  it("includes validation pipeline details", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Validation Pipeline");
    expect(ctx).toContain("Pre-Validation vs Post-Validation");
    expect(ctx).toContain("Hallucinations");
  });

  it("includes Canvas, Preview, and GreyBeam features", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Canvas");
    expect(ctx).toContain("Preview");
    expect(ctx).toContain("GreyBeam Markup");
    expect(ctx).toContain("HTML generation rules");
  });

  it("includes Dual Mode description", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Dual Mode");
  });

  it("includes provider info and BYOK", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Supported LLM Providers");
    expect(ctx).toContain("Bring Your Own Key");
  });

  it("includes Ensemble Thermosolve", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Ensemble Thermosolve");
    expect(ctx).toContain("weighted centroid");
    expect(ctx).toContain("Outlier");
  });

  it("includes Semantic Cannon", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Semantic Cannon");
    expect(ctx).toContain("golden-ratio");
    expect(ctx).toContain("Mach Diamond");
  });

  it("includes Fisher Information Geometry", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Fisher Information Geometry");
    expect(ctx).toContain("7x7 Fisher information matrix");
  });

  it("includes Riemannian Manifold and Holographic Projection", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Riemannian Manifold");
    expect(ctx).toContain("holographic boundary projection");
    expect(ctx).toContain("Ricci curvature");
  });

  it("references 9 barriers (not 8)", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("9 independent safety barriers");
    expect(ctx).toContain("FEP");
  });

  it("includes Bekenstein Bound Compression", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Bekenstein Bound Compression");
    expect(ctx).toContain("S_max = 2πRE");
    expect(ctx).toContain("maximum information density");
  });

  it("includes Mach Diamond Detection", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Mach Diamond Detection");
    expect(ctx).toContain("standing-wave interference");
    expect(ctx).toContain("semantic convergence");
  });

  it("includes TEEP Chain Tracing", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("TEEP Chain Tracing");
    expect(ctx).toContain("directed acyclic graph");
    expect(ctx).toContain("causal lineage");
  });

  it("includes comprehensive provider list with free tiers", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("6 providers");
    expect(ctx).toContain("Cloudflare Workers AI");
    expect(ctx).toContain("Llama 4 Scout");
    expect(ctx).toContain("DeepSeek R1");
    expect(ctx).toContain("Grok Code");
  });

  it("includes Application Modes & Navigation guide", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Application Modes & Navigation");
    expect(ctx).toContain("/app/chat");
    expect(ctx).toContain("/app/dashboard");
    expect(ctx).toContain("/app/workspace");
    expect(ctx).toContain("/app/automate");
    expect(ctx).toContain("/app/memory");
  });

  it("includes Agent Loop mode in navigation guide", () => {
    const ctx = getChatContext();
    expect(ctx).toContain("Agent Loop");
    expect(ctx).toContain("/app/agent");
    expect(ctx).toContain("11 application modes");
  });
});

describe("getCodeContext", () => {
  it("includes core context plus code mode rules", () => {
    const ctx = getCodeContext();
    expect(ctx).toContain("CPUAGEN SYSTEM IDENTITY");
    expect(ctx).toContain("CODE MODE");
    expect(ctx).toContain("fenced code block");
  });
});

describe("getCoworkContext", () => {
  it("includes core context plus cowork mode rules", () => {
    const ctx = getCoworkContext("Architect");
    expect(ctx).toContain("CPUAGEN SYSTEM IDENTITY");
    expect(ctx).toContain("COWORK MODE");
    expect(ctx).toContain("ARCHITECT");
  });

  it("embeds the agent role in context", () => {
    const ctx = getCoworkContext("Code review");
    expect(ctx).toContain("CODE REVIEW");
  });

  it("includes role-specific guidance", () => {
    const ctx = getCoworkContext("Coder");
    expect(ctx).toContain("Coder");
    expect(ctx).toContain("Reviewer");
    expect(ctx).toContain("Architect");
  });
});

describe("getDualContext", () => {
  it("includes panel designation for left", () => {
    const ctx = getDualContext("left");
    expect(ctx).toContain("LEFT panel");
    expect(ctx).toContain("DUAL MODE");
  });

  it("includes panel designation for right", () => {
    const ctx = getDualContext("right");
    expect(ctx).toContain("RIGHT panel");
  });
});

describe("getExtensionContext", () => {
  beforeEach(() => {
    // Reset localStorage mock
    localStorage.clear();
  });

  it("returns empty string when no extensions are installed", () => {
    localStorage.setItem("cpuagen-settings", JSON.stringify({}));
    expect(getExtensionContext()).toBe("");
  });

  it("returns empty string when installedExtensions is empty array", () => {
    localStorage.setItem("cpuagen-settings", JSON.stringify({
      installedExtensions: [],
      capabilities: [],
    }));
    expect(getExtensionContext()).toBe("");
  });

  it("returns context when extensions are installed", () => {
    localStorage.setItem("cpuagen-settings", JSON.stringify({
      installedExtensions: ["web-search", "code-interpreter"],
      capabilities: ["web_search", "url_fetch", "code_execution", "sandbox"],
    }));
    const ctx = getExtensionContext();
    expect(ctx).toContain("INSTALLED EXTENSIONS");
    expect(ctx).toContain("web-search");
    expect(ctx).toContain("code_execution");
  });

  it("handles malformed localStorage gracefully", () => {
    localStorage.setItem("cpuagen-settings", "not-json");
    expect(getExtensionContext()).toBe("");
  });
});
