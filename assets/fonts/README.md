# PDF 中文字体

`NotoSansSC-Regular.otf` 为已有 Noto Sans CJK SC 字体，遵循同目录 SIL OFL 1.1 许可。
`ZhiMianSansSC-Regular.ttf` 为其转换衍生版，重命名为 ZhiMian Sans SC，沿用 OFL 许可及原字体版权声明。

构建：在独立 Python 环境安装 `fonttools==4.60.1`，运行 `python scripts/build-pdf-font.py`。
将 CFF 曲线转换成 TrueType glyf，保留字符映射、字宽与基线；程序运行不依赖 Python。

PDF 导出统一通过 `pdf-font.js` 完整嵌入 TTF。不要改回 fontkit 子集：CFF 子集会在 Chromium/Poppler 丢失中文，TTF 子集在 PDF.js 也有缺字。完整字体增加文件体积，但保持离线可读。
验收必须同时检查可搜索文本和实际字形渲染，不能只判断文件头或字节数。
