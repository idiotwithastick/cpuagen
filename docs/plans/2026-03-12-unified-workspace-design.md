# Unified Workspace Design — ChatGPT Canvas Style

**Date:** 2026-03-12
**Status:** Approved
**Approach:** A (In-Place Refactor of chat/page.tsx)

## Goal

Merge Chat + Code into a single unified workspace page at `/app/chat`. Chat on left with switchable layout modes, persistent artifact panel on right with tabbed files, inline edit bar, and auto-open behavior for code blocks. Multiple left-panel layouts showcase CPUAGEN's model-agnosticism.

## Page Architecture

```
┌─────────────────────────────────────────────────────────┐
│ [Layout: Chat ▾] [Provider/Model ▾] [+ New] [⚡ LIVE]  │
├──────────────────────┬──────────────────────────────────┤
│                      │  [file1.py] [app.tsx] [+]        │
│   LEFT PANEL         │  ┌────────────────────────────┐  │
│   (varies by mode)   │  │                            │  │
│                      │  │   Code Editor               │  │
│   Chat / Dual /      │  │   (syntax highlighted)      │  │
│   Arena / Multi      │  │                            │  │
│                      │  └────────────────────────────┘  │
├──────────────────────┤  [Preview] [Copy] [Revert]       │
│   [input bar]        │  [edit instruction bar]          │
└──────────────────────┴──────────────────────────────────┘
```

## Left Panel Layout Modes

| Mode | Layout | Provider Config | Purpose |
|------|--------|----------------|---------|
| **Chat** | Single chat stream | 1 provider selector | Default conversational UX |
| **Dual** | Split horizontal, 2 panels | Independent provider per panel | Side-by-side comparison |
| **Arena** | Split with vote buttons | Auto-assigned (hidden until vote) | Blind comparison + voting |
| **Multi** | 3-4 mini panels grid | Independent provider per panel | Maximum model-agnostic flex |

All modes share the same artifact panel on right. Any mode producing code → auto-opens in artifact.

## Artifact Panel (Right)

- **Tabbed files:** Each AI-generated code block creates/updates a tab
- **Mini file tree:** Collapsible left edge showing all files
- **Code editor:** Textarea with syntax-aware font, line numbers optional
- **Preview:** For HTML/SVG/Markdown artifacts
- **Inline edit bar:** "Tell AI to edit this code..." input at bottom
- **Controls:** Copy, Revert (undo last AI edit), Download
- **Auto-open:** When AI generates code, artifact panel opens automatically
- **Closeable:** X button collapses back to full-width chat

## Code Block Handling in Chat

When AI response contains ` ```lang filename.ext `:
1. Extract code block from response text
2. Create/update file tab in artifact panel
3. Replace code block in chat with compact chip: `[📄 filename.ext — Created] [Open]`
4. Auto-focus the new tab in artifact panel

## Inline Edit Flow

1. User types instruction in artifact panel's edit bar
2. System sends: current file content + instruction to API
3. AI response streams back, code extracted and applied to editor
4. Chat shows compact chip: `[🎨 "add error handling" → filename.ext]`
5. No full code block in chat — keeps chat clean

## New Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `ArtifactPanel` | `src/components/ArtifactPanel.tsx` | Tabbed files, editor, preview, inline edit bar |
| `LayoutModeSelector` | inline in chat page | Dropdown to switch left panel mode |
| `DualChatLayout` | `src/components/layouts/DualChat.tsx` | Two independent chat streams |
| `ArenaChatLayout` | `src/components/layouts/ArenaChat.tsx` | Blind comparison + voting |
| `MultiChatLayout` | `src/components/layouts/MultiChat.tsx` | 3-4 panel grid |
| `ChatChip` | inline | Compact code block replacement |

## Implementation Order

### Phase 1: Core Workspace (Ship first)
1. Extract `ArtifactPanel` component from existing Canvas + Code page file system
2. Refactor `chat/page.tsx`: add artifact panel, wire auto-open, code block → chip
3. Add inline edit bar to artifact panel
4. Redirect `/app/code` to `/app/chat`

### Phase 2: Layout Modes
5. Add layout mode selector to header
6. Build `DualChat` layout (absorb from existing dual/page.tsx)
7. Build `ArenaChat` layout (new)
8. Build `MultiChat` layout (new)

### Phase 3: Polish
9. Keyboard shortcuts (Cmd+K for edit bar, Escape to close artifact)
10. Mobile responsive (artifact as overlay on small screens)
11. Persist layout preference in localStorage

## Files Modified

- `src/app/app/chat/page.tsx` — Major refactor (unified workspace)
- `src/components/ArtifactPanel.tsx` — NEW
- `src/components/layouts/DualChat.tsx` — NEW
- `src/components/layouts/ArenaChat.tsx` — NEW
- `src/components/layouts/MultiChat.tsx` — NEW
- `src/app/app/code/page.tsx` — Redirect to /app/chat
- `src/app/app/layout.tsx` — Update sidebar nav (remove Code link or keep as alias)

## What Stays Unchanged

- `/api/chat` route — no changes needed
- Enforcement pipeline — same SSE events
- Settings page — same
- Dual page — kept for now, eventually subsumed
- Dev Lab page — kept
