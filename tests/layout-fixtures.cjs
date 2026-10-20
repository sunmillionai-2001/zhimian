// Fictional layout fixtures only; no personal documents.
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
async function styledWord() {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    Header,
    Footer,
    ImageRun,
    WidthType,
  } = require("docx");
  const { createCanvas } = require("@napi-rs/canvas");
  const canvas = createCanvas(64, 64),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#275957";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#f3dfb0";
  ctx.beginPath();
  ctx.arc(32, 24, 12, 0, Math.PI * 2);
  ctx.fill();
  const image = new ImageRun({
    type: "png",
    data: canvas.toBuffer("image/png"),
    transformation: { width: 64, height: 64 },
  });
  const para = (t) =>
    new Paragraph({
      children: [new TextRun({ text: t, font: "Arial", size: 24 })],
      spacing: { after: 140 },
    });
  return Packer.toBuffer(
    new Document({
      styles: { default: { document: { run: { font: "Arial" } } } },
      sections: [
        {
          properties: {
            page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
          },
          headers: {
            default: new Header({ children: [para("CONFIDENTIAL RESUME")] }),
          },
          footers: {
            default: new Footer({
              children: [para("Portfolio | example.com")],
            }),
          },
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 28, type: WidthType.PERCENTAGE },
                      shading: { fill: "DBEAE8" },
                      children: [
                        new Paragraph({ children: [image] }),
                        para("LIN SAMPLE"),
                        para("Skills"),
                        para("Analytics / SQL"),
                      ],
                    }),
                    new TableCell({
                      width: { size: 72, type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "PRODUCT ",
                              bold: true,
                              color: "205957",
                              size: 36,
                            }),
                            new TextRun({
                              text: "MANAGER",
                              bold: true,
                              color: "205957",
                              size: 36,
                            }),
                          ],
                        }),
                        para("Project Alpha"),
                        new Paragraph({
                          children: [
                            new TextRun({ text: "Maintained ", bold: true }),
                            new TextRun({
                              text: "weekly reports.",
                              italics: true,
                            }),
                          ],
                        }),
                        para("Project Beta"),
                        para("Maintained weekly reports."),
                        para("Education"),
                        para("Example University | Statistics"),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    }),
  );
}
async function styledPdf() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    page = pdf.addPage([595, 842]);
  page.drawRectangle({
    x: 24,
    y: 30,
    width: 160,
    height: 780,
    color: rgb(0.85, 0.92, 0.91),
  });
  page.drawRectangle({
    x: 50,
    y: 700,
    width: 75,
    height: 80,
    color: rgb(0.15, 0.35, 0.34),
  });
  for (const [text, x, y, size] of [
    ["LIN SAMPLE", 40, 665, 16],
    ["Skills", 40, 620, 13],
    ["Analytics / SQL", 40, 592, 11],
    ["PRODUCT MANAGER", 215, 765, 22],
    ["Project Alpha", 215, 720, 15],
    ["Maintained weekly reports.", 215, 690, 12],
    ["Project Beta", 215, 630, 15],
    ["Maintained weekly reports.", 215, 600, 12],
    ["Education", 215, 525, 15],
    ["Example University", 215, 495, 12],
  ])
    page.drawText(text, { x, y, size, font, color: rgb(0.12, 0.22, 0.2) });
  return Buffer.from(await pdf.save());
}
module.exports = { styledWord, styledPdf };
