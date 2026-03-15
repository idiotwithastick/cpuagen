"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { VFSTree, VFSNode } from "@/lib/vfs";
import {
  getTree,
  createFile,
  createFolder,
  deleteNode,
  renameNode,
  readFile,
  exportAsZip,
  importFiles,
  getWorkspaceStats,
  formatBytes,
  clearWorkspace,
} from "@/lib/vfs";

interface FileTreeProps {
  onOpenFile: (node: VFSNode) => void;
  refreshKey?: number;
}

// ─── Tree Node Component ───
function TreeNode({
  node,
  depth,
  onSelect,
  onDelete,
  onRename,
  onCreateChild,
  selectedId,
}: {
  node: VFSTree;
  depth: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onCreateChild: (parentId: string, type: "file" | "folder") => void;
  selectedId: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleRename = () => {
    if (editName.trim() && editName !== node.name) {
      onRename(node.id, editName.trim());
    }
    setEditing(false);
  };

  const isFolder = node.type === "folder";
  const isSelected = node.id === selectedId;

  // File icon based on language/type
  const getIcon = () => {
    if (isFolder) return expanded ? "\u{1F4C2}" : "\u{1F4C1}";
    const lang = node.language || "";
    const iconMap: Record<string, string> = {
      typescript: "TS", tsx: "TX", javascript: "JS", jsx: "JX",
      python: "PY", html: "<>", css: "#", json: "{}", markdown: "MD",
      rust: "RS", go: "GO", sql: "SQ", bash: "$_",
    };
    return iconMap[lang] || "\u{1F4C4}";
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer group transition-colors ${
          isSelected
            ? "bg-accent/15 text-accent-light"
            : "hover:bg-surface-light text-foreground"
        }`}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => {
          if (isFolder) setExpanded(!expanded);
          else onSelect(node.id);
        }}
      >
        {isFolder && (
          <span className="text-[10px] text-muted w-3 text-center select-none">
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
        )}
        {!isFolder && <span className="w-3" />}

        <span className={`text-[10px] font-mono w-5 text-center select-none ${
          isFolder ? "" : "text-accent-light/70"
        }`}>
          {getIcon()}
        </span>

        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setEditing(false);
            }}
            className="flex-1 bg-surface border border-accent/30 rounded px-1 py-0 text-[11px] text-foreground outline-none font-mono"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-[11px] truncate select-none">{node.name}</span>
        )}

        {/* Action buttons — visible on hover */}
        <div className="hidden group-hover:flex items-center gap-0.5 ml-auto">
          {isFolder && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onCreateChild(node.id, "file"); }}
                className="p-0.5 text-[9px] text-muted hover:text-foreground"
                title="New file"
              >
                +F
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCreateChild(node.id, "folder"); }}
                className="p-0.5 text-[9px] text-muted hover:text-foreground"
                title="New folder"
              >
                +D
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(node.name); }}
            className="p-0.5 text-[9px] text-muted hover:text-foreground"
            title="Rename"
          >
            \u270E
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            className="p-0.5 text-[9px] text-muted hover:text-danger"
            title="Delete"
          >
            \u2715
          </button>
        </div>
      </div>

      {/* Children */}
      {isFolder && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              onCreateChild={onCreateChild}
              selectedId={selectedId}
            />
          ))}
          {node.children.length === 0 && (
            <div
              className="text-[10px] text-muted italic"
              style={{ paddingLeft: (depth + 1) * 12 + 4 }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main FileTree Component ───
export default function FileTree({ onOpenFile, refreshKey }: FileTreeProps) {
  const [tree, setTree] = useState<VFSTree[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ fileCount: 0, folderCount: 0, totalSize: 0 });
  const [creating, setCreating] = useState<{ type: "file" | "folder"; parentId: string | null } | null>(null);
  const [newName, setNewName] = useState("");
  const newNameRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [t, s] = await Promise.all([getTree(), getWorkspaceStats()]);
    setTree(t);
    setStats(s);
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  useEffect(() => {
    if (creating && newNameRef.current) {
      newNameRef.current.focus();
    }
  }, [creating]);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    const node = await readFile(id);
    if (node) onOpenFile(node);
  };

  const handleDelete = async (id: string) => {
    await deleteNode(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const handleRename = async (id: string, name: string) => {
    await renameNode(id, name);
    refresh();
  };

  const handleCreateChild = (parentId: string, type: "file" | "folder") => {
    setCreating({ type, parentId });
    setNewName(type === "file" ? "untitled.ts" : "new-folder");
  };

  const handleCreateSubmit = async () => {
    if (!newName.trim() || !creating) return;
    if (creating.type === "file") {
      const node = await createFile(newName.trim(), creating.parentId);
      onOpenFile(node);
      setSelectedId(node.id);
    } else {
      await createFolder(newName.trim(), creating.parentId);
    }
    setCreating(null);
    setNewName("");
    refresh();
  };

  const handleExport = async () => {
    const blob = await exportAsZip();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cpuagen-workspace-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await importFiles(e.target.files, null);
      refresh();
    }
  };

  const handleClear = async () => {
    if (confirm("Clear entire workspace? This cannot be undone.")) {
      await clearWorkspace();
      setSelectedId(null);
      refresh();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono text-muted tracking-wider">WORKSPACE</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setCreating({ type: "file", parentId: null }); setNewName("untitled.ts"); }}
              className="p-1 text-[10px] text-muted hover:text-foreground"
              title="New file"
            >
              +F
            </button>
            <button
              onClick={() => { setCreating({ type: "folder", parentId: null }); setNewName("new-folder"); }}
              className="p-1 text-[10px] text-muted hover:text-foreground"
              title="New folder"
            >
              +D
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-[10px] text-muted hover:text-foreground"
              title="Import files"
            >
              \u2191
            </button>
            <button
              onClick={handleExport}
              className="p-1 text-[10px] text-muted hover:text-foreground"
              title="Export as .zip"
            >
              \u2193
            </button>
          </div>
        </div>
        <div className="text-[9px] text-muted font-mono">
          {stats.fileCount} files, {stats.folderCount} folders ({formatBytes(stats.totalSize)})
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleImport}
      />

      {/* New item form */}
      {creating && (
        <div className="px-3 py-2 border-b border-border bg-surface-light/30">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted">
              {creating.type === "file" ? "+F" : "+D"}
            </span>
            <input
              ref={newNameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSubmit();
                if (e.key === "Escape") setCreating(null);
              }}
              onBlur={handleCreateSubmit}
              className="flex-1 bg-surface border border-accent/30 rounded px-1.5 py-0.5 text-[11px] text-foreground outline-none font-mono"
              placeholder={creating.type === "file" ? "filename.ts" : "folder-name"}
            />
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 && !creating ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-muted mb-2">No files yet</p>
            <p className="text-[10px] text-muted">
              Create files or import from your device
            </p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onRename={handleRename}
              onCreateChild={handleCreateChild}
              selectedId={selectedId}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {stats.fileCount > 0 && (
        <div className="px-3 py-2 border-t border-border">
          <div className="flex items-center justify-between">
            <button
              onClick={handleExport}
              className="text-[10px] text-accent-light hover:underline"
            >
              Download .zip
            </button>
            <button
              onClick={handleClear}
              className="text-[10px] text-danger/60 hover:text-danger"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
