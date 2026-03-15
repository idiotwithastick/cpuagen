// Virtual File System — IndexedDB-backed persistent workspace
// Provides a file/folder tree that survives browser restarts

import { openDB, type IDBPDatabase } from "idb";

export interface VFSNode {
  id: string;
  name: string;
  type: "file" | "folder";
  parentId: string | null; // null = root
  content?: string; // file content (folders have no content)
  language?: string; // detected or set language
  createdAt: number;
  updatedAt: number;
  size: number; // byte length of content
}

export interface VFSTree {
  id: string;
  name: string;
  type: "file" | "folder";
  language?: string;
  children?: VFSTree[];
  size: number;
  updatedAt: number;
}

const DB_NAME = "cpuagen-vfs";
const DB_VERSION = 1;
const STORE_NAME = "files";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("parentId", "parentId", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("name", "name", { unique: false });
      },
    });
  }
  return dbPromise;
}

/** Generate a unique ID */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Detect language from file extension */
export function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", java: "java",
    html: "html", htm: "html", css: "css", scss: "scss",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    md: "markdown", txt: "text", sql: "sql", sh: "bash",
    xml: "xml", svg: "svg", c: "c", cpp: "cpp", h: "c",
    rb: "ruby", php: "php", swift: "swift", kt: "kotlin",
    r: "r", lua: "lua", zig: "zig", dockerfile: "dockerfile",
  };
  return map[ext] || "text";
}

// ─── CRUD Operations ───

/** Create a new file */
export async function createFile(
  name: string,
  parentId: string | null,
  content = "",
  language?: string,
): Promise<VFSNode> {
  const db = await getDB();
  const node: VFSNode = {
    id: uid(),
    name,
    type: "file",
    parentId,
    content,
    language: language || detectLanguage(name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    size: new Blob([content]).size,
  };
  await db.put(STORE_NAME, node);
  return node;
}

/** Create a new folder */
export async function createFolder(
  name: string,
  parentId: string | null,
): Promise<VFSNode> {
  const db = await getDB();
  const node: VFSNode = {
    id: uid(),
    name,
    type: "folder",
    parentId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    size: 0,
  };
  await db.put(STORE_NAME, node);
  return node;
}

/** Read a file's content */
export async function readFile(id: string): Promise<VFSNode | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

/** Update file content */
export async function writeFile(id: string, content: string): Promise<VFSNode | undefined> {
  const db = await getDB();
  const node = await db.get(STORE_NAME, id);
  if (!node) return undefined;
  node.content = content;
  node.size = new Blob([content]).size;
  node.updatedAt = Date.now();
  await db.put(STORE_NAME, node);
  return node;
}

/** Rename a file or folder */
export async function renameNode(id: string, newName: string): Promise<VFSNode | undefined> {
  const db = await getDB();
  const node = await db.get(STORE_NAME, id);
  if (!node) return undefined;
  node.name = newName;
  if (node.type === "file") {
    node.language = detectLanguage(newName);
  }
  node.updatedAt = Date.now();
  await db.put(STORE_NAME, node);
  return node;
}

/** Move a node to a different parent */
export async function moveNode(id: string, newParentId: string | null): Promise<VFSNode | undefined> {
  const db = await getDB();
  const node = await db.get(STORE_NAME, id);
  if (!node) return undefined;
  node.parentId = newParentId;
  node.updatedAt = Date.now();
  await db.put(STORE_NAME, node);
  return node;
}

/** Delete a node and all its descendants */
export async function deleteNode(id: string): Promise<void> {
  const db = await getDB();
  // Recursively find all children
  const toDelete = [id];
  const stack = [id];
  while (stack.length > 0) {
    const parentId = stack.pop()!;
    const children = await db.getAllFromIndex(STORE_NAME, "parentId", parentId);
    for (const child of children) {
      toDelete.push(child.id);
      if (child.type === "folder") {
        stack.push(child.id);
      }
    }
  }
  const tx = db.transaction(STORE_NAME, "readwrite");
  for (const delId of toDelete) {
    tx.store.delete(delId);
  }
  await tx.done;
}

/** Get all children of a parent */
export async function getChildren(parentId: string | null): Promise<VFSNode[]> {
  const db = await getDB();
  if (parentId === null) {
    // Root items: get all nodes with null parentId
    const all = await db.getAll(STORE_NAME);
    return all.filter((n) => n.parentId === null);
  }
  return db.getAllFromIndex(STORE_NAME, "parentId", parentId);
}

/** Get all files (flat list) */
export async function getAllFiles(): Promise<VFSNode[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter((n) => n.type === "file");
}

/** Get all nodes */
export async function getAllNodes(): Promise<VFSNode[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

/** Build a tree structure from flat nodes */
export async function getTree(): Promise<VFSTree[]> {
  const all = await getAllNodes();
  const nodeMap = new Map<string, VFSTree & { parentId: string | null }>();

  for (const n of all) {
    nodeMap.set(n.id, {
      id: n.id,
      name: n.name,
      type: n.type,
      language: n.language,
      children: n.type === "folder" ? [] : undefined,
      size: n.size,
      updatedAt: n.updatedAt,
      parentId: n.parentId,
    });
  }

  const roots: VFSTree[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent?.children) {
        parent.children.push(node);
      } else {
        // Orphaned node — treat as root
        roots.push(node);
      }
    }
  }

  // Sort: folders first, then alphabetically
  const sortNodes = (nodes: VFSTree[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  };
  sortNodes(roots);
  return roots;
}

/** Get total workspace size */
export async function getWorkspaceStats(): Promise<{ fileCount: number; folderCount: number; totalSize: number }> {
  const all = await getAllNodes();
  let fileCount = 0;
  let folderCount = 0;
  let totalSize = 0;
  for (const n of all) {
    if (n.type === "file") {
      fileCount++;
      totalSize += n.size;
    } else {
      folderCount++;
    }
  }
  return { fileCount, folderCount, totalSize };
}

/** Format bytes for display */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Export entire workspace as a zip file */
export async function exportAsZip(): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const all = await getAllNodes();

  // Build path map
  const pathMap = new Map<string, string>();
  const buildPath = (id: string): string => {
    if (pathMap.has(id)) return pathMap.get(id)!;
    const node = all.find((n) => n.id === id);
    if (!node) return "";
    if (node.parentId === null) {
      pathMap.set(id, node.name);
      return node.name;
    }
    const parentPath = buildPath(node.parentId);
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    pathMap.set(id, fullPath);
    return fullPath;
  };

  for (const node of all) {
    if (node.type === "file") {
      const path = buildPath(node.id);
      zip.file(path, node.content || "");
    }
  }

  return zip.generateAsync({ type: "blob" });
}

/** Import files from a FileList (e.g., drag-and-drop) */
export async function importFiles(
  files: FileList,
  parentId: string | null,
): Promise<VFSNode[]> {
  const created: VFSNode[] = [];
  for (const file of Array.from(files)) {
    const content = await file.text();
    const node = await createFile(file.name, parentId, content);
    created.push(node);
  }
  return created;
}

/** Clear entire workspace */
export async function clearWorkspace(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

/** Get file by path (e.g., "src/index.ts") */
export async function getFileByPath(path: string): Promise<VFSNode | undefined> {
  const parts = path.split("/").filter(Boolean);
  const all = await getAllNodes();

  let parentId: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    const isLast = i === parts.length - 1;
    const match = all.find(
      (n) => n.name === name && n.parentId === parentId && n.type === (isLast ? "file" : "folder"),
    );
    if (!match) {
      // Try as file even for intermediate parts
      if (isLast) {
        return all.find((n) => n.name === name && n.parentId === parentId);
      }
      return undefined;
    }
    if (isLast) return match;
    parentId = match.id;
  }
  return undefined;
}

/** Create file with path, creating intermediate folders as needed */
export async function createFileWithPath(
  path: string,
  content = "",
): Promise<VFSNode> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop()!;
  const all = await getAllNodes();

  let parentId: string | null = null;
  for (const folderName of parts) {
    const existing = all.find(
      (n) => n.name === folderName && n.parentId === parentId && n.type === "folder",
    );
    if (existing) {
      parentId = existing.id;
    } else {
      const folder = await createFolder(folderName, parentId);
      all.push(folder); // track for subsequent iterations
      parentId = folder.id;
    }
  }

  return createFile(fileName, parentId, content);
}
