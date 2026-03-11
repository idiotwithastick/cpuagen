"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { marked } from "marked";
import type { ConsoleEntry } from "./Canvas";

interface PreviewProps {
  code: string;
  language: string;
  onConsoleOutput?: (entry: ConsoleEntry) => void;
}

function isHtmlContent(code: string, language: string): boolean {
  const htmlLangs = ["html", "htm", "svg"];
  if (htmlLangs.includes(language.toLowerCase())) return true;
  const trimmed = code.trim().toLowerCase();
  return (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<svg") ||
    (trimmed.startsWith("<") && (trimmed.includes("<body") || trimmed.includes("<div") || trimmed.includes("<style")))
  );
}

function isMarkdownContent(language: string): boolean {
  return ["md", "markdown"].includes(language.toLowerCase());
}

function markdownToHtml(md: string): string {
  const body = marked.parse(md, { async: false }) as string;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 24px; color: #1f2937; }
h1, h2, h3, h4 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
h1 { font-size: 2em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; color: inherit; }
blockquote { border-left: 4px solid #3b82f6; margin: 1em 0; padding: 0.5em 1em; background: #eff6ff; color: #1e40af; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
th { background: #f9fafb; font-weight: 600; }
a { color: #2563eb; }
img { max-width: 100%; }
ul, ol { padding-left: 1.5em; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
</style></head><body>${body}</body></html>`;
}

/* Inject console capture script into HTML before </body> or at end */
function injectConsoleCapture(html: string): string {
  const captureScript = `
<script>
(function() {
  var origLog = console.log, origError = console.error, origWarn = console.warn, origInfo = console.info;
  function send(type, args) {
    try {
      var str = Array.prototype.slice.call(args).map(function(a) {
        if (typeof a === 'object') try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
        return String(a);
      }).join(' ');
      parent.postMessage({ __cpuagen_console: true, type: type, args: str, timestamp: Date.now() }, '*');
    } catch(e) {}
  }
  console.log = function() { send('log', arguments); origLog.apply(console, arguments); };
  console.error = function() { send('error', arguments); origError.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); origWarn.apply(console, arguments); };
  console.info = function() { send('info', arguments); origInfo.apply(console, arguments); };
  window.onerror = function(msg, url, line, col, err) {
    send('error', [msg + ' (line ' + line + ')']);
  };
  window.addEventListener('unhandledrejection', function(e) {
    send('error', ['Unhandled Promise: ' + (e.reason && e.reason.message || e.reason || 'unknown')]);
  });
})();
</script>`;

  // Insert before </body> if exists, otherwise append
  if (html.includes("</body>")) {
    return html.replace("</body>", captureScript + "\n</body>");
  }
  if (html.includes("</html>")) {
    return html.replace("</html>", captureScript + "\n</html>");
  }
  return html + captureScript;
}

export default function Preview({ code, language, onConsoleOutput }: PreviewProps) {
  const [debouncedCode, setDebouncedCode] = useState(code);
  const [iframeKey, setIframeKey] = useState(0);
  const [viewportSize, setViewportSize] = useState<"desktop" | "tablet" | "mobile">("desktop");
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

  // Listen for console messages from iframe
  const handleMessage = useCallback((e: MessageEvent) => {
    if (e.data && e.data.__cpuagen_console && onConsoleOutput) {
      onConsoleOutput({
        type: e.data.type,
        args: e.data.args,
        timestamp: e.data.timestamp,
      });
    }
  }, [onConsoleOutput]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const isHtml = isHtmlContent(code, language);
  const isMd = isMarkdownContent(language);
  const canPreview = isHtml || isMd;

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
              Live preview works with HTML, CSS, SVG, and Markdown content.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const previewHtml = isMd ? markdownToHtml(debouncedCode) : debouncedCode;
  const injectedCode = injectConsoleCapture(previewHtml);

  const viewportWidth = viewportSize === "mobile" ? "375px" : viewportSize === "tablet" ? "768px" : "100%";

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Preview toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border bg-surface/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          <span className="text-[10px] font-mono text-muted">{isMd ? "Markdown Preview" : "Live Preview"}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Viewport switcher */}
          <div className="flex items-center border border-border rounded overflow-hidden mr-2">
            {(["desktop", "tablet", "mobile"] as const).map((size) => (
              <button
                key={size}
                onClick={() => setViewportSize(size)}
                className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors cursor-pointer ${
                  viewportSize === size ? "bg-accent/15 text-accent-light" : "text-muted hover:text-foreground"
                }`}
                title={size}
              >
                {size === "desktop" ? (
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="1" y="1" width="10" height="6" rx="0.5"/><path d="M4 9h4"/></svg>
                ) : size === "tablet" ? (
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" stroke="currentColor" strokeWidth="1"><rect x="1" y="1" width="8" height="10" rx="1"/><path d="M4 10h2"/></svg>
                ) : (
                  <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1"><rect x="1" y="1" width="6" height="10" rx="1"/><circle cx="4" cy="10" r="0.5" fill="currentColor"/></svg>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIframeKey((k) => k + 1)}
            className="px-2 py-0.5 rounded text-[10px] font-mono text-muted border border-border hover:border-accent/30 hover:text-foreground transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Iframe */}
      <div className="flex-1 overflow-hidden flex items-start justify-center bg-[#1a1a2e]">
        <iframe
          key={iframeKey}
          srcDoc={injectedCode}
          sandbox="allow-scripts"
          className="border-0 h-full transition-all duration-200"
          style={{
            backgroundColor: "white",
            width: viewportWidth,
            maxWidth: "100%",
            ...(viewportSize !== "desktop" ? { boxShadow: "0 0 20px rgba(0,0,0,0.3)", borderRadius: "4px", margin: "8px auto" } : {}),
          }}
          title="Preview"
        />
      </div>
    </div>
  );
}

export { isHtmlContent };
