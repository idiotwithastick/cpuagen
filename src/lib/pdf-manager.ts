/**
 * PdfManager — PDF manipulation using pdf-lib
 * Handles merge, page deletion, page reordering.
 */
import { PDFDocument } from "pdf-lib";

export class PdfManager {
  /**
   * Merge multiple PDF ArrayBuffers into a single PDF.
   * Returns the merged PDF as ArrayBuffer.
   */
  static async mergePdfs(pdfs: ArrayBuffer[]): Promise<ArrayBuffer> {
    const merged = await PDFDocument.create();
    for (const pdfBytes of pdfs) {
      const src = await PDFDocument.load(pdfBytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) {
        merged.addPage(page);
      }
    }
    const bytes = await merged.save();
    return bytes.buffer as ArrayBuffer;
  }

  /**
   * Delete specific pages from a PDF (0-based indices).
   * Returns the modified PDF as ArrayBuffer.
   */
  static async deletePages(pdfBytes: ArrayBuffer, pageIndices: number[]): Promise<ArrayBuffer> {
    const doc = await PDFDocument.load(pdfBytes);
    // Remove pages in reverse order to keep indices stable
    const sorted = [...pageIndices].sort((a, b) => b - a);
    for (const idx of sorted) {
      if (idx >= 0 && idx < doc.getPageCount()) {
        doc.removePage(idx);
      }
    }
    const bytes = await doc.save();
    return bytes.buffer as ArrayBuffer;
  }

  /**
   * Reorder pages in a PDF. newOrder is an array of 0-based source indices.
   * e.g., [2, 0, 1] moves page 3 to first, page 1 to second, page 2 to third.
   */
  static async reorderPages(pdfBytes: ArrayBuffer, newOrder: number[]): Promise<ArrayBuffer> {
    const src = await PDFDocument.load(pdfBytes);
    const dest = await PDFDocument.create();
    const copied = await dest.copyPages(src, newOrder);
    for (const page of copied) {
      dest.addPage(page);
    }
    const bytes = await dest.save();
    return bytes.buffer as ArrayBuffer;
  }

  /**
   * Extract a single page as a separate PDF ArrayBuffer (for thumbnails etc.).
   */
  static async extractPage(pdfBytes: ArrayBuffer, pageIndex: number): Promise<ArrayBuffer> {
    const src = await PDFDocument.load(pdfBytes);
    const dest = await PDFDocument.create();
    const [page] = await dest.copyPages(src, [pageIndex]);
    dest.addPage(page);
    const bytes = await dest.save();
    return bytes.buffer as ArrayBuffer;
  }

  /**
   * Get page count without full rendering.
   */
  static async getPageCount(pdfBytes: ArrayBuffer): Promise<number> {
    const doc = await PDFDocument.load(pdfBytes);
    return doc.getPageCount();
  }

  /**
   * Export the current PDF (with any modifications) as a downloadable blob.
   */
  static async toBlob(pdfBytes: ArrayBuffer): Promise<Blob> {
    return new Blob([pdfBytes], { type: "application/pdf" });
  }

  /**
   * Download a PDF with a given filename.
   */
  static download(pdfBytes: ArrayBuffer, filename: string) {
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
