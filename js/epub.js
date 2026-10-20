// 책을 전자책(EPUB 3)으로 만듭니다. docx.js의 makeZip·xmlEsc를 같이 씁니다.
// 표지 사진(있으면) → 제목 쪽 → 쪽마다 한 장(챕터). 쪽 제목으로 목차가 만들어집니다.

// dataURL(base64) → 바이트
function dataUrlBytes(data_url) {
    const bin = atob(data_url.split(',')[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
}

function epubPage(title, body) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ko" lang="ko">
<head><meta charset="UTF-8"/><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`
}

// book: { uid, title, cover }, info: 제목 쪽의 작은 줄들, pages: [{ title, content }], author: 지은이
function makeBookEpub(book, info, pages, author) {
    const has_cover = isCoverImage(book.cover)
    const cover_type = has_cover ? book.cover.slice(5, book.cover.indexOf(';')) : ''
    const cover_ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[cover_type]
    const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    const chapters = pages.map((p, i) => ({ id: `p${String(i + 1).padStart(4, '0')}`, title: p.title, content: p.content }))
    const files = [
        { name: 'mimetype', text: 'application/epub+zip' }, // 맨 앞, 압축 없이 (EPUB 규칙)
        {
            name: 'META-INF/container.xml',
            text: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
        },
        {
            name: 'OEBPS/content.opf',
            text: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="ko">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:partynote:${xmlEsc(book.uid || 'book')}</dc:identifier>
<dc:title>${xmlEsc(book.title)}</dc:title>
<dc:language>ko</dc:language>
${author ? `<dc:creator>${xmlEsc(author)}</dc:creator>` : ''}
<meta property="dcterms:modified">${modified}</meta>
${has_cover ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="style" href="style.css" media-type="text/css"/>
${has_cover ? `<item id="cover-image" href="cover.${cover_ext}" media-type="${cover_type}" properties="cover-image"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>` : ''}
<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${chapters.map(c => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine>
${has_cover ? '<itemref idref="cover" linear="yes"/>' : ''}
<itemref idref="title"/>
${chapters.map(c => `<itemref idref="${c.id}"/>`).join('\n')}
</spine>
</package>`,
        },
        {
            name: 'OEBPS/nav.xhtml',
            text: epubPage('차례', `<nav epub:type="toc" id="toc"><h1>차례</h1><ol>${chapters.map(c => `<li><a href="${c.id}.xhtml">${xmlEsc(c.title)}</a></li>`).join('')}</ol></nav>`),
        },
        {
            name: 'OEBPS/style.css',
            text: `body { margin: 0 5%; line-height: 1.8; word-break: keep-all; overflow-wrap: break-word; }
h1, h2 { line-height: 1.4; }
h2 { margin: 2em 0 1.5em; font-size: 1.3em; }
p { margin: 0; text-indent: 0; }
p.blank { height: 1.8em; }
.title-page { text-align: center; padding-top: 30%; }
.title-page h1 { font-size: 1.8em; margin: 0 0 .5em; }
.title-page .author { font-size: 1.1em; margin: 0 0 2em; }
.title-page .info { color: #777; font-size: .9em; }
.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; max-height: 100%; }`,
        },
        {
            name: 'OEBPS/title.xhtml',
            text: epubPage(book.title, `<section class="title-page" epub:type="titlepage"><h1>${xmlEsc(book.title)}</h1>${author ? `<p class="author">${xmlEsc(author)}</p>` : ''}${info.map(line => `<p class="info">${xmlEsc(line)}</p>`).join('')}</section>`),
        },
        ...chapters.map(c => ({
            name: `OEBPS/${c.id}.xhtml`,
            text: epubPage(c.title, `<section epub:type="chapter"><h2>${xmlEsc(c.title)}</h2>${c.content.split(/\r\n?|\n/).map(line => line.trim() ? `<p>${xmlEsc(line)}</p>` : '<p class="blank"></p>').join('')}</section>`),
        })),
    ]
    if (has_cover) {
        files.push({ name: `OEBPS/cover.${cover_ext}`, bytes: dataUrlBytes(book.cover) })
        files.push({ name: 'OEBPS/cover.xhtml', text: epubPage(book.title, `<div class="cover" epub:type="cover"><img src="cover.${cover_ext}" alt="${xmlEsc(book.title)} 표지"/></div>`) })
    }
    return makeZip(files, 'application/epub+zip')
}
