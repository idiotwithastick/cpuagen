# Breadcrumb: VFS Workspace Feature — Build & Deploy

**Date:** 2026-03-14
**Status:** DEPLOYED to cpuagen.com
**Route:** /app/workspace

## What Was Built

### Virtual File System (IndexedDB-backed)
- `src/lib/vfs.ts` — Full CRUD persistence layer using `idb` package
  - createFile, createFolder, readFile, writeFile, renameNode, moveNode, deleteNode
  - getTree() builds hierarchical tree from flat IndexedDB store
  - getFileByPath(), createFileWithPath() with auto-intermediate folders
  - exportAsZip() via JSZip, importFiles() from FileList
  - detectLanguage() maps file extensions to language strings

### File Tree Sidebar Component
- `src/components/FileTree.tsx` — Recursive tree with CRUD UI
  - Expand/collapse folders, inline rename
  - Hover action buttons (rename, delete)
  - Create file/folder, import files, export .zip, clear workspace
  - File type icons (TS, JS, PY, HTML, CSS, JSON, etc.)

### Workspace Page
- `src/app/app/workspace/page.tsx` — Combined IDE experience
  - File tree sidebar (left panel)
  - Tabbed file editor with line numbers (center)
  - HTML/SVG preview via sandboxed iframe
  - AI chat tab with file context awareness
  - Ctrl+S keyboard shortcut for save
  - AI auto-detects `// filename: path` in code blocks → auto-saves to VFS

## Decisions Made

1. **Replaced Canvas component with inline textarea** — Canvas required `onClose` and `onSendToChat` props not available in workspace context. Simple textarea with line numbers is sufficient for MVP.
2. **Replaced Preview component with inline iframe** — Same prop compatibility issue. Inline `srcDoc` iframe for HTML preview.
3. **AI chat uses open files as context** — All currently open file tabs are included in the system prompt, enabling the AI to read and modify workspace files.
4. **Auto-save from AI responses** — Code blocks with `// filename: path` pattern are auto-detected and saved to VFS, creating new files or updating existing ones.

## Build Verification
- `npx next build` — CLEAN, all routes compiled
- `npx vercel --prod` — Deployed successfully
- Production URL: https://cpuagen.com/app/workspace

## Next Steps
- Add syntax highlighting (Monaco editor or CodeMirror)
- File System Access API for Chrome/Edge real folder sync
- Test suite for VFS operations
- Canvas integration for visual editing
