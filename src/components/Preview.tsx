"use client";

import { useState, useEffect, useRef } from "react";

interface PreviewProps {
  code: string;
  language: string;
}

function isHtmlContent(code: string, language: string): boolean {
  const htmlLangs = ["html", "htm", "svg"];
  if (htmlLangs.includes(language.toLowerCase())) return true;
  // Auto-detect from content
  const trimmed = code.trim().toLowerCase();
  return (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<svg") ||
    (trimmed.startsWith("<") && (trimmed.includes("<body") || trimmed.includes("<div") || trimmed.includes("<style")))
  );
}

export default function Preview({ code, language }: PreviewProps) {
  const [debouncedCode, setDebouncedCode] = useState(code);
  const [iframeKey, setIframeKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedCode(code);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code]);

  const canPreview = isHtmlContent(code, language);

  if (!canPreview) {
    return (
      <div className="flex flex-col h-full bg-background border-l border-border">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted">
                <rect x="3" y="3" width="14" height="14" rx="2" />
                <path d="M3 7h14" />
                <circle cx="5.5" cy="5" r="0.5" fill="currentColor" />
                <circle cx="7.5" cy="5" r="0.5" fill="currentColor" />
                <circle cx="9.5" cy="5" r="0.5" fill="currentColor" />
              </svg>
            </div>
            <div className="text-sm font-medium text-muted mb-1">Preview not available</div>
            <div className="text-xs text-muted/60">
              Live preview works with HTML, CSS, and SVG content.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Preview toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border bg-surface/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-success rounded-full" />
          <span className="text-[10px] font-mono text-muted">Live Preview</span>
        </div>
        <button
          onClick={() => setIframeKey((k) => k + 1)}
          className="px-2 py-0.5 rounded text-[10px] font-mono text-muted border border-border hover:border-accent/30 hover:text-foreground transition-colors cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {/* Iframe */}
      <div className="flex-1 overflow-hidden">
        <iframe
          key={iframeKey}
          srcDoc={debouncedCode}
          sandbox="allow-scripts"
          className="w-full h-full border-0"
          style={{ backgroundColor: "white" }}
          title="Preview"
        />
      </div>
    </div>
  );
}

export { isHtmlContent };
