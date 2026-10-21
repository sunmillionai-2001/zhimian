// Embed the full font: fontkit subsets can lose glyphs in PDF.js as well.
// Use a glyf-based TrueType font: CFF CID-keyed subsets from fontkit can map
// Chinese characters to missing glyphs in Chromium/Poppler despite valid ToUnicode.
const fs=require('node:fs'),path=require('node:path'),fontkit=require('@pdf-lib/fontkit');
let bytes;
async function embedResumeFont(pdf){
  bytes ||= fs.readFileSync(path.join(__dirname,'assets/fonts/ZhiMianSansSC-Regular.ttf'));
  pdf.registerFontkit(fontkit);
  return pdf.embedFont(bytes,{subset:false});
}
module.exports={embedResumeFont};
