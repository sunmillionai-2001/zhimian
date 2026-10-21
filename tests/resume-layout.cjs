const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const {
  processDocument,
  openWord,
  openPdf,
  pdfBlocks,
  renderPage,
  wordPdf,
  editsFor,
} = require("../resume-layout-engine");
const { createSourceStore } = require("../resume-layout");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const JSZip = require("jszip");
const { styledWord, styledPdf } = require("./layout-fixtures.cjs");
const upload = (name, b) => ({ name, base64: b.toString("base64") });
test("Word retains original archive styles, table, image, header/footer and separate repeated text", async () => {
  const b = await styledWord(),
    w = await openWord(b);
  const target = w.text.replace(
    "Project Beta\n\nMaintained weekly reports.",
    "Project Beta\n\nValidated weekly reports.",
  );
  const out = Buffer.from(
    (
      await processDocument({
        ...upload("x.docx", b),
        ext: ".docx",
        action: "export",
        format: "word",
        text: target,
      })
    ).base64,
    "base64",
  );
  assert.equal((await openWord(out)).text, target);
  const a = await JSZip.loadAsync(b),
    z = await JSZip.loadAsync(out);
  for (const name of Object.keys(a.files)) {
    if (name === "word/document.xml" || a.files[name].dir) continue;
    assert.deepEqual(
      await z.file(name).async("nodebuffer"),
      await a.file(name).async("nodebuffer"),
      name,
    );
  }
  const xml = await z.file("word/document.xml").async("string");
  assert.match(xml, /w:tbl/);
  assert.match(xml, /w:b\//);
  assert.match(xml, /w:i\//);
  assert.match(xml, /drawing/);
});
test("source storage is account isolated, original download is byte exact, no silent fallback", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zm-layout-store-"));
  try {
    const a = createSourceStore(path.join(dir, "a")),
      b = createSourceStore(path.join(dir, "b")),
      pdf = await styledPdf(),
      r = await a.import(upload("original.pdf", pdf));
    assert.deepEqual(a.read(r.source.id, true).buffer, pdf);
    assert.deepEqual(await a.render(r.source.id, r.text, "pdf"), pdf);
    assert.throws(
      () => b.read(r.source.id),
      (e) => e.status === 404,
    );
    assert.throws(
      () => a.read("../secret"),
      (e) => e.status === 400,
    );
    await assert.rejects(
      a.render(r.source.id, r.text.replace(/\n\n/g, ""), "pdf"),
      /段落或表格边界/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("PDF layout retains colored sidebar and untouched text; only second repeated line is replaced", async () => {
  const b = await styledPdf(),
    o = await openPdf(b);
  try {
    const { text, blocks } = await pdfBlocks(o);
    assert.equal(blocks.length, 10);
    const hiddenBlock = blocks[7],
      hiddenRender = await renderPage(
        await o.doc.getPage(1),
        o.api,
        new Set(hiddenBlock.ops),
        2,
      ),
      rect = hiddenBlock.rect;
    const pixels = hiddenRender.canvas
      .getContext("2d")
      .getImageData(
        Math.floor(rect[0] * 2),
        Math.floor(rect[1] * 2),
        Math.ceil((rect[2] - rect[0]) * 2),
        Math.ceil((rect[3] - rect[1]) * 2),
      ).data;
    assert.ok(
      pixels.every((v) => v === 255),
      "old glyphs must actually disappear, not just be covered by new glyphs",
    );
    const target = text.replace(
      "Project Beta\n\nMaintained weekly reports.",
      "Project Beta\n\nValidated weekly reports.",
    );
    const out = Buffer.from(
        (
          await processDocument({
            base64: b.toString("base64"),
            ext: ".pdf",
            action: "export",
            format: "pdf",
            text: target,
          })
        ).base64,
        "base64",
      ),
      changed = await openPdf(out);
    try {
      const originalRender = await renderPage(
          await o.doc.getPage(1),
          o.api,
          new Set(),
          2,
        ),
        resultRender = await renderPage(
          await changed.doc.getPage(1),
          changed.api,
          new Set(),
          2,
        );
      const a = originalRender.canvas.getContext("2d"),
        z = resultRender.canvas.getContext("2d");
      for (const [x, y, w, h] of [
        [48, 60, 320, 1500],
        [420, 100, 700, 300],
      ]) {
        const aa = a.getImageData(x, y, w, h).data,
          zz = z.getImageData(x, y, w, h).data;
        let delta = 0;
        for (let i = 0; i < aa.length; i++) delta += Math.abs(aa[i] - zz[i]);
        assert.ok(
          delta / aa.length < 1,
          "untouched region should retain appearance",
        );
      }
      const content = await (await changed.doc.getPage(1)).getTextContent();
      assert.match(
        content.items.map((x) => x.str || "").join(""),
        /Validated weekly reports/,
      );
      assert.equal(
        content.items
          .map((x) => x.str || "")
          .join("")
          .match(/Maintained/g)?.length,
        1,
      );
      assert.match(
        content.items.map((x) => x.str || "").join(""),
        /LIN SAMPLE/,
      );
    } finally {
      await changed.task.destroy();
    }
    await assert.rejects(
      processDocument({
        base64: b.toString("base64"),
        ext: ".pdf",
        action: "export",
        format: "pdf",
        text: target.replace(
          "Validated weekly reports.",
          "Extremely long rewritten experience ".repeat(20),
        ),
      }),
      /超出原位置/,
    );
  } finally {
    await o.task.destroy();
  }
});
test("PDF to Word deliberately embeds full page visuals with original page dimensions", async () => {
  const b = await styledPdf(),
    o = await openPdf(b);
  try {
    const { text } = await pdfBlocks(o),
      out = Buffer.from(
        (
          await processDocument({
            base64: b.toString("base64"),
            ext: ".pdf",
            action: "export",
            format: "word",
            text,
          })
        ).base64,
        "base64",
      );
    const zip = await JSZip.loadAsync(out);
    assert.ok(
      Object.keys(zip.files).some(
        (x) => x.startsWith("word/media/") && x.endsWith(".png"),
      ),
    );
    const xml = await zip.file("word/document.xml").async("string");
    assert.match(xml, /w:w="11900"/);
    assert.match(xml, /w:h="16840"/);
  } finally {
    await o.task.destroy();
  }
});
if (require.main === module && process.env.ZM_LAYOUT_ARTIFACT_DIR) {
  test("produce isolated visual QA fixtures and render Word using configured converter", async () => {
    const dir = process.env.ZM_LAYOUT_ARTIFACT_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const w = await styledWord(),
      source = await openWord(w);
    const word = Buffer.from(
      (
        await processDocument({
          ext: ".docx",
          action: "export",
          base64: w.toString("base64"),
          text: source.text.replace(
            "Maintained weekly reports.",
            "Validated weekly reports.",
          ),
          format: "word",
        })
      ).base64,
      "base64",
    );
    fs.writeFileSync(path.join(dir, "original.docx"), w);
    fs.writeFileSync(path.join(dir, "updated.docx"), word);
    fs.writeFileSync(path.join(dir, "word-original.pdf"), await wordPdf(w));
    fs.writeFileSync(path.join(dir, "word-updated.pdf"), await wordPdf(word));
    const pdf = await styledPdf(),
      o = await openPdf(pdf);
    try {
      const { text } = await pdfBlocks(o);
      fs.writeFileSync(path.join(dir, "original.pdf"), pdf);
      fs.writeFileSync(
        path.join(dir, "updated.pdf"),
        Buffer.from(
          (
            await processDocument({
              ext: ".pdf",
              action: "export",
              base64: pdf.toString("base64"),
              text: text.replace(
                "Project Beta\n\nMaintained weekly reports.",
                "Project Beta\n\nValidated weekly reports.",
              ),
              format: "pdf",
            })
          ).base64,
          "base64",
        ),
      );
    } finally {
      await o.task.destroy();
    }
  });
}
module.exports = { styledWord, styledPdf };

test("Chinese PDF replacement remains selectable and no-op Word returns the original bytes", async () => {
  const fontkit = require("@pdf-lib/fontkit"),
    pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    fs.readFileSync(
      path.join(__dirname, "../assets/fonts/NotoSansSC-Regular.otf"),
    ),
    { subset: false },
  );
  pdf
    .addPage([595, 842])
    .drawText("维护项目报表", { x: 80, y: 700, size: 16, font });
  const b = Buffer.from(await pdf.save()),
    result = Buffer.from(
      (
        await processDocument({
          ext: ".pdf",
          action: "export",
          base64: b.toString("base64"),
          text: "核对项目报表",
          format: "pdf",
        })
      ).base64,
      "base64",
    ),
    o = await openPdf(result);
  try {
    assert.match(
      (await (await o.doc.getPage(1)).getTextContent()).items
        .map((i) => i.str || "")
        .join(""),
      /核对项目报表/,
    );
  } finally {
    await o.task.destroy();
  }
  const w = await styledWord(),
    t = (await openWord(w)).text;
  assert.deepEqual(
    Buffer.from(
      (
        await processDocument({
          ext: ".docx",
          action: "export",
          base64: w.toString("base64"),
          text: t,
          format: "word",
        })
      ).base64,
      "base64",
    ),
    w,
  );
});

test('PDF wrapped lines share an editing region while separate columns stay separate', async () => {
  const pdf=await PDFDocument.create(), page=pdf.addPage([600,800]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Project delivery '.repeat(4).trim(),{x:40,y:700,size:12,font});
  page.drawText('continued here.',{x:40,y:680,size:12,font});
  page.drawText('Separate column',{x:440,y:700,size:12,font});
  const opened=await openPdf(Buffer.from(await pdf.save()));
  try {
    const {blocks,text}=await pdfBlocks(opened);
    assert.equal(blocks.length,2);
    assert.ok(blocks[0].text.includes('\n\ncontinued here.'));
    assert.ok(blocks[0].rect[2]<440);
    assert.equal(editsFor(blocks,text,text.replace('continued here.','validated here.')).size,1);
  } finally { await opened.task.destroy(); }
});
