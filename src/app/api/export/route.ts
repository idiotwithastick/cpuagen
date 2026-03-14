import { NextRequest } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const runtime = "nodejs";

interface ExportMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function generateDocx(title: string, messages: ExportMessage[]): Promise<Uint8Array> {
  // Build DOCX XML manually (no external dependency needed beyond what we have)
  const paragraphs = messages
    .map((m) => {
      const role = m.role === "user" ? "You" : "CPUAGEN";
      const time = new Date(m.timestamp).toLocaleString();
      return `
        <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="${m.role === "user" ? "2563EB" : "7C3AED"}"/></w:rPr>
            <w:t xml:space="preserve">${escapeXml(role)} — ${escapeXml(time)}</w:t>
          </w:r>
        </w:p>
        <w:p><w:r><w:t xml:space="preserve">${escapeXml(m.content)}</w:t></w:r></w:p>
        <w:p/>`;
    })
    .join("");

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:t>${escapeXml(title)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:rPr><w:color w:val="666666"/></w:rPr>
      <w:t>Exported from CPUAGEN on ${new Date().toLocaleDateString()}</w:t>
    </w:r></w:p>
    <w:p/>
    ${paragraphs}
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.folder("_rels")!.file(".rels", rels);
  const wordFolder = zip.folder("word")!;
  wordFolder.file("document.xml", docXml);
  wordFolder.folder("_rels")!.file("document.xml.rels", wordRels);

  const buf = await zip.generateAsync({ type: "uint8array" });
  return buf;
}

async function generateXlsx(title: string, messages: ExportMessage[]): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const rows = messages.map((m, i) => ({
    "#": i + 1,
    Role: m.role === "user" ? "You" : "CPUAGEN",
    Message: m.content,
    Timestamp: new Date(m.timestamp).toISOString(),
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 5 }, { wch: 10 }, { wch: 80 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf);
}

async function generatePdf(title: string, messages: ExportMessage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 10;
  const margin = 50;
  const lineHeight = 14;

  let page = doc.addPage([612, 792]);
  let y = 742;

  const addText = (text: string, f = font, size = fontSize, color = rgb(0, 0, 0)) => {
    const maxWidth = 512;
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const w = f.widthOfTextAtSize(testLine, size);
      if (w > maxWidth && line) {
        if (y < margin + lineHeight) {
          page = doc.addPage([612, 792]);
          y = 742;
        }
        page.drawText(line, { x: margin, y, font: f, size, color });
        y -= lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      if (y < margin + lineHeight) {
        page = doc.addPage([612, 792]);
        y = 742;
      }
      page.drawText(line, { x: margin, y, font: f, size, color });
      y -= lineHeight;
    }
  };

  // Title
  addText(title, boldFont, 16, rgb(0.486, 0.227, 0.929));
  y -= 8;
  addText(`Exported from CPUAGEN — ${new Date().toLocaleDateString()}`, font, 8, rgb(0.4, 0.4, 0.4));
  y -= 16;

  for (const msg of messages) {
    const role = msg.role === "user" ? "You" : "CPUAGEN";
    const time = new Date(msg.timestamp).toLocaleString();
    const color = msg.role === "user" ? rgb(0.145, 0.388, 0.922) : rgb(0.486, 0.227, 0.929);
    addText(`${role} — ${time}`, boldFont, 10, color);
    y -= 4;

    const lines = msg.content.split("\n");
    for (const line of lines) {
      addText(line || " ");
    }
    y -= 12;
  }

  return doc.save();
}

export async function POST(req: NextRequest) {
  try {
    const { format, title = "Conversation", messages } = (await req.json()) as {
      format: "docx" | "xlsx" | "pdf";
      title?: string;
      messages: ExportMessage[];
    };

    if (!messages?.length) {
      return Response.json({ ok: false, error: "No messages to export" }, { status: 400 });
    }

    let data: Uint8Array;
    let contentType: string;
    let ext: string;

    switch (format) {
      case "docx":
        data = await generateDocx(title, messages);
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        ext = "docx";
        break;
      case "xlsx":
        data = await generateXlsx(title, messages);
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        ext = "xlsx";
        break;
      case "pdf":
        data = await generatePdf(title, messages);
        contentType = "application/pdf";
        ext = "pdf";
        break;
      default:
        return Response.json({ ok: false, error: "Unsupported format" }, { status: 400 });
    }

    const filename = `${title.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50)}.${ext}`;
    return new Response(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return Response.json({ ok: false, error: "Export failed" }, { status: 500 });
  }
}
