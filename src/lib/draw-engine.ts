/**
 * DrawEngine — TypeScript port of GreyBeam's draw-engine.js
 * Pure canvas drawing logic, no React dependency.
 * 15 annotation types, per-page storage, undo/redo, watermark.
 */
import type {
  Annotation, AnnotationType, DragAnnotation, PointAnnotation, ClickAnnotation,
  PageAnnotations, MarkupState, StampType,
} from "./types";

interface HistoryAction {
  type: "add" | "clear";
  annotation?: Annotation;
  annotations?: Annotation[];
}

interface PageHistory {
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
}

export class DrawEngine extends EventTarget {
  private annotations = new Map<number, Annotation[]>();
  private history = new Map<number, PageHistory>();
  private canvases = new Map<number, HTMLCanvasElement>();
  private boundHandlers = new Map<number, { cleanup: () => void }>();

  // Current tool state
  private tool: AnnotationType | "select" = "select";
  private color = "#FF0000";
  private width = 2;
  private stampType: StampType = "APPROVED";
  private countNumber = 1;

  // Drawing state
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private currentPage = 0;
  private freehandPoints: { x: number; y: number }[] = [];
  private polylinePoints: { x: number; y: number }[] = [];
  private polylineInProgress = false;

  // Watermark
  private watermarkText = "";
  private watermarkColor = "#888888";
  private watermarkOpacity = 0.15;

  // Measure calibration
  private measureScale = 1;
  private measureUnit = "px";

  /* ─── Public API ─── */

  bindCanvas(page: number, canvas: HTMLCanvasElement) {
    // Unbind previous
    this.unbindCanvas(page);
    this.canvases.set(page, canvas);
    this._bindCanvasEvents(page, canvas);
    this._redrawPage(page);
  }

  unbindCanvas(page: number) {
    const bound = this.boundHandlers.get(page);
    if (bound) {
      bound.cleanup();
      this.boundHandlers.delete(page);
    }
    this.canvases.delete(page);
  }

  setTool(tool: AnnotationType | "select") { this.tool = tool; }
  getTool() { return this.tool; }
  setColor(color: string) { this.color = color; }
  getColor() { return this.color; }
  setWidth(width: number) { this.width = width; }
  getWidth() { return this.width; }
  setStampType(stamp: StampType) { this.stampType = stamp; }
  setCountNumber(n: number) { this.countNumber = n; }

  setWatermark(text: string, color = "#888888", opacity = 0.15) {
    this.watermarkText = text;
    this.watermarkColor = color;
    this.watermarkOpacity = opacity;
    this.redrawAll();
  }

  addAnnotation(page: number, ann: Annotation) {
    const anns = this._pageAnnotations(page);
    anns.push(ann);
    this._pushHistory(page, { type: "add", annotation: ann });
    this._redrawPage(page);
    this._fireChange();
  }

  clearPage(page: number) {
    const anns = this._pageAnnotations(page);
    if (anns.length === 0) return;
    this._pushHistory(page, { type: "clear", annotations: [...anns] });
    this.annotations.set(page, []);
    this._redrawPage(page);
    this._fireChange();
  }

  undoPage(page: number) {
    const h = this._pageHistory(page);
    const action = h.undoStack.pop();
    if (!action) return;

    if (action.type === "add") {
      const anns = this._pageAnnotations(page);
      anns.pop();
    } else if (action.type === "clear" && action.annotations) {
      this.annotations.set(page, [...action.annotations]);
    }

    h.redoStack.push(action);
    this._redrawPage(page);
    this._fireChange();
  }

  redoPage(page: number) {
    const h = this._pageHistory(page);
    const action = h.redoStack.pop();
    if (!action) return;

    if (action.type === "add" && action.annotation) {
      this._pageAnnotations(page).push(action.annotation);
    } else if (action.type === "clear") {
      this.annotations.set(page, []);
    }

    h.undoStack.push(action);
    this._redrawPage(page);
    this._fireChange();
  }

  getAnnotations(): PageAnnotations {
    const result: PageAnnotations = {};
    this.annotations.forEach((anns, page) => { result[page] = [...anns]; });
    return result;
  }

  setAnnotations(data: PageAnnotations) {
    this.annotations.clear();
    for (const [page, anns] of Object.entries(data)) {
      this.annotations.set(Number(page), [...anns]);
    }
    this.redrawAll();
    this._fireChange();
  }

  exportState(pdfName: string | null, pageCount: number, currentPage: number): MarkupState {
    return {
      pdfName,
      pageCount,
      currentPage,
      annotations: this.getAnnotations(),
      activeTool: this.tool,
      activeColor: this.color,
    };
  }

  redrawAll() {
    this.canvases.forEach((_, page) => this._redrawPage(page));
  }

  destroy() {
    this.canvases.forEach((_, page) => this.unbindCanvas(page));
    this.annotations.clear();
    this.history.clear();
  }

  /* ─── Private Helpers ─── */

  private _pageAnnotations(page: number): Annotation[] {
    if (!this.annotations.has(page)) this.annotations.set(page, []);
    return this.annotations.get(page)!;
  }

  private _pageHistory(page: number): PageHistory {
    if (!this.history.has(page)) this.history.set(page, { undoStack: [], redoStack: [] });
    return this.history.get(page)!;
  }

  private _pushHistory(page: number, action: HistoryAction) {
    const h = this._pageHistory(page);
    h.undoStack.push(action);
    h.redoStack = []; // clear redo on new action
  }

  private _fireChange() {
    this.dispatchEvent(new Event("change"));
  }

  /* ─── Canvas Event Binding ─── */

  private _bindCanvasEvents(page: number, canvas: HTMLCanvasElement) {
    const getPos = (e: MouseEvent) => ({ x: e.offsetX, y: e.offsetY });
    const getTouchPos = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0] || e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    };

    const onMouseDown = (e: MouseEvent) => {
      if (this.tool === "select") return;
      const { x, y } = getPos(e);
      this.currentPage = page;

      // Single-click tools
      if (this.tool === "text") {
        const text = prompt("Enter text:");
        if (text) {
          this.addAnnotation(page, { type: "text", x, y, text, color: this.color, width: this.width } as ClickAnnotation);
        }
        return;
      }
      if (this.tool === "stamp") {
        this.addAnnotation(page, { type: "stamp", x, y, stampType: this.stampType, color: this.color, width: this.width } as ClickAnnotation);
        return;
      }
      if (this.tool === "count") {
        this.addAnnotation(page, { type: "count", x, y, number: this.countNumber, color: this.color, width: this.width } as ClickAnnotation);
        this.countNumber++;
        return;
      }

      // Polyline: multi-click
      if (this.tool === "polyline") {
        if (!this.polylineInProgress) {
          this.polylineInProgress = true;
          this.polylinePoints = [{ x, y }];
        } else {
          this.polylinePoints.push({ x, y });
        }
        this._redrawPage(page);
        this._drawPreviewPolyline(canvas, page);
        return;
      }

      // Drag tools
      this.isDrawing = true;
      this.startX = x;
      this.startY = y;
      if (this.tool === "freehand") {
        this.freehandPoints = [{ x, y }];
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (this.tool === "select") return;
      const { x, y } = getPos(e);

      if (this.polylineInProgress && this.polylinePoints.length > 0) {
        this._redrawPage(page);
        this._drawPreviewPolyline(canvas, page, { x, y });
        return;
      }

      if (!this.isDrawing) return;

      if (this.tool === "freehand") {
        this.freehandPoints.push({ x, y });
      }

      // Live preview
      this._redrawPage(page);
      const preview = this._makePreviewAnnotation(x, y);
      if (preview) {
        const ctx = canvas.getContext("2d")!;
        this._drawAnnotation(ctx, preview);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (this.tool === "select" || this.polylineInProgress) return;
      if (!this.isDrawing) return;
      this.isDrawing = false;

      const { x, y } = getPos(e);
      const ann = this._makeAnnotation(x, y);
      if (ann) this.addAnnotation(page, ann);
    };

    const onMouseLeave = () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this._redrawPage(page);
      }
    };

    const onDblClick = () => {
      if (this.polylineInProgress && this.polylinePoints.length >= 2) {
        this.polylineInProgress = false;
        this.addAnnotation(page, {
          type: "polyline", points: [...this.polylinePoints], color: this.color, width: this.width,
        } as PointAnnotation);
        this.polylinePoints = [];
      }
    };

    // Touch handlers
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const pos = getTouchPos(e);
      onMouseDown({ offsetX: pos.x, offsetY: pos.y } as unknown as MouseEvent);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const pos = getTouchPos(e);
      onMouseMove({ offsetX: pos.x, offsetY: pos.y } as unknown as MouseEvent);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const pos = getTouchPos(e);
      onMouseUp({ offsetX: pos.x, offsetY: pos.y } as unknown as MouseEvent);
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    this.boundHandlers.set(page, {
      cleanup: () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("mousemove", onMouseMove);
        canvas.removeEventListener("mouseup", onMouseUp);
        canvas.removeEventListener("mouseleave", onMouseLeave);
        canvas.removeEventListener("dblclick", onDblClick);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
      },
    });
  }

  /* ─── Annotation Construction ─── */

  private _makePreviewAnnotation(x: number, y: number): Annotation | null {
    if (this.tool === "freehand") {
      return { type: "freehand", points: [...this.freehandPoints], color: this.color, width: this.width } as PointAnnotation;
    }
    const dragTypes = ["line", "arrow", "circle", "rectangle", "cloud", "highlight", "hatch", "callout", "measure"];
    if (dragTypes.includes(this.tool)) {
      return {
        type: this.tool as DragAnnotation["type"],
        x1: this.startX, y1: this.startY, x2: x, y2: y,
        color: this.color, width: this.width,
        ...(this.tool === "callout" ? { text: "..." } : {}),
        ...(this.tool === "measure" ? { measureScale: this.measureScale, unit: this.measureUnit } : {}),
      } as DragAnnotation;
    }
    return null;
  }

  private _makeAnnotation(x: number, y: number): Annotation | null {
    const dx = Math.abs(x - this.startX);
    const dy = Math.abs(y - this.startY);

    if (this.tool === "freehand") {
      if (this.freehandPoints.length < 2) return null;
      return { type: "freehand", points: [...this.freehandPoints], color: this.color, width: this.width } as PointAnnotation;
    }

    // Minimum drag distance
    if (dx < 3 && dy < 3) return null;

    const base = { x1: this.startX, y1: this.startY, x2: x, y2: y, color: this.color, width: this.width };

    switch (this.tool) {
      case "line": return { ...base, type: "line" } as DragAnnotation;
      case "arrow": return { ...base, type: "arrow" } as DragAnnotation;
      case "circle": return { ...base, type: "circle" } as DragAnnotation;
      case "rectangle": return { ...base, type: "rectangle" } as DragAnnotation;
      case "cloud": return { ...base, type: "cloud" } as DragAnnotation;
      case "highlight": return { ...base, type: "highlight" } as DragAnnotation;
      case "hatch": return { ...base, type: "hatch" } as DragAnnotation;
      case "callout": {
        const text = prompt("Enter callout text:") || "";
        return { ...base, type: "callout", text } as DragAnnotation;
      }
      case "measure":
        return { ...base, type: "measure", measureScale: this.measureScale, unit: this.measureUnit } as DragAnnotation;
      default: return null;
    }
  }

  private _drawPreviewPolyline(canvas: HTMLCanvasElement, page: number, cursor?: { x: number; y: number }) {
    const ctx = canvas.getContext("2d")!;
    const pts = this.polylinePoints;
    if (pts.length === 0) return;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (cursor) ctx.lineTo(cursor.x, cursor.y);
    ctx.stroke();

    // Vertex dots
    for (const p of pts) {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ─── Redraw ─── */

  _redrawPage(page: number) {
    const canvas = this.canvases.get(page);
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    if (this.watermarkText) {
      this._drawWatermark(ctx, canvas.width / dpr, canvas.height / dpr);
    }

    const anns = this._pageAnnotations(page);
    for (const ann of anns) {
      this._drawAnnotation(ctx, ann);
    }
  }

  /* ─── Watermark ─── */

  private _drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    ctx.globalAlpha = this.watermarkOpacity;
    ctx.fillStyle = this.watermarkColor;
    ctx.strokeStyle = this.watermarkColor;
    ctx.lineWidth = 1;

    const angle = -Math.atan2(h, w);
    const diagonal = Math.sqrt(w * w + h * h);
    const fontSize = Math.min(diagonal * 0.06, h * 0.1);

    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.watermarkText, 0, 0);

    const m = ctx.measureText(this.watermarkText);
    const pad = fontSize * 0.3;
    ctx.strokeRect(-m.width / 2 - pad, -fontSize / 2 - pad, m.width + pad * 2, fontSize + pad * 2);

    ctx.restore();
  }

  /* ─── Annotation Rendering (all 15 types) ─── */

  _drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
    ctx.save();
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    switch (ann.type) {
      case "line": this._drawLine(ctx, ann as DragAnnotation); break;
      case "arrow": this._drawArrow(ctx, ann as DragAnnotation); break;
      case "circle": this._drawCircle(ctx, ann as DragAnnotation); break;
      case "rectangle": this._drawRectangle(ctx, ann as DragAnnotation); break;
      case "cloud": this._drawCloud(ctx, ann as DragAnnotation); break;
      case "polyline": this._drawPolyline(ctx, ann as PointAnnotation); break;
      case "freehand": this._drawFreehand(ctx, ann as PointAnnotation); break;
      case "callout": this._drawCallout(ctx, ann as DragAnnotation); break;
      case "highlight": this._drawHighlight(ctx, ann as DragAnnotation); break;
      case "hatch": this._drawHatch(ctx, ann as DragAnnotation); break;
      case "stamp": this._drawStamp(ctx, ann as ClickAnnotation); break;
      case "count": this._drawCount(ctx, ann as ClickAnnotation); break;
      case "measure": this._drawMeasure(ctx, ann as DragAnnotation); break;
      case "text": this._drawText(ctx, ann as ClickAnnotation); break;
    }

    ctx.restore();
  }

  private _drawLine(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();
  }

  private _drawArrow(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
    const headLen = Math.max(10, a.width * 5);
    ctx.beginPath();
    ctx.moveTo(a.x2, a.y2);
    ctx.lineTo(a.x2 - headLen * Math.cos(angle - Math.PI / 6), a.y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(a.x2 - headLen * Math.cos(angle + Math.PI / 6), a.y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  private _drawCircle(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    const cx = (a.x1 + a.x2) / 2;
    const cy = (a.y1 + a.y2) / 2;
    const rx = Math.abs(a.x2 - a.x1) / 2;
    const ry = Math.abs(a.y2 - a.y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private _drawRectangle(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    const x = Math.min(a.x1, a.x2);
    const y = Math.min(a.y1, a.y2);
    const w = Math.abs(a.x2 - a.x1);
    const h = Math.abs(a.y2 - a.y1);
    ctx.strokeRect(x, y, w, h);
  }

  private _drawCloud(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    const x = Math.min(a.x1, a.x2);
    const y = Math.min(a.y1, a.y2);
    const w = Math.abs(a.x2 - a.x1);
    const h = Math.abs(a.y2 - a.y1);
    if (w < 5 || h < 5) return;

    const arcSize = Math.min(w, h, 20);
    const perimeter = 2 * (w + h);
    const numArcs = Math.max(4, Math.round(perimeter / arcSize));

    // Walk perimeter with scalloped arcs
    ctx.beginPath();
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= numArcs; i++) {
      const t = i / numArcs;
      const p = t * perimeter;
      let px: number, py: number;
      if (p <= w) { px = x + p; py = y; }
      else if (p <= w + h) { px = x + w; py = y + (p - w); }
      else if (p <= 2 * w + h) { px = x + w - (p - w - h); py = y + h; }
      else { px = x; py = y + h - (p - 2 * w - h); }
      points.push({ px, py } as unknown as { x: number; y: number });
    }

    // Draw scalloped arcs between consecutive perimeter points
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i] as unknown as { px: number; py: number };
      const p1 = points[i + 1] as unknown as { px: number; py: number };
      const mx = (p0.px + p1.px) / 2;
      const my = (p0.py + p1.py) / 2;
      // Bump outward
      const dx = p1.px - p0.px;
      const dy = p1.py - p0.py;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const bump = len * 0.3;
      const nx = -dy / len;
      const ny = dx / len;
      // Determine outward direction (away from center)
      const cx = x + w / 2;
      const cy2 = y + h / 2;
      const toCenter = (mx - cx) * nx + (my - cy2) * ny;
      const sign = toCenter > 0 ? 1 : -1;
      const cpx = mx + nx * bump * sign;
      const cpy = my + ny * bump * sign;

      if (i === 0) ctx.moveTo(p0.px, p0.py);
      ctx.quadraticCurveTo(cpx, cpy, p1.px, p1.py);
    }
    ctx.stroke();
  }

  private _drawPolyline(ctx: CanvasRenderingContext2D, a: PointAnnotation) {
    if (a.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(a.points[0].x, a.points[0].y);
    for (let i = 1; i < a.points.length; i++) {
      ctx.lineTo(a.points[i].x, a.points[i].y);
    }
    ctx.stroke();

    // Vertex dots
    for (const p of a.points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private _drawFreehand(ctx: CanvasRenderingContext2D, a: PointAnnotation) {
    if (a.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(a.points[0].x, a.points[0].y);
    for (let i = 1; i < a.points.length; i++) {
      ctx.lineTo(a.points[i].x, a.points[i].y);
    }
    ctx.stroke();
  }

  private _drawCallout(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    // Leader line
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();

    // Text box
    const text = a.text || "";
    const fontSize = Math.max(12, a.width * 5);
    ctx.font = `${fontSize}px Arial`;
    const lines = text.split("\n");
    const lineHeight = fontSize * 1.3;
    let maxW = 0;
    for (const line of lines) {
      const m = ctx.measureText(line);
      if (m.width > maxW) maxW = m.width;
    }
    const pad = 6;
    const boxW = maxW + pad * 2;
    const boxH = lines.length * lineHeight + pad * 2;
    const bx = a.x2;
    const by = a.y2 - boxH;

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeRect(bx, by, boxW, boxH);

    ctx.fillStyle = a.color;
    ctx.textBaseline = "top";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + pad, by + pad + i * lineHeight);
    }
  }

  private _drawHighlight(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    ctx.globalAlpha = 0.3;
    const x = Math.min(a.x1, a.x2);
    const y = Math.min(a.y1, a.y2);
    const w = Math.abs(a.x2 - a.x1);
    const h = Math.abs(a.y2 - a.y1);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }

  private _drawHatch(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    const x = Math.min(a.x1, a.x2);
    const y = Math.min(a.y1, a.y2);
    const w = Math.abs(a.x2 - a.x1);
    const h = Math.abs(a.y2 - a.y1);

    ctx.strokeRect(x, y, w, h);

    // Diagonal hatch lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const spacing = 8;
    ctx.lineWidth = 0.5;

    // Forward diagonal (\)
    for (let d = -Math.max(w, h); d < Math.max(w, h) * 2; d += spacing) {
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d + h, y + h);
    }
    // Back diagonal (/)
    for (let d = -Math.max(w, h); d < Math.max(w, h) * 2; d += spacing) {
      ctx.moveTo(x + w - d, y);
      ctx.lineTo(x + w - d - h, y + h);
    }
    ctx.stroke();
    ctx.restore();
  }

  private _drawStamp(ctx: CanvasRenderingContext2D, a: ClickAnnotation) {
    const text = a.stampType || "STAMP";
    const fontSize = Math.max(16, a.width * 8);
    ctx.font = `bold ${fontSize}px Arial`;
    const m = ctx.measureText(text);
    const pad = fontSize * 0.3;
    const bw = m.width + pad * 2;
    const bh = fontSize + pad * 2;

    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 2;

    // Rotated stamp
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(-0.15); // slight tilt
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = a.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private _drawCount(ctx: CanvasRenderingContext2D, a: ClickAnnotation) {
    const num = a.number ?? 0;
    const radius = Math.max(12, a.width * 5);
    ctx.beginPath();
    ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.fillStyle = a.color;
    ctx.font = `bold ${radius}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(num), a.x, a.y);
  }

  private _drawMeasure(ctx: CanvasRenderingContext2D, a: DragAnnotation) {
    // Line
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();

    // Tick marks at endpoints
    const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
    const tickLen = 8;
    const perpAngle = angle + Math.PI / 2;
    for (const [px, py] of [[a.x1, a.y1], [a.x2, a.y2]]) {
      ctx.beginPath();
      ctx.moveTo(px - tickLen * Math.cos(perpAngle), py - tickLen * Math.sin(perpAngle));
      ctx.lineTo(px + tickLen * Math.cos(perpAngle), py + tickLen * Math.sin(perpAngle));
      ctx.stroke();
    }

    // Distance label
    const dx = a.x2 - a.x1;
    const dy = a.y2 - a.y1;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const scale = a.measureScale || 1;
    const dist = (pixelDist / scale).toFixed(1);
    const unit = a.unit || "px";
    const label = `${dist} ${unit}`;

    const mx = (a.x1 + a.x2) / 2;
    const my = (a.y1 + a.y2) / 2;
    ctx.font = `11px Arial`;
    const m = ctx.measureText(label);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(mx - m.width / 2 - 3, my - 8, m.width + 6, 16);
    ctx.fillStyle = a.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my);
  }

  private _drawText(ctx: CanvasRenderingContext2D, a: ClickAnnotation) {
    const text = a.text || "";
    const fontSize = Math.max(14, a.width * 6);
    ctx.font = `${fontSize}px Arial`;
    ctx.textBaseline = "top";
    ctx.fillText(text, a.x, a.y);
  }
}
