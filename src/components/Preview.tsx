"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

  const injectedCode = injectConsoleCapture(debouncedCode);

  const viewportWidth = viewportSize === "mobile" ? "375px" : viewportSize === "tablet" ? "768px" : "100%";

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Preview toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border bg-surface/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          <span className="text-[10px] font-mono text-muted">Live Preview</span>
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
