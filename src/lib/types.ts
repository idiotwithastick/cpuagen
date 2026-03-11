export type Provider = "anthropic" | "openai" | "google" | "xai" | "demo";

export interface ProviderConfig {
  id: Provider;
  name: string;
  models: { id: string; name: string }[];
  defaultModel: string;
  apiKeyPlaceholder: string;
  noKeyRequired?: boolean;
}

export interface FileAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  preview?: string;
}

export const FILE_LIMITS = {
  maxFileSize: 20 * 1024 * 1024,
  maxFilesPerMessage: 5,
  allowedMimeTypes: [
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "text/plain", "text/markdown", "text/csv",
    "text/x-python", "text/javascript", "text/typescript",
    "application/json", "text/xml", "text/html", "text/css",
  ],
  codeExtensions: /\.(py|js|ts|tsx|jsx|rs|go|java|c|cpp|h|rb|php|sh|bat|yaml|yml|toml|ini|cfg|sql|md|txt|csv|json|xml|r|m|swift|kt|scala|zig|lua|pl|ex|exs|clj|hs|erl|v|sv|vhd|asm|s|cmake|makefile|dockerfile)$/i,
} as const;

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
  xai?: string;
}

export interface Settings {
  activeProvider: Provider;
  activeModel: string;
  systemPrompt: string;
  apiKeys: ApiKeys;
}

export function migrateSettings(raw: Record<string, unknown>): Settings {
  if (raw.apiKeys && raw.activeProvider) {
    return raw as unknown as Settings;
  }
  const oldProvider = (raw.provider as Provider) || "demo";
  const oldApiKey = (raw.apiKey as string) || "";
  const oldModel = (raw.model as string) || "";
  const oldSystemPrompt = (raw.systemPrompt as string) || "";
  const apiKeys: ApiKeys = {};
  if (oldApiKey && oldProvider !== "demo") {
    apiKeys[oldProvider as keyof ApiKeys] = oldApiKey;
  }
  return { activeProvider: oldProvider, activeModel: oldModel, systemPrompt: oldSystemPrompt, apiKeys };
}

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: "demo",
  activeModel: "gemini-2.0-flash",
  systemPrompt: "",
  apiKeys: {},
};

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  enforcement?: EnforcementResult;
  attachments?: FileAttachment[];
}

export interface ValidationSignature {
  n: number;
  phi: number;
  [key: string]: number;
}

export interface BarrierScheme {
  safe: boolean;
  value: number;
}

export interface BarrierResult {
  [key: string]: BarrierScheme | boolean;
  allSafe: boolean;
}

export interface EnforcementStage {
  signature: ValidationSignature;
  cbf: BarrierResult;
  teepId?: string;
}

export interface EnforcementResult {
  pre: EnforcementStage;
  post?: EnforcementStage;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/* ─── GreyBeam Annotation Types ─── */

export type AnnotationType =
  | "line" | "arrow" | "circle" | "rectangle" | "cloud"
  | "polyline" | "freehand" | "callout" | "highlight" | "hatch"
  | "stamp" | "count" | "measure" | "text";

export type StampType = "APPROVED" | "REJECTED" | "REVISED" | "REVIEWED" | "DRAFT" | "VOID" | "PRELIMINARY" | "FINAL";

export interface AnnotationBase {
  type: AnnotationType;
  color: string;
  width: number;
}

export interface DragAnnotation extends AnnotationBase {
  type: "line" | "arrow" | "circle" | "rectangle" | "cloud" | "highlight" | "hatch" | "callout" | "measure";
  x1: number; y1: number;
  x2: number; y2: number;
  text?: string;
  unit?: string;
  measureScale?: number;
}

export interface PointAnnotation extends AnnotationBase {
  type: "freehand" | "polyline";
  points: { x: number; y: number }[];
}

export interface ClickAnnotation extends AnnotationBase {
  type: "stamp" | "count" | "text";
  x: number; y: number;
  text?: string;
  stampType?: StampType;
  number?: number;
}

export type Annotation = DragAnnotation | PointAnnotation | ClickAnnotation;

export type PageAnnotations = Record<number, Annotation[]>;

export interface AnnotationCommand {
  action: "add" | "clear" | "undo" | "redo" | "set-tool" | "set-color" | "export";
  page?: number;
  annotation?: Annotation;
  tool?: AnnotationType | "select";
  color?: string;
  width?: number;
}

export interface MarkupState {
  pdfName: string | null;
  pageCount: number;
  currentPage: number;
  annotations: PageAnnotations;
  activeTool: string;
  activeColor: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "demo",
    name: "Free (Demo)",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ],
    defaultModel: "gemini-2.0-flash",
    apiKeyPlaceholder: "",
    noKeyRequired: true,
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
    defaultModel: "claude-sonnet-4-6",
    apiKeyPlaceholder: "sk-ant-...",
  },
  {
    id: "openai",
    name: "OpenAI (GPT)",
    models: [
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-5.4-pro", name: "GPT-5.4 Pro" },
      { id: "gpt-5.3-codex", name: "Codex 5.3" },
      { id: "o3", name: "o3 (Reasoning)" },
      { id: "o4-mini", name: "o4-mini" },
    ],
    defaultModel: "gpt-5.4",
    apiKeyPlaceholder: "sk-...",
  },
  {
    id: "google",
    name: "Google (Gemini)",
    models: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
    ],
    defaultModel: "gemini-3.1-pro-preview",
    apiKeyPlaceholder: "AIza...",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    models: [
      { id: "grok-4-1-fast-reasoning", name: "Grok 4.1 (Reasoning)" },
      { id: "grok-4-1-fast-non-reasoning", name: "Grok 4.1 Fast" },
      { id: "grok-code-fast-1", name: "Grok Code" },
    ],
    defaultModel: "grok-4-1-fast-reasoning",
    apiKeyPlaceholder: "xai-...",
  },
];
