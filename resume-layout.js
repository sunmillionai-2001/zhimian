// Source documents remain private to the account; all parsing/rendering runs in a worker.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { fork } = require("node:child_process");
const { validateUpload } = require("./document-import");
const fail = (m, s = 422) => Object.assign(new Error(m), { status: s });
function work(body) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, "resume-layout-worker.js"), [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: ["--max-old-space-size=512"],
    });
    let done = false;
    const finish = (e, r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      e ? reject(e) : resolve(r);
    };
    const timer = setTimeout(
      () => finish(fail("原版文件处理超时，请稍后重试。")),
      60000,
    );
    child.on("message", (r) =>
      r.error ? finish(fail(r.error)) : finish(null, r),
    );
    child.on("error", () => finish(fail("无法启动原版文件处理服务。", 500)));
    child.on("exit", () => finish(fail("原版文件处理未完成，原文件保留。")));
    child.send(body);
  });
}
function createSourceStore(directory) {
  const root = path.join(directory, "resume-sources");
  function load(id) {
    if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id))
      throw fail("请重新导入原文件以保留版式。", 400);
    const dir = path.join(root, id);
    try {
      return {
        dir,
        ...JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")),
      };
    } catch {
      throw fail("当前账号找不到这份原文件，请重新导入。", 404);
    }
  }
  return {
    async import(body) {
      const { ext, buffer } = validateUpload(body);
      fs.mkdirSync(root, { recursive: true });
      const existing = fs.readdirSync(root);
      if (existing.length >= 100)
        throw fail("已保存 100 份原文件，请联系管理员整理后继续。");
      const result = await work({
        action: "inspect",
        ext,
        base64: body.base64,
      });
      const id = crypto.randomBytes(16).toString("hex"),
        dir = path.join(root, id);
      fs.mkdirSync(dir, { mode: 0o700 });
      try {
        fs.writeFileSync(path.join(dir, "original" + ext), buffer, {
          mode: 0o600,
        });
        if (result.pdf)
          fs.writeFileSync(
            path.join(dir, "preview.pdf"),
            Buffer.from(result.pdf, "base64"),
            { mode: 0o600 },
          );
        fs.writeFileSync(
          path.join(dir, "meta.json"),
          JSON.stringify({
            name: body.name,
            ext,
            text: result.text,
            pages: result.pages,
            warnings: result.warnings,
          }),
          { mode: 0o600 },
        );
      } catch (e) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw e;
      }
      return {
        text: result.text,
        pages: result.pages,
        warnings: result.warnings,
        source: { id, name: body.name, ext, pages: result.pages },
      };
    },
    read(id, original = false) {
      const m = load(id);
      const file = path.join(
        m.dir,
        original ? "original" + m.ext : "preview.pdf",
      );
      if (!fs.existsSync(file))
        throw fail("原版预览暂不可用，你仍可下载原件或导出 Word。", 404);
      return { buffer: fs.readFileSync(file), ext: original ? m.ext : ".pdf" };
    },
    async page(id, page = 1, text = null) {
      load(id);
      if (!Number.isInteger(page) || page < 1 || page > 30)
        throw fail("预览页码无效。", 400);
      const pdf =
        text === null
          ? this.read(id).buffer
          : await this.render(id, text, "pdf");
      return work({
        action: "preview",
        ext: ".pdf",
        base64: pdf.toString("base64"),
        page,
      });
    },
    async render(id, text, format, requireChanges = false) {
      const m = load(id);
      if (typeof text !== "string" || !text.trim() || text.length > 30000)
        throw fail("请检查简历正文，最多 30000 字。", 400);
      if (!["pdf", "word"].includes(format)) throw fail("导出格式无效", 400);
      if(requireChanges && text.replace(/\s/g, "") === m.text.replace(/\s/g, "")) throw fail("当前内容与原稿相同，尚未采用优化；请先采用改写，下载原稿请使用原件入口。", 409);
      const original = fs.readFileSync(path.join(m.dir, "original" + m.ext));
      if (
        text === m.text &&
        ((format === "word" && m.ext === ".docx") ||
          (format === "pdf" && m.ext === ".pdf"))
      )
        return original;
      const r = await work({
        action: "export",
        ext: m.ext,
        base64: original.toString("base64"),
        text,
        format,
      });
      return Buffer.from(r.base64, "base64");
    },
  };
}
module.exports = { createSourceStore };
