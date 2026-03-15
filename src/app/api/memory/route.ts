import { NextRequest } from "next/server";
import {
  ensureMemoryTables,
  saveConversation,
  listConversations,
  getConversation,
  deleteConversation,
  saveMemory,
  listMemories,
  deleteMemory,
  getPreferences,
  savePreferences,
} from "@/lib/memory-db";
import { thermosolve, cbfCheck } from "@/lib/enforcement";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await ensureMemoryTables();
  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("resource") || "conversations";
  const userId = searchParams.get("user_id") || "default";

  try {
    const sig = thermosolve(`memory-get:${resource}:${userId}`);
    const cbf = cbfCheck(sig);
    if (!cbf.safe) {
      return Response.json(
        { ok: false, error: "Request blocked by enforcement", barriers: cbf.failures },
        { status: 403 },
      );
    }

    if (resource === "conversations") {
      const id = searchParams.get("id");
      if (id) {
        const conv = await getConversation(id, userId);
        return Response.json({ ok: true, conversation: conv });
      }
      const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
      const offset = parseInt(searchParams.get("offset") || "0");
      const conversations = await listConversations(userId, limit, offset);
      return Response.json({ ok: true, conversations });
    }

    if (resource === "memories") {
      const category = searchParams.get("category") || undefined;
      const memories = await listMemories(userId, category);
      return Response.json({ ok: true, memories });
    }

    if (resource === "preferences") {
      const prefs = await getPreferences(userId);
      return Response.json({ ok: true, preferences: prefs });
    }

    return Response.json({ ok: false, error: "Unknown resource" }, { status: 400 });
  } catch (error) {
    console.error("Memory API GET error:", error);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await ensureMemoryTables();
  const body = await req.json();
  const { action, user_id: userId = "default" } = body;

  try {
    const sig = thermosolve(`memory-post:${action}:${userId}`);
    const cbf = cbfCheck(sig);
    if (!cbf.safe) {
      return Response.json(
        { ok: false, error: "Request blocked by enforcement", barriers: cbf.failures },
        { status: 403 },
      );
    }

    if (action === "save_conversation") {
      const { id, title, messages } = body;
      if (!id || !messages) {
        return Response.json({ ok: false, error: "id and messages required" }, { status: 400 });
      }
      await saveConversation(id, title || "Untitled", messages, userId);
      return Response.json({ ok: true });
    }

    if (action === "delete_conversation") {
      const { id } = body;
      if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
      await deleteConversation(id, userId);
      return Response.json({ ok: true });
    }

    if (action === "save_memory") {
      const { content, category } = body;
      if (!content) return Response.json({ ok: false, error: "content required" }, { status: 400 });
      const id = await saveMemory(content, category || "general", userId);
      return Response.json({ ok: true, id });
    }

    if (action === "delete_memory") {
      const { id } = body;
      if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
      await deleteMemory(id, userId);
      return Response.json({ ok: true });
    }

    if (action === "save_preferences") {
      const { preferences } = body;
      if (!preferences) return Response.json({ ok: false, error: "preferences required" }, { status: 400 });
      await savePreferences(preferences, userId);
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Memory API POST error:", error);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
