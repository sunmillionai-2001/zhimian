const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { execFile } = require("node:child_process"),
  { pathToFileURL } = require("node:url");
const JSZip = require("jszip"),
  { DOMParser, XMLSerializer } = require("@xmldom/xmldom"),
  { diffChars } = require("diff");
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const problem = (m) => Object.assign(new Error(m), { userMessage: m });
function sourceText(blocks) {
  let text = "";
  for (const b of blocks) {
    if (text) text += "\n\n";
    b.start = text.length;
    text += b.text;
    b.end = text.length;
  }
  if (!text.trim())
    throw problem("没有可识别的文字，扫描版简历请先转为可编辑 Word。");
  if (text.length > 30000)
    throw problem("简历文字超过 30000 字，请精简后导入。");
  return text;
}
// Only edits within existing content blocks may change; structural separators remain intact.
function editsFor(blocks, source, target) {
  const diffs = diffChars(source, target, { timeout: 1500 });
  if (!diffs)
    throw problem("正文改动过大，无法对应原版位置，请重新导入最新文件。");
  let pos = 0,
    changes = [];
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    if (!d.added && !d.removed) {
      pos += d.value.length;
      continue;
    }
    const start = pos;
    let inserted = "",
      removed = "";
    while (i < diffs.length && (diffs[i].added || diffs[i].removed)) {
      if (diffs[i].added) inserted += diffs[i].value;
      else {
        removed += diffs[i].value;
        pos += diffs[i].value.length;
      }
      i++;
    }
    i--;
    const b = blocks.find((b) => start >= b.start && pos <= b.end);
    if (!b)
      throw problem(
        "有改动跨过了原文件的段落或表格边界。请保留段落结构，分别修改各段内容后再导出。",
      );
    changes.push({
      b,
      start: start - b.start,
      end: pos - b.start,
      text: inserted,
    });
  }
  const result = new Map();
  for (const c of changes.reverse()) {
    const old = result.get(c.b) || c.b.text;
    result.set(c.b, old.slice(0, c.start) + c.text + old.slice(c.end));
  }
  return result;
}
async function openWord(buffer) {
  // Reject oversized/inflation-bomb archives before parsing XML.
  const { checkZip } = require("./document-worker");
  checkZip(buffer);
  const zip = await JSZip.loadAsync(buffer);
  const part = zip.file("word/document.xml");
  if (!part) throw problem("Word 文件缺少正文。");
  const xml = await part.async("string");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw problem("这份 Word 文件包含不支持的结构。");
  let bad = false;
  const doc = new DOMParser({
    errorHandler: {
      warning() {},
      error() {
        bad = true;
      },
      fatalError() {
        bad = true;
      },
    },
  }).parseFromString(xml, "application/xml");
  if (bad) throw problem("Word 文件结构损坏，请另存为 .docx 后导入。");
  const paragraphs = Array.from(doc.getElementsByTagNameNS(W, "p")),
    blocks = [];
  for (const p of paragraphs) {
    const nodes = [];
    function walk(n) {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        if (c.namespaceURI === W && c.localName === "p") continue;
        if (
          c.namespaceURI === W &&
          ["t", "tab", "br", "cr"].includes(c.localName)
        ) {
          nodes.push({
            node: c,
            text:
              c.localName === "t"
                ? c.textContent
                : c.localName === "tab"
                  ? "\t"
                  : "\n",
          });
        } else walk(c);
      }
    }
    walk(p);
    const text = nodes.map((n) => n.text).join("");
    if (text.trim()) blocks.push({ text, nodes });
  }
  return { zip, doc, blocks, text: sourceText(blocks) };
}
function patchWordBlock(block, value) {
  const diffs = diffChars(block.text, value, { timeout: 1000 });
  if (!diffs) throw problem("这段改动过大，请分段修改。");
  const owners = [];
  for (let i = 0; i < block.nodes.length; i++)
    for (let k = 0; k < block.nodes[i].text.length; k++) owners.push(i);
  const output = block.nodes.map(() => "");
  let pos = 0;
  for (const d of diffs) {
    if (d.added) {
      let idx = owners[Math.min(pos, owners.length - 1)];
      if (block.nodes[idx]?.node.localName !== "t")
        idx = owners[Math.max(0, pos - 1)];
      if (block.nodes[idx]?.node.localName !== "t")
        throw problem("请保留原段落的制表符和换行位置。");
      output[idx] += d.value;
    } else if (d.removed) {
      for (let j = 0; j < d.value.length; j++) {
        if (block.nodes[owners[pos + j]].node.localName !== "t")
          throw problem("请保留原段落的制表符和换行位置。");
      }
      pos += d.value.length;
    } else {
      for (let j = 0; j < d.value.length; j++)
        output[owners[pos++]] += d.value[j];
    }
  }
  for (let i = 0; i < block.nodes.length; i++) {
    const n = block.nodes[i].node;
    if (n.localName !== "t") continue;
    const chunks = output[i].split("\n");
    n.textContent = chunks[0];
    n.setAttribute("xml:space", "preserve");
    let anchor = n;
    for (const chunk of chunks.slice(1)) {
      const br = n.ownerDocument.createElementNS(W, "w:br"),
        t = n.ownerDocument.createElementNS(W, "w:t");
      t.setAttribute("xml:space", "preserve");
      t.textContent = chunk;
      anchor.parentNode.insertBefore(br, anchor.nextSibling);
      br.parentNode.insertBefore(t, br.nextSibling);
      anchor = t;
    }
  }
}
function soffice() {
  const candidates = [
    process.env.ZM_SOFFICE,
    path.join(
      os.homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice",
    ),
    "/usr/bin/libreoffice",
    "/usr/bin/soffice",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found)
    throw problem(
      "Word 原版转 PDF 服务尚未配置；你可以先导出保留版式的 Word。",
    );
  return found;
}
async function wordPdf(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zm-layout-"));
  try {
    fs.writeFileSync(path.join(dir, "resume.docx"), buffer);
    await new Promise((resolve, reject) =>
      execFile(
        soffice(),
        [
          "-env:UserInstallation=" +
            pathToFileURL(path.join(dir, "profile")).href,
          "--headless",
          "--convert-to",
          "pdf:writer_pdf_Export",
          "--outdir",
          dir,
          path.join(dir, "resume.docx"),
        ],
        { timeout: 40000, maxBuffer: 1024 * 1024 },
        (e) =>
          e
            ? reject(problem("Word 原版预览生成失败，请稍后重试。"))
            : resolve(),
      ),
    );
    const pdf = fs.readFileSync(path.join(dir, "resume.pdf"));
    return pdf;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function openPdf(buffer) {
  const api = await import("pdfjs-dist/legacy/build/pdf.mjs"),
    root = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const task = api.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: path.join(root, "cmaps") + path.sep,
    cMapPacked: true,
    standardFontDataUrl: path.join(root, "standard_fonts") + path.sep,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > 30) throw problem("PDF 超过 30 页，请仅导入简历部分。");
    return { doc, task, api };
  } catch (e) {
    await task.destroy();
    throw e;
  }
}
// Render text operators invisibly while still executing their positioning state. This preserves
// backgrounds/photos and prevents the old words from leaking into an exported visual PDF.
async function renderPage(
  page,
  api,
  hidden = new Set(),
  scale = 1,
  record = false,
) {
  const { createCanvas } = require("@napi-rs/canvas"),
    vp = page.getViewport({ scale });
  if (vp.width * vp.height > 18000000)
    throw problem("页面尺寸过大，请使用常规简历页面。");
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)),
    ctx = canvas.getContext("2d");
  let hide = false;
  const paints = new Set([
    "fillText",
    "strokeText",
    "fill",
    "stroke",
    "drawImage",
    "fillRect",
    "strokeRect",
  ]);
  const proxy = new Proxy(ctx, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== "function") return v;
      return (...args) =>
        hide && paints.has(k) ? undefined : v.apply(t, args);
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
  const ops = [], imageOps = [];
  await page.render({
    canvas: hidden.size ? null : canvas,
    canvasContext: proxy,
    viewport: vp,
    recordOperations: record,
    operationsFilter(index, list) {
      hide = hidden.has(index);
      if(record && [api.OPS.paintImageXObject,api.OPS.paintInlineImageXObject,api.OPS.paintImageMaskXObject].includes(list.fnArray[index])) imageOps.push(index);
      if (
        record &&
        [
          api.OPS.showText,
          api.OPS.showSpacedText,
          api.OPS.nextLineShowText,
          api.OPS.nextLineSetSpacingShowText,
        ].includes(list.fnArray[index])
      ) {
        const args = list.argsArray[index],
          glyphs = args.find(Array.isArray) || [];
        const text = glyphs
          .filter((g) => g && typeof g === "object")
          .map((g) => g.unicode || "")
          .join("");
        if (text.trim()) ops.push({ index, text, color: ctx.fillStyle });
      }
      return true;
    },
  }).promise;
  const images=imageOps.filter(i=>page.recordedBBoxes&&!page.recordedBBoxes.isEmpty(i)).map(i=>({top:page.recordedBBoxes.minY(i)*vp.height,bottom:page.recordedBBoxes.maxY(i)*vp.height}));
  return { canvas, ops, images, width: vp.width, height: vp.height };
}
async function pdfBlocks(opened) {
  const blocks = [];
  for (let p = 1; p <= opened.doc.numPages; p++) {
    const page = await opened.doc.getPage(p),
      render = await renderPage(page, opened.api, new Set(), 1, true),
      boxes = page.recordedBBoxes,
      content = await page.getTextContent(),
      items = content.items.filter((i) => i.str);
    let itemIndex = 0;
    for (const op of render.ops) {
      if (!boxes || boxes.isEmpty(op.index)) continue;
      let rect = [
        boxes.minX(op.index) * render.width,
        boxes.minY(op.index) * render.height,
        boxes.maxX(op.index) * render.width,
        boxes.maxY(op.index) * render.height,
      ];
      if (rect[2] <= rect[0] || rect[3] <= rect[1]) continue;
      let item = null;
      for (let i = itemIndex; i < items.length; i++) {
        if (items[i].str === op.text) {
          item = items[i];
          itemIndex = i + 1;
          break;
        }
      }
      const baseline = item
        ? page
            .getViewport({ scale: 1 })
            .convertToViewportPoint(item.transform[4], item.transform[5])
        : null;
      const fontSize = item ? Math.hypot(item.transform[0], item.transform[1]) : null;
      const rotated = item ? Math.abs(item.transform[1]) > 0.01 ||
        Math.abs(item.transform[2]) > 0.01 || page.rotate !== 0 : false;
      // Tagged Chromium/Skia PDFs can report a whole clipping group as a text
      // operation's painted bounds. Anchor horizontal text to its actual text matrix.
      const positioned = !!(baseline && fontSize > 0 && item.width > 0 && !rotated);
      if (positioned) {
        const style = content.styles[item.fontName] || {};
        const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.9;
        const descent = Number.isFinite(style.descent) ? style.descent : -0.2;
        rect = [baseline[0], baseline[1] - fontSize * ascent,
          baseline[0] + item.width, baseline[1] - fontSize * descent];
      }
      blocks.push({
        positioned,
        text: op.text,
        page: p,
        ops: [op.index],
        rect,
        color: op.color,
        width: render.width,
        height: render.height,
        fontSize,
        baseline,
        rotated,
      });
    }
  }
  // Adjacent text runs on the same line form one editable block. Keep columns separate.
  const merged = [];
  for (const b of blocks) {
    const a = merged.at(-1);
    if (
      a &&
      a.page === b.page &&
      Math.abs(a.rect[1] - b.rect[1]) < 2 &&
      Math.abs(a.rect[3] - b.rect[3]) < 2 &&
      b.rect[0] >= a.rect[2] - 2 &&
      b.rect[0] - a.rect[2] < 12
    ) {
      a.text += (b.rect[0] - a.rect[2] > 3 ? " " : "") + b.text;
      a.ops.push(...b.ops);
      a.positioned = a.positioned && b.positioned;
      a.rect[2] = Math.max(a.rect[2], b.rect[2]);
    } else merged.push({ ...b });
  }
  // Join wrapped lines only when the preceding line fills its column and does
  // not end a sentence. Preserve extracted separators for existing source IDs.
  const paragraphs = [];
  for (const b of merged) {
    const a = paragraphs.at(-1), last = a?.lastLine || a;
    const columnWidth = Math.max(...merged.filter(c=>c.page===b.page &&
      Math.abs(c.rect[0]-b.rect[0])<2 && Math.abs((c.fontSize||0)-(b.fontSize||0))<0.1)
      .map(c=>c.rect[2]-c.rect[0]));
    if(a && a.positioned && b.positioned && a.page===b.page &&
      Math.abs(last.rect[0]-b.rect[0])<2 &&
      Math.abs(last.fontSize-b.fontSize)<0.1 && last.color===b.color &&
      b.baseline[1]>last.baseline[1] && b.baseline[1]-last.baseline[1]<=b.fontSize*2 &&
      last.rect[2]-last.rect[0]>=columnWidth*0.85 &&
      !/[。！？!?；;.]$/.test(last.text.trim())) {
      a.text+='\n\n'+b.text;a.ops.push(...b.ops);a.wrappedLines=true;
      a.rect=[Math.min(a.rect[0],b.rect[0]),Math.min(a.rect[1],b.rect[1]),Math.max(a.rect[2],b.rect[2]),Math.max(a.rect[3],b.rect[3])];
      a.lastLine=b;
    } else paragraphs.push({...b});
  }
  return { blocks: paragraphs, text: sourceText(paragraphs) };
}
async function exportVisualPdf(opened, blocks, changes) {
  return require('./resume-pdf-flow').exportFlow(opened, blocks, changes, renderPage);
}
async function visualWord(buffer) {
  const { Document, Packer, Paragraph, ImageRun } = require("docx"),
    opened = await openPdf(buffer);
  try {
    const sections = [];
    for (let p = 1; p <= opened.doc.numPages; p++) {
      const page = await opened.doc.getPage(p),
        r = await renderPage(page, opened.api, new Set(), 2);
      sections.push({
        properties: {
          page: {
            size: {
              width: Math.round((r.width / 2) * 20),
              height: Math.round((r.height / 2) * 20),
            },
            margin: {
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              header: 0,
              footer: 0,
            },
          },
        },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0, line: 1 },
            children: [
              new ImageRun({
                type: "png",
                data: r.canvas.toBuffer("image/png"),
                transformation: {
                  width: ((r.width / 2) * 96) / 72,
                  height: ((r.height / 2) * 96) / 72,
                },
                floating: {
                  horizontalPosition: { relative: "page", offset: 0 },
                  verticalPosition: { relative: "page", offset: 0 },
                  allowOverlap: true,
                  behindDocument: true,
                },
              }),
            ],
          }),
        ],
      });
    }
    return await Packer.toBuffer(new Document({ sections }));
  } finally {
    await opened.task.destroy();
  }
}
async function processDocument(body) {
  const buffer = Buffer.from(body.base64, "base64");
  if (body.ext === ".docx") {
    const w = await openWord(buffer);
    if (body.action === "inspect") {
      let pdf = null,
        warnings = [],
        pages = null;
      try {
        pdf = await wordPdf(buffer);
        const preview = await openPdf(pdf);
        try {
          pages = preview.doc.numPages;
        } finally {
          await preview.task.destroy();
        }
      } catch (e) {
        warnings = [e.userMessage || "原版预览暂不可用，Word 原文件仍会保留。"];
      }
      return {
        text: w.text,
        pages,
        warnings,
        pdf: pdf?.toString("base64") || null,
      };
    }
    const changes = editsFor(w.blocks, w.text, body.text);
    for (const [b, t] of changes) patchWordBlock(b, t);
    w.zip.file(
      "word/document.xml",
      new XMLSerializer().serializeToString(w.doc),
    );
    const result = changes.size
      ? await w.zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
        })
      : buffer;
    return {
      base64: (body.format === "word"
        ? result
        : await wordPdf(result)
      ).toString("base64"),
    };
  }
  const opened = await openPdf(buffer);
  try {
    if (body.action === "preview") {
      if (
        !Number.isInteger(body.page) ||
        body.page < 1 ||
        body.page > opened.doc.numPages
      )
        throw problem("预览页码无效。");
      const page = await opened.doc.getPage(body.page);
      const viewport = page.getViewport({ scale: 1 });
      const rendered = await renderPage(
        page,
        opened.api,
        new Set(),
        Math.min(2, 1100 / viewport.width),
      );
      return {
        base64: rendered.canvas.toBuffer("image/png").toString("base64"),
        pages: opened.doc.numPages,
      };
    }
    const { blocks, text } = await pdfBlocks(opened);
    if (body.action === "inspect")
      return {
        text,
        pages: opened.doc.numPages,
        warnings: [
          "PDF 沿用原模板，扩写会推动后续内容向下并按安全位置分页。导出 Word 为保留外观的页面图像，不是可逐字编辑的 Word 原稿。",
        ],
        pdf: buffer.toString("base64"),
      };
    const changes = editsFor(blocks, text, body.text);
    const pdf = changes.size
      ? await exportVisualPdf(opened, blocks, changes)
      : buffer;
    return {
      base64: (body.format === "pdf" ? pdf : await visualWord(pdf)).toString(
        "base64",
      ),
    };
  } finally {
    await opened.task.destroy();
  }
}
module.exports = {
  processDocument,
  openWord,
  editsFor,
  wordPdf,
  openPdf,
  renderPage,
  pdfBlocks,
};
