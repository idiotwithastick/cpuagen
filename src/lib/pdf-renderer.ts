import * as pdfjsLib from "pdfjs-dist";

// Configure worker for Next.js — unpkg has all versions (cdnjs lacks 5.5.207+)
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export class PdfRenderer {
  private doc: pdfjsLib.PDFDocumentProxy | null = null;
  private scale = 1.0;

  async loadPdf(data: ArrayBuffer): Promise<number> {
    if (this.doc) this.doc.destroy();
    this.doc = await pdfjsLib.getDocument({ data }).promise;
    return this.doc.numPages;
  }

  async renderPage(pageNum: number, canvas: HTMLCanvasElement): Promise<{ width: number; height: number }> {
    if (!this.doc) throw new Error("No PDF loaded");
    const page = await this.doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });
    const dpr = window.devicePixelRatio || 1;

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return { width: viewport.width, height: viewport.height };
  }

  setScale(scale: number) { this.scale = scale; }
  getScale() { return this.scale; }
  getPageCount() { return this.doc?.numPages ?? 0; }

  destroy() {
    this.doc?.destroy();
    this.doc = null;
  }
}
