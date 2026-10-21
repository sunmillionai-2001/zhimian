// 简历导出服务：生成格式化的 Word 和 PDF 文件
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const { PDFDocument, rgb } = require('pdf-lib');
const { embedResumeFont } = require('./pdf-font');

function isSectionHeading(text) {
  return /^(个人信息|教育背景|工作经历|项目经验|专业技能|自我评价|求职意向)[：:]?$/.test(text) ||
    (text.length <= 24 && /^(?:[一二三四五六七八九十]+|\d{1,2})[、.\s]/.test(text));
}

/**
 * 生成 Word 格式简历
 * @param {string} resumeText - 简历文本内容
 * @param {object} options - 可选配置 {title}
 * @returns {Promise<Buffer>} Word 文件的二进制数据
 */
async function generateWordResume(resumeText, options = {}) {
  const { title = '个人简历' } = options;

  // 将简历文本按段落分割
  const lines = resumeText.split('\n').filter(line => line.trim());

  const children = [];

  // 添加标题
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 }
    })
  );

  // 处理每一段内容
  for (const line of lines) {
    const trimmed = line.trim();

    // 识别章节标题（如：工作经历、教育背景等）
    const isSectionTitle = isSectionHeading(trimmed);

    if (isSectionTitle) {
      children.push(
        new Paragraph({
          text: trimmed,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        })
      );
    } else {
      // 普通段落
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed })],
          spacing: { after: 100 }
        })
      );
    }
  }

  // 创建文档
  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  // 生成 buffer
  return await Packer.toBuffer(doc);
}

/**
 * 生成 PDF 格式简历
 * @param {string} resumeText - 简历文本内容
 * @param {object} options - 可选配置 {title}
 * @returns {Promise<Buffer>} PDF 文件的二进制数据
 */
async function generatePdfResume(resumeText, options = {}) {
  const { title = '个人简历' } = options;

  const pdfDoc = await PDFDocument.create();

  // 嵌入 TrueType 中文字体，避免 CFF 子集字形映射丢失
  const font = await embedResumeFont(pdfDoc);

  let page = pdfDoc.addPage([595, 842]); // A4 尺寸
  const { width, height } = page.getSize();
  const margin = 50;
  const maxWidth = width - 2 * margin;

  let yPosition = height - margin;
  const lineHeight = 16;
  const titleSize = 20;
  const headingSize = 15;
  const textSize = 12;

  // 添加标题
  const titleWidth = font.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: yPosition,
    size: titleSize,
    font,
    color: rgb(0.13, 0.11, 0.08) // 墨色
  });

  yPosition -= 34;

  // 处理内容
  const lines = resumeText.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 检查是否需要新页面
    if (yPosition < margin + 20) {
      page = pdfDoc.addPage([595, 842]);
      yPosition = height - margin;
    }

    // 识别章节标题
    const isSectionTitle = isSectionHeading(trimmed);

    const size = isSectionTitle ? headingSize : textSize;
    if (isSectionTitle) yPosition -= 10;
    const wrapped = [];
    let current = '';
    for (const char of Array.from(trimmed)) {
      if (current && font.widthOfTextAtSize(current + char, size) > maxWidth) {
        wrapped.push(current);
        current = '';
      }
      current += char;
    }
    if (current) wrapped.push(current);
    for (const text of wrapped) {
      if (yPosition < margin + 20) {
        page = pdfDoc.addPage([595, 842]);
        yPosition = height - margin;
      }
      page.drawText(text, {
        x: margin, y: yPosition, size, font,
        color: isSectionTitle ? rgb(0.76, 0.23, 0.12) : rgb(0.13, 0.11, 0.08)
      });
      yPosition -= Math.max(lineHeight, size + 3);
    }
    yPosition -= isSectionTitle ? 6 : 2;
  }

  // 生成 PDF buffer（pdf-lib 返回 Uint8Array，统一转为 Node Buffer）
  return Buffer.from(await pdfDoc.save());
}

module.exports = {
  generateWordResume,
  generatePdfResume
};
