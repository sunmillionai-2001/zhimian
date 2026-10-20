const { processDocument } = require("./resume-layout-engine");
process.once("message", async (body) => {
  try {
    process.send(await processDocument(body));
  } catch (e) {
    process.send({
      error:
        e.userMessage ||
        "暂时无法保留这份文件的版式。原文件未改变，请尝试导入 Word 原稿。",
    });
  }
});
