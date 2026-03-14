// Persistent Memory — Cloudflare D1 backed conversation & memory storage

const D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595";
const CF_ACCOUNT_ID =
  process.env.CF_ACCOUNT_ID || "b621d14f660c227bfec605351679bb86";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  if (!CF_API_TOKEN) return [];
  const res = await fetch(`${D1_API_BASE}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    success: boolean;
    result: { results: T[] }[];
  };
  if (!data.success) return [];
  return data.result?.[0]?.results || [];
}

async function d1Exec(sql: string, params: (string | number | null)[] = []) {
  if (!CF_API_TOKEN) return false;
  const res = await fetch(`${D1_API_BASE}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  return res.ok;
}

// ─── Table Setup ───

export async function ensureMemoryTables(): Promise<boolean> {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      messages TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id, category)`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY DEFAULT 'default',
      preferences TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    )`,
  ];
  for (const sql of sqls) {
    const ok = await d1Exec(sql);
    if (!ok) return false;
  }
  return true;
}

// ─── Conversations ───

export async function saveConversation(
  id: string,
  title: string,
  messages: unknown[],
  userId = "default",
): Promise<boolean> {
  const now = Date.now();
  return d1Exec(
    `INSERT INTO conversations (id, user_id, title, messages, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=?, messages=?, updated_at=?`,
    [id, userId, title, JSON.stringify(messages), now, now, title, JSON.stringify(messages), now],
  );
}

export async function listConversations(
  userId = "default",
  limit = 50,
  offset = 0,
): Promise<{ id: string; title: string; created_at: number; updated_at: number; message_count: number }[]> {
  const rows = await d1Query<{
    id: string;
    title: string;
    created_at: number;
    updated_at: number;
    messages: string;
  }>(
    "SELECT id, title, created_at, updated_at, messages FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
    [userId, limit, offset],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    created_at: r.created_at,
    updated_at: r.updated_at,
    message_count: JSON.parse(r.messages || "[]").length,
  }));
}

export async function getConversation(id: string, userId = "default") {
  const rows = await d1Query<{
    id: string;
    title: string;
    messages: string;
    created_at: number;
    updated_at: number;
  }>("SELECT * FROM conversations WHERE id = ? AND user_id = ?", [id, userId]);
  if (!rows[0]) return null;
  return {
    ...rows[0],
    messages: JSON.parse(rows[0].messages || "[]"),
  };
}

export async function deleteConversation(id: string, userId = "default") {
  return d1Exec("DELETE FROM conversations WHERE id = ? AND user_id = ?", [id, userId]);
}

// ─── User Memories (persistent facts the AI remembers) ───

export async function saveMemory(
  content: string,
  category = "general",
  userId = "default",
): Promise<string> {
  const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await d1Exec(
    "INSERT INTO memories (id, user_id, category, content, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, userId, category, content, Date.now()],
  );
  return id;
}

export async function listMemories(
  userId = "default",
  category?: string,
): Promise<{ id: string; category: string; content: string; created_at: number }[]> {
  if (category) {
    return d1Query(
      "SELECT id, category, content, created_at FROM memories WHERE user_id = ? AND category = ? ORDER BY created_at DESC",
      [userId, category],
    );
  }
  return d1Query(
    "SELECT id, category, content, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
}

export async function deleteMemory(id: string, userId = "default") {
  return d1Exec("DELETE FROM memories WHERE id = ? AND user_id = ?", [id, userId]);
}

// ─── User Preferences ───

export async function getPreferences(userId = "default"): Promise<Record<string, unknown>> {
  const rows = await d1Query<{ preferences: string }>(
    "SELECT preferences FROM user_preferences WHERE user_id = ?",
    [userId],
  );
  if (!rows[0]) return {};
  return JSON.parse(rows[0].preferences || "{}");
}

export async function savePreferences(prefs: Record<string, unknown>, userId = "default") {
  return d1Exec(
    `INSERT INTO user_preferences (user_id, preferences, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET preferences=?, updated_at=?`,
    [userId, JSON.stringify(prefs), Date.now(), JSON.stringify(prefs), Date.now()],
  );
}
