export type Provider = "anthropic" | "openai" | "google" | "xai";

export interface ProviderConfig {
  id: Provider;
  name: string;
  models: { id: string; name: string }[];
  defaultModel: string;
  apiKeyPlaceholder: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  enforcement?: EnforcementResult;
}

export interface ThermosolveSignature {
  n: number;
  S: number;
  dS: number;
  phi: number;
}

export interface CBFScheme {
  safe: boolean;
  value: number;
}

export interface CBFResult {
  BNR: CBFScheme;
  BNN: CBFScheme;
  BNA: CBFScheme;
  TSE: CBFScheme;
  PCD: CBFScheme;
  OGP: CBFScheme;
  ECM: CBFScheme;
  SPC: CBFScheme;
  allSafe: boolean;
}

export interface EnforcementStage {
  signature: ThermosolveSignature;
  cbf: CBFResult;
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

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    ],
    defaultModel: "claude-sonnet-4-20250514",
    apiKeyPlaceholder: "sk-ant-...",
  },
  {
    id: "openai",
    name: "OpenAI (GPT)",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "o3-mini", name: "o3-mini" },
    ],
    defaultModel: "gpt-4o",
    apiKeyPlaceholder: "sk-...",
  },
  {
    id: "google",
    name: "Google (Gemini)",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-pro", name: "Gemini 2.0 Pro" },
    ],
    defaultModel: "gemini-2.0-flash",
    apiKeyPlaceholder: "AIza...",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    models: [
      { id: "grok-3", name: "Grok 3" },
      { id: "grok-3-mini", name: "Grok 3 Mini" },
    ],
    defaultModel: "grok-3-mini",
    apiKeyPlaceholder: "xai-...",
  },
];
