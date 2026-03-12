"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { AnnotationType, PageAnnotations, MarkupState, StampType } from "@/lib/types";
import { DrawEngine } from "@/lib/draw-engine";
import { PdfRenderer } from "@/lib/pdf-renderer";
import { PdfManager } from "@/lib/pdf-manager";

/* ─── Props ─── */
interface GreyBeamCanvasProps {
  pdfData?: ArrayBuffer | null;
  pdfName?: string;
  annotations?: PageAnnotations;
  onAnnotationsChange?: (annotations: PageAnnotations) => void;
  onStateExport?: (state: MarkupState) => void;
}

/* ─── Tool definitions ─── */
const TOOLS: { id: AnnotationType | "select"; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "\u{1F5B1}" },
  { id: "line", label: "Line", icon: "\u2571" },
  { id: "arrow", label: "Arrow", icon: "\u2197" },
  { id: "rectangle", label: "Rectangle", icon: "\u25AD" },
  { id: "circle", label: "Circle", icon: "\u25CB" },
  { id: "cloud", label: "Cloud", icon: "\u2601" },
  { id: "freehand", label: "Freehand", icon: "\u270E" },
  { id: "polyline", label: "Polyline", icon: "\u299A" },
  { id: "text", label: "Text", icon: "T" },
  { id: "callout", label: "Callout", icon: "\u{1F4AC}" },
  { id: "stamp", label: "Stamp", icon: "\u{1F4CB}" },
  { id: "count", label: "Count", icon: "#" },
  { id: "measure", label: "Measure", icon: "\u{1F4CF}" },
  { id: "highlight", label: "Highlight", icon: "\u{1F7E8}" },
  { id: "hatch", label: "Hatch", icon: "\u2572" },
];

const COLORS = ["#FF0000", "#FF6600", "#FFD700", "#00CC00", "#0088FF", "#6644CC", "#FF00FF", "#000000"];
const WIDTHS = [{ value: 1, label: "Thin" }, { value: 2, label: "Med" }, { value: 4, label: "Thick" }];
const STAMPS: StampType[] = ["APPROVED", "REJECTED", "REVISED", "REVIEWED", "DRAFT", "VOID", "PRELIMINARY", "FINAL"];

/* ─── Component ─── */
export default function GreyBeamCanvas({ pdfData, pdfName, annotations, onAnnotationsChange, onStateExport }: GreyBeamCanvasProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [activeTool, setActiveTool] = useState<AnnotationType | "select">("select");
  const [activeColor, setActiveColor] = useState("#FF0000");
  const [activeWidth, setActiveWidth] = useState(2);
  const [activeStamp, setActiveStamp] = useState<StampType>("APPROVED");
  const [zoom, setZoom] = useState(1.0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [showPageSidebar, setShowPageSidebar] = useState(true);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [dragOverPage, setDragOverPage] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  // Store the raw PDF bytes for merge/delete/reorder operations
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);

  const drawEngineRef = useRef<DrawEngine | null>(null);
  const pdfRendererRef = useRef<PdfRenderer | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize engines
  useEffect(() => {
    drawEngineRef.current = new DrawEngine();
    pdfRendererRef.current = new PdfRenderer();

    const engine = drawEngineRef.current;
    const onChange = () => {
      onAnnotationsChange?.(engine.getAnnotations());
    };
    engine.addEventListener("change", onChange);

    return () => {
      engine.removeEventListener("change", onChange);
      engine.destroy();
      pdfRendererRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync tool/color/width to engine
  useEffect(() => {
    const e = drawEngineRef.current;
    if (!e) return;
    e.setTool(activeTool);
    e.setColor(activeColor);
    e.setWidth(activeWidth);
    e.setStampType(activeStamp);
  }, [activeTool, activeColor, activeWidth, activeStamp]);

  // Load PDF when pdfData changes
  useEffect(() => {
    if (!pdfData || !pdfRendererRef.current) return;
    setPdfBytes(pdfData);
    const renderer = pdfRendererRef.current;
    renderer.setScale(zoom);
    renderer.loadPdf(pdfData).then((pages) => {
      setPageCount(pages);
      setCurrentPage(1);
      setPdfLoaded(true);
      setSelectedPages(new Set());
    }).catch((err) => {
      console.error("Failed to load PDF:", err);
      setPdfLoaded(false);
    });
  }, [pdfData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render current page
  const renderPage = useCallback(async () => {
    const renderer = pdfRendererRef.current;
    const pdfCanvas = pdfCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const engine = drawEngineRef.current;
    if (!renderer || !pdfCanvas || !drawCanvas || !engine) return;
    if (renderer.getPageCount() === 0) return;

    renderer.setScale(zoom);
    const { width, height } = await renderer.renderPage(currentPage, pdfCanvas);
    setCanvasSize({ width, height });

    // Size draw canvas to match
    const dpr = window.devicePixelRatio || 1;
    drawCanvas.width = width * dpr;
    drawCanvas.height = height * dpr;
    drawCanvas.style.width = `${width}px`;
    drawCanvas.style.height = `${height}px`;

    // Bind draw engine to this page's canvas
    engine.bindCanvas(currentPage, drawCanvas);
  }, [currentPage, zoom]);

  useEffect(() => {
    if (pdfLoaded) renderPage();
  }, [pdfLoaded, renderPage]);

  // Sync external annotations (from AI commands)
  useEffect(() => {
    if (annotations && drawEngineRef.current) {
      drawEngineRef.current.setAnnotations(annotations);
    }
  }, [annotations]);

  // Export state for AI context
  useEffect(() => {
    if (onStateExport && drawEngineRef.current) {
      onStateExport(drawEngineRef.current.exportState(pdfName || null, pageCount, currentPage));
    }
  }, [currentPage, pageCount, pdfName, onStateExport]);

  // Reload PDF from bytes (after merge/delete/reorder)
  const reloadFromBytes = useCallback(async (bytes: ArrayBuffer, goToPage?: number) => {
    setPdfBytes(bytes);
    const renderer = pdfRendererRef.current;
    if (!renderer) return;
    renderer.setScale(zoom);
    try {
      const pages = await renderer.loadPdf(bytes);
      setPageCount(pages);
      const target = goToPage ? Math.min(goToPage, pages) : Math.min(currentPage, pages);
      setCurrentPage(target < 1 ? 1 : target);
      setPdfLoaded(true);
      setSelectedPages(new Set());
    } catch (err) {
      console.error("Failed to reload PDF:", err);
    }
  }, [zoom, currentPage]);

  // File upload handler
  const handleFileUpload = async (file: File) => {
    if (!file.type.includes("pdf")) return;
    const buffer = await file.arrayBuffer();
    await reloadFromBytes(buffer, 1);
  };

  // Merge additional PDFs
  const handleMerge = async (files: FileList | File[]) => {
    if (!pdfBytes) return;
    setMerging(true);
    try {
      const newPdfs: ArrayBuffer[] = [];
      for (const file of Array.from(files)) {
        if (file.type.includes("pdf") || /\.pdf$/i.test(file.name)) {
          newPdfs.push(await file.arrayBuffer());
        }
      }
      if (newPdfs.length === 0) return;
      const merged = await PdfManager.mergePdfs([pdfBytes, ...newPdfs]);
      await reloadFromBytes(merged);
    } catch (err) {
      console.error("Merge failed:", err);
    } finally {
      setMerging(false);
    }
  };

  // Delete selected pages
  const handleDeletePages = async () => {
    if (!pdfBytes || selectedPages.size === 0) return;
    if (selectedPages.size >= pageCount) return; // Can't delete all pages
    try {
      // Convert 1-based page numbers to 0-based indices
      const indices = Array.from(selectedPages).map((p) => p - 1);
      const result = await PdfManager.deletePages(pdfBytes, indices);
      await reloadFromBytes(result);
    } catch (err) {
      console.error("Delete pages failed:", err);
    }
  };

  // Move page up (swap with previous)
  const movePageUp = async (pageNum: number) => {
    if (!pdfBytes || pageNum <= 1) return;
    const order = Array.from({ length: pageCount }, (_, i) => i);
    const idx = pageNum - 1;
    [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
    try {
      const result = await PdfManager.reorderPages(pdfBytes, order);
      await reloadFromBytes(result, pageNum - 1);
    } catch (err) {
      console.error("Move page failed:", err);
    }
  };

  // Move page down (swap with next)
  const movePageDown = async (pageNum: number) => {
    if (!pdfBytes || pageNum >= pageCount) return;
    const order = Array.from({ length: pageCount }, (_, i) => i);
    const idx = pageNum - 1;
    [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
    try {
      const result = await PdfManager.reorderPages(pdfBytes, order);
      await reloadFromBytes(result, pageNum + 1);
    } catch (err) {
      console.error("Move page failed:", err);
    }
  };

  // Download current PDF
  const handleDownload = () => {
    if (!pdfBytes) return;
    PdfManager.download(pdfBytes, pdfName || "markup.pdf");
  };

  // Toggle page selection
  const togglePageSelect = (pageNum: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPage(null);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      if (pdfLoaded && pdfBytes) {
        // Merge dropped PDFs
        handleMerge(files);
      } else {
        // First PDF
        const file = files[0];
        if (file) handleFileUpload(file);
      }
    }
  };

  // Page navigation
  const prevPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };
  const nextPage = () => { if (currentPage < pageCount) setCurrentPage(currentPage + 1); };

  // Zoom
  const zoomIn = () => setZoom(Math.min(3.0, zoom + 0.25));
  const zoomOut = () => setZoom(Math.max(0.25, zoom - 0.25));

  // Undo/Redo
  const undo = () => drawEngineRef.current?.undoPage(currentPage);
  const redo = () => drawEngineRef.current?.redoPage(currentPage);
  const clearPage = () => drawEngineRef.current?.clearPage(currentPage);

  /* ─── Empty state (no PDF) ─── */
  if (!pdfLoaded && !pdfData) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div
          className="flex-1 flex items-center justify-center p-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="text-center max-w-sm">
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 mb-4 hover:border-amber-500/40 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-amber-400">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <div className="text-sm font-medium text-foreground mb-1">Upload a PDF to start marking up</div>
              <div className="text-xs text-muted">Click to browse or drag & drop</div>
            </div>
            <div className="text-xs text-muted/60">
              or attach a PDF in the chat and click &quot;Open in Markup&quot;
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />
      </div>
    );
  }

  /* ─── Main markup UI ─── */
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="border-b border-border bg-surface/30 px-2 py-1.5 shrink-0">
        {/* Tool buttons */}
        <div className="flex flex-wrap gap-0.5 mb-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              title={t.label}
              className={`w-7 h-7 rounded text-xs flex items-center justify-center transition-colors cursor-pointer ${
                activeTool === t.id
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "text-muted hover:text-foreground hover:bg-surface-light border border-transparent"
              }`}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* Color + Width + Stamp + Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                className={`w-5 h-5 rounded-sm border transition-all cursor-pointer ${
                  activeColor === c ? "border-white scale-110" : "border-transparent hover:border-white/30"
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>

          <span className="text-border">|</span>

          <div className="flex items-center gap-0.5">
            {WIDTHS.map((w) => (
              <button
                key={w.value}
                onClick={() => setActiveWidth(w.value)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors cursor-pointer ${
                  activeWidth === w.value
                    ? "bg-accent/15 text-accent-light"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          {activeTool === "stamp" && (
            <>
              <span className="text-border">|</span>
              <select
                value={activeStamp}
                onChange={(e) => setActiveStamp(e.target.value as StampType)}
                className="bg-surface border border-border rounded px-1.5 py-0.5 text-[10px] font-mono text-foreground cursor-pointer"
              >
                {STAMPS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </>
          )}

          <span className="text-border">|</span>

          <button onClick={undo} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground hover:bg-surface-light cursor-pointer" title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button onClick={redo} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground hover:bg-surface-light cursor-pointer" title="Redo">
            Redo
          </button>
          <button onClick={clearPage} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-danger/70 hover:text-danger hover:bg-danger/10 cursor-pointer" title="Clear page annotations">
            Clear
          </button>

          <span className="text-border">|</span>

          {/* Merge PDF button */}
          <button
            onClick={() => mergeInputRef.current?.click()}
            disabled={merging}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 cursor-pointer disabled:opacity-30"
            title="Merge additional PDFs"
          >
            {merging ? "Merging..." : "+ Merge"}
          </button>

          {/* Delete selected pages */}
          {selectedPages.size > 0 && selectedPages.size < pageCount && (
            <button
              onClick={handleDeletePages}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-danger/70 hover:text-danger hover:bg-danger/10 cursor-pointer"
              title={`Delete ${selectedPages.size} selected page(s)`}
            >
              Delete ({selectedPages.size})
            </button>
          )}

          {/* Toggle page sidebar */}
          <button
            onClick={() => setShowPageSidebar(!showPageSidebar)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
              showPageSidebar ? "text-amber-400 bg-amber-500/10" : "text-muted hover:text-foreground hover:bg-surface-light"
            }`}
            title="Toggle page panel"
          >
            Pages
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground hover:bg-surface-light cursor-pointer"
            title="Download PDF"
          >
            Save
          </button>
        </div>
      </div>

      {/* Main area: sidebar + canvas */}
      <div className="flex-1 flex min-h-0">
        {/* Page sidebar */}
        {showPageSidebar && (
          <div
            className="w-32 shrink-0 border-r border-border bg-surface/20 overflow-y-auto"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverPage(null);
              const files = e.dataTransfer.files;
              if (files.length > 0) handleMerge(files);
            }}
          >
            <div className="p-1.5 space-y-1">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  className={`relative group rounded border cursor-pointer transition-all ${
                    currentPage === pageNum
                      ? "border-amber-500/50 bg-amber-500/10"
                      : selectedPages.has(pageNum)
                      ? "border-blue-500/40 bg-blue-500/10"
                      : dragOverPage === pageNum
                      ? "border-amber-400/60 bg-amber-500/20"
                      : "border-border hover:border-border-light"
                  }`}
                  onClick={() => setCurrentPage(pageNum)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverPage(pageNum); }}
                  onDragLeave={() => setDragOverPage(null)}
                >
                  {/* Page number + checkbox */}
                  <div className="flex items-center justify-between px-1.5 py-0.5">
                    <span className="text-[9px] font-mono text-muted">{pageNum}</span>
                    <div className="flex items-center gap-0.5">
                      {/* Move up */}
                      {pageNum > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); movePageUp(pageNum); }}
                          className="opacity-0 group-hover:opacity-100 text-[8px] text-muted hover:text-foreground cursor-pointer"
                          title="Move up"
                        >
                          &#9650;
                        </button>
                      )}
                      {/* Move down */}
                      {pageNum < pageCount && (
                        <button
                          onClick={(e) => { e.stopPropagation(); movePageDown(pageNum); }}
                          className="opacity-0 group-hover:opacity-100 text-[8px] text-muted hover:text-foreground cursor-pointer"
                          title="Move down"
                        >
                          &#9660;
                        </button>
                      )}
                      {/* Select checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedPages.has(pageNum)}
                        onChange={(e) => { e.stopPropagation(); togglePageSelect(pageNum); }}
                        className="w-3 h-3 accent-amber-500 cursor-pointer opacity-0 group-hover:opacity-100 checked:opacity-100"
                        title="Select page"
                      />
                    </div>
                  </div>
                  {/* Mini preview area — placeholder colored block */}
                  <div className="mx-1 mb-1 h-16 rounded-sm bg-white/80 flex items-center justify-center">
                    <span className="text-[10px] text-gray-400 font-mono">{pageNum}</span>
                  </div>
                </div>
              ))}

              {/* Drop zone for merging */}
              <div
                className="border border-dashed border-border rounded p-2 text-center hover:border-amber-500/40 transition-colors cursor-pointer"
                onClick={() => mergeInputRef.current?.click()}
              >
                <span className="text-[9px] text-muted">+ Add PDF</span>
              </div>
            </div>
          </div>
        )}

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto flex items-start justify-center bg-[#1a1a2e] p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="relative" style={canvasSize.width > 0 ? { width: canvasSize.width, height: canvasSize.height } : { width: "100%", height: "100%" }}>
            {/* PDF canvas (bottom layer) */}
            <canvas
              ref={pdfCanvasRef}
              className="block"
              style={{ backgroundColor: "white" }}
            />
            {/* Draw canvas (top layer, transparent overlay) */}
            <canvas
              ref={drawCanvasRef}
              className="absolute top-0 left-0"
              style={{ cursor: activeTool === "select" ? "default" : "crosshair" }}
            />
          </div>
        </div>
      </div>

      {/* Footer: navigation + zoom */}
      <div className="h-9 flex items-center justify-between px-3 border-t border-border bg-surface/30 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            &lt;
          </button>
          <span className="text-[10px] font-mono text-muted">
            Page {currentPage} / {pageCount}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= pageCount}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            &gt;
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-amber-400 mr-2">{pdfName || "PDF"}</span>
          <button onClick={zoomOut} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground cursor-pointer">&minus;</button>
          <span className="text-[10px] font-mono text-muted w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground cursor-pointer">+</button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
      />
      <input
        ref={mergeInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleMerge(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
