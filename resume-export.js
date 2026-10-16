// 简历导出服务：生成格式化的 Word 和 PDF 文件
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * 生成 Word 格式简历
 * @param {string} resumeText - 简历文本内容
 * @param {object} options - 可选配置 {title, name}
 * @returns {Promise<Buffer>} Word 文件的二进制数据
 */
async function generateWordResume(resumeText, options = {}) {
  const { title = '个人简历', name = '求职者' } = options;

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
    const isSectionTitle = /^[一二三四五六七八九十\d]+[、\.\s]/.test(trimmed) ||
                          /^(个人信息|教育背景|工作经历|项目经验|专业技能|自我评价|求职意向)/.test(trimmed);

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
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([595, 842]); // A4 尺寸
  const { width, height } = page.getSize();
  const margin = 50;
  const maxWidth = width - 2 * margin;

  let yPosition = height - margin;
  const lineHeight = 14;
  const titleSize = 18;
  const headingSize = 14;
  const textSize = 11;

  // 添加标题
  const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: yPosition,
    size: titleSize,
    font: boldFont,
    color: rgb(0.2, 0.11, 0.08) // 墨色
  });

  yPosition -= 30;

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
    const isSectionTitle = /^[一二三四五六七八九十\d]+[、\.\s]/.test(trimmed) ||
                          /^(个人信息|教育背景|工作经历|项目经验|专业技能|自我评价|求职意向)/.test(trimmed);

    if (isSectionTitle) {
      yPosition -= 10;
      page.drawText(trimmed, {
        x: margin,
        y: yPosition,
        size: headingSize,
        font: boldFont,
        color: rgb(0.76, 0.23, 0.12) // 朱砂红
      });
      yPosition -= lineHeight + 5;
    } else {
      // 处理长文本换行
      const words = trimmed.split('');
      let currentLine = '';

      for (const char of words) {
        const testLine = currentLine + char;
        const testWidth = font.widthOfTextAtSize(testLine, textSize);

        if (testWidth > maxWidth && currentLine) {
          page.drawText(currentLine, {
            x: margin,
            y: yPosition,
            size: textSize,
            font: font,
            color: rgb(0.13, 0.11, 0.08)
          });
          yPosition -= lineHeight;
          currentLine = char;

          // 检查是否需要新页面
          if (yPosition < margin + 20) {
            page = pdfDoc.addPage([595, 842]);
            yPosition = height - margin;
          }
        } else {
          currentLine = testLine;
        }
      }

      // 绘制最后一行
      if (currentLine) {
        page.drawText(currentLine, {
          x: margin,
          y: yPosition,
          size: textSize,
          font: font,
          color: rgb(0.13, 0.11, 0.08)
        });
        yPosition -= lineHeight + 2;
      }
    }
  }

  // 生成 PDF buffer
  return await pdfDoc.save();
}

module.exports = {
  generateWordResume,
  generatePdfResume
};
