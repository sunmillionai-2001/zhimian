// Imports and exports are exercised against an isolated real service with fictional documents.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  { spawn } = require("node:child_process");
const { styledWord, styledPdf } = require("./layout-fixtures.cjs"),
  { openWord } = require("../resume-layout-engine");
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zm-layout-browser-"));
  let app, browser;
  try {
    const root = path.join(__dirname, "..");
    for (const f of fs.readdirSync(root).filter((f) => /\.(js|html)$/.test(f)))
      fs.copyFileSync(path.join(root, f), path.join(temp, f));
    fs.symlinkSync(
      path.join(root, "node_modules"),
      path.join(temp, "node_modules"),
      "dir",
    );
    fs.symlinkSync(path.join(root, "assets"), path.join(temp, "assets"), "dir");
    fs.writeFileSync(path.join(temp, "server.config.json"), "{}");
    const reserve = http.createServer();
    await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
    const port = reserve.address().port;
    await new Promise((r) => reserve.close(r));
    app = spawn(process.execPath, ["server.js"], {
      cwd: temp,
      env: { ...process.env, ZM_LOCAL_MODE: "1", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((r, j) => {
      const t = setTimeout(() => j(Error("startup timeout")), 5000);
      app.stdout.once("data", () => {
        clearTimeout(t);
        r();
      });
    });
    browser = await chromium.launch(
      process.env.PLAYWRIGHT_CHANNEL
        ? { channel: process.env.PLAYWRIGHT_CHANNEL }
        : {},
    );
    const context = await browser.newContext({
      viewport: { width: 1280, height: 950 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      try {
        localStorage?.setItem("zm_guide_seen_v1", "1");
      } catch {}
    });
    await context.route("**/fonts.googleapis.com/**", (r) => r.abort());
    const p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const meta = {
      model: "controlled",
      promptVersion: "test",
      createdAt: new Date().toISOString(),
    };
    await p.route("**/api/ai/resume-diagnose", (route) => {
      const { resume } = route.request().postDataJSON();
      route.fulfill({
        json: {
          meta,
          result: {
            overview: "补充工作方式",
            matched: [],
            missing: [],
            sections: [
              {
                original: "Maintained weekly reports.",
                start: resume.lastIndexOf("Maintained weekly reports."),
                issue: "补充验证方式",
                questions: ["如何验证？"],
              },
            ],
          },
        },
      });
    });
    await p.route("**/api/ai/resume-rewrite", (route) =>
      route.fulfill({
        json: {
          meta,
          result: {
            rewritten: "Validated weekly reports.",
            evidence: [
              { claim: "Validated", source: "Validated weekly reports." },
            ],
          },
        },
      }),
    );
    await p.goto(`http://127.0.0.1:${port}/app.html#resume`);
    // Legacy text-only records must never silently export a replacement template.
    await p.locator('#resumeText').fill('旧版正文，已有优化内容保留。');
    assert.equal(await p.locator('#resumeTemplateRequired').isVisible(), true);
    for (const format of ['word', 'pdf']) {
      const button = format === 'word' ? '#resumeExportWord' : '#resumeExportPdf';
      assert.equal(await p.locator(button).isDisabled(), true);
      const response = await p.request.post(`http://127.0.0.1:${port}/api/resume/export/${format}`, {
        data: { text: '旧版正文，已有优化内容保留。' }
      });
      assert.equal(response.status(), 409);
      assert.equal((await response.json()).code, 'RESUME_SOURCE_REQUIRED');
    }
    const word = await styledWord();
    await p.locator("#resumeFile").setInputFiles({
      name: "two-column.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: word,
    });
    await p
      .locator("#resumeImportApply")
      .waitFor({ state: "visible", timeout: 60000 });
    const draftFrame = await p
      .locator("#resumeImportFrame")
      .getAttribute("src");
    assert.match(draftFrame, /\/page\/1$/);
    assert.equal(
      (await p.request.get(new URL(draftFrame, p.url()).href)).status(),
      200,
    );
    await p.locator("#resumeImportApply").click();
    assert.equal(await p.locator("#resumeSourcePanel").isVisible(), true);
    assert.equal(await p.locator("#resumeText").isVisible(), false);
    let saved = await p.evaluate(() =>
        JSON.parse(localStorage.getItem("zm_resume_store_v1")),
      ),
      sourceId = saved.source.id;
    assert.equal(saved.source.name, "two-column.docx");
    assert.equal(saved.versions[0].text, '旧版正文，已有优化内容保留。');
    assert.equal(await p.locator('#resumeTemplateRequired').isVisible(), false);
    assert.equal(await p.locator('#resumeExportWord').isEnabled(), true);
    assert.deepEqual(
      await (
        await p.request.get(
          `http://127.0.0.1:${port}/api/resume/source/${sourceId}/original`,
        )
      ).body(),
      word,
    );
    await p.locator("#resumeDiagnose").click();
    await p.locator("#resumeFact0_0").fill("Validated weekly reports.");
    await p.locator('[data-confirm="0"]').check();
    await p.locator('[data-rewrite="0"]').click();
    await p.locator("#resumeCandidate0").waitFor();
    await p.locator('[data-adopt="0"]').click();
    await p.reload();
    saved = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("zm_resume_store_v1")),
    );
    assert.equal(saved.source.id, sourceId);
    assert.equal(saved.versions[0].source.id, sourceId);
    await p.locator("#resumePreviewUpdated").click();
    await p.waitForFunction(
      () =>
        document
          .getElementById("resumePreviewStatus")
          .textContent.includes("已展示"),
      { timeout: 60000 },
    );
    assert.match(
      await p.locator("#resumeSourceFrame").getAttribute("src"),
      /^data:image\/png;base64,/,
    );
    await p.locator(".export-menu summary").click();
    let download = p.waitForEvent("download");
    await p.locator("#resumeExportWord").click();
    const output = fs.readFileSync(await (await download).path());
    assert.equal((await openWord(output)).text, saved.versions[0].text);
    assert.match(
      (await openWord(output)).text,
      /Project Alpha\n\nMaintained weekly reports/,
    );
    assert.match(
      (await openWord(output)).text,
      /Project Beta\n\nValidated weekly reports/,
    );
    const pdf = await styledPdf();
    await p.locator("#resumeFile").setInputFiles({
      name: "colored.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await p
      .locator("#resumeImportApply")
      .waitFor({ state: "visible", timeout: 60000 });
    await p.locator("#resumeImportCancel").click();
    assert.equal(
      await p.evaluate(
        () => JSON.parse(localStorage.getItem("zm_resume_store_v1")).source.id,
      ),
      sourceId,
    );
    await p.locator("#resumeFile").setInputFiles({
      name: "colored.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await p
      .locator("#resumeImportApply")
      .waitFor({ state: "visible", timeout: 60000 });
    await p.locator("#resumeImportApply").click();
    assert.match(await p.locator("#resumeExportWord").innerText(), /页面图像/);
    if (!(await p.locator("#resumeExportPdf").isVisible()))
      await p.locator(".export-menu summary").click();
    download = p.waitForEvent("download");
    await p.locator("#resumeExportPdf").click();
    assert.deepEqual(fs.readFileSync(await (await download).path()), pdf);
    for (const width of [320, 390, 820]) {
      await p.setViewportSize({ width, height: 900 });
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
    }
    assert.deepEqual(errors, []);
    if (process.env.ZM_LAYOUT_SCREENSHOT) {
      await p.setViewportSize({ width: 1280, height: 950 });
      await p.locator("#resumeSourcePanel").scrollIntoViewIfNeeded();
      await p.waitForFunction(() => {
        const img = document.getElementById("resumeSourceFrame");
        return img.complete && img.naturalWidth > 0;
      });
      await p.screenshot({ path: process.env.ZM_LAYOUT_SCREENSHOT });
    }
    console.log(
      "PASS: original preview, account-scoped file, Word diagnose/adopt/reload/preview/export, cancelled import preserves original, PDF byte-exact roundtrip, explicit visual-Word label, mobile layout",
    );
  } finally {
    await browser?.close();
    app?.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
