"""Build the PDF-safe TrueType derivative of the bundled OFL font.
Build dependency only: fonttools==4.60.1; no Python needed at app runtime.
CFF CID-keyed subsetting is not reliable in the pdf-lib/fontkit combination.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
root = Path(__file__).resolve().parents[1]
source = TTFont(root / 'assets/fonts/NotoSansSC-Regular.otf')
order, glyph_set = source.getGlyphOrder(), source.getGlyphSet()
builder = FontBuilder(source['head'].unitsPerEm, isTTF=True)
builder.setupGlyphOrder(order)
builder.setupCharacterMap(source.getBestCmap())
glyphs = {}
for name in order:
    pen = TTGlyphPen(None)
    glyph_set[name].draw(Cu2QuPen(pen, max_err=source['head'].unitsPerEm / 1000, reverse_direction=True))
    glyphs[name] = pen.glyph()
builder.setupGlyf(glyphs)
builder.setupHorizontalMetrics(source['hmtx'].metrics)
builder.setupHorizontalHeader(ascent=source['hhea'].ascent, descent=source['hhea'].descent, lineGap=source['hhea'].lineGap)
builder.setupNameTable({
    'familyName': 'ZhiMian Sans SC', 'styleName': 'Regular',
    'uniqueFontIdentifier': 'ZhiMianSansSC-Regular-1.0',
    'fullName': 'ZhiMian Sans SC Regular', 'psName': 'ZhiMianSansSC-Regular',
    'version': 'Version 1.0', 'licenseDescription': 'SIL Open Font License 1.1; derivative of Noto Sans CJK SC.',
    'copyright': source['name'].getDebugName(0) or 'Noto Sans CJK authors',
})
builder.setupOS2(sTypoAscender=source['OS/2'].sTypoAscender, sTypoDescender=source['OS/2'].sTypoDescender, sTypoLineGap=source['OS/2'].sTypoLineGap, usWinAscent=source['OS/2'].usWinAscent, usWinDescent=source['OS/2'].usWinDescent)
builder.setupPost(keepGlyphNames=False)
builder.font['head'].created = source['head'].created
builder.font['head'].modified = source['head'].modified
builder.font.recalcTimestamp = False
builder.save(root / 'assets/fonts/ZhiMianSansSC-Regular.ttf')
print(f'Built PDF TrueType font: {len(order)} glyphs, {len(source.getBestCmap())} mapped characters')
