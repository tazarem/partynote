// 책을 워드 문서(.docx)로 만듭니다. 외부 라이브러리 없이 XML 몇 개를 압축 없는 zip으로 묶습니다.
// 워드·구글 Docs(드라이브에 올려 열기)·한글에서 열 수 있어요.

const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
    }
    return table
})()

function crc32(bytes) {
    let c = 0xFFFFFFFF
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
}

// files: [{ name, text } 또는 { name, bytes }] → zip 파일 (압축하지 않고 그대로 담음. 전자책(epub)도 이걸로 묶음)
function makeZip(files, type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const enc = new TextEncoder()
    const now = new Date()
    const dos_time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
    const dos_date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
    const chunks = [], central = []
    let offset = 0
    for (const f of files) {
        const name = enc.encode(f.name)
        const data = f.bytes || enc.encode(f.text)
        const crc = crc32(data)
        const local = new DataView(new ArrayBuffer(30))
        local.setUint32(0, 0x04034b50, true)
        local.setUint16(4, 20, true)          // 풀 때 필요한 버전
        local.setUint16(6, 0x0800, true)      // 파일 이름이 UTF-8
        local.setUint16(8, 0, true)           // 압축 없음
        local.setUint16(10, dos_time, true)
        local.setUint16(12, dos_date, true)
        local.setUint32(14, crc, true)
        local.setUint32(18, data.length, true)
        local.setUint32(22, data.length, true)
        local.setUint16(26, name.length, true)
        chunks.push(new Uint8Array(local.buffer), name, data)

        const entry = new DataView(new ArrayBuffer(46))
        entry.setUint32(0, 0x02014b50, true)
        entry.setUint16(4, 20, true)
        entry.setUint16(6, 20, true)
        entry.setUint16(8, 0x0800, true)
        entry.setUint16(10, 0, true)
        entry.setUint16(12, dos_time, true)
        entry.setUint16(14, dos_date, true)
        entry.setUint32(16, crc, true)
        entry.setUint32(20, data.length, true)
        entry.setUint32(24, data.length, true)
        entry.setUint16(28, name.length, true)
        entry.setUint32(42, offset, true)
        central.push(new Uint8Array(entry.buffer), name)
        offset += 30 + name.length + data.length
    }
    const central_size = central.reduce((sum, c) => sum + c.length, 0)
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, files.length, true)
    end.setUint16(10, files.length, true)
    end.setUint32(12, central_size, true)
    end.setUint32(16, offset, true)
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type })
}

// XML에 넣을 수 없는 제어 문자는 빼고 특수 문자는 바꿈
function xmlEsc(text) {
    return String(text)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// 한 문단. 본문의 줄바꿈은 줄마다 문단 하나로 (빈 줄도 빈 문단으로 남겨 간격 유지)
// new_page: 이 문단 앞에서 페이지를 넘김 (스타일 설정보다 여러 프로그램에서 잘 지켜지는 방식)
function docxPara(text, style, new_page = false) {
    const ppr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''
    const brk = new_page ? '<w:r><w:br w:type="page"/></w:r>' : ''
    const run = text ? `<w:r><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>` : ''
    return `<w:p>${ppr}${brk}${run}</w:p>`
}

// book: { title }, info: 제목 아래 작은 줄들, pages: [{ title, content }]
function makeBookDocx(book, info, pages) {
    const body = [
        docxPara(book.title, 'Title'),
        ...info.map(line => docxPara(line, 'Subtitle')),
        ...pages.flatMap(p => [
            docxPara(p.title, 'Heading1', true), // 쪽 제목마다 새 페이지에서 시작
            ...p.content.replace(/\r\n?/g, '\n').split('\n').map(line => docxPara(line)),
        ]),
    ].join('')
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    return makeZip([
        {
            name: '[Content_Types].xml',
            text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
        },
        {
            name: '_rels/.rels',
            text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
        },
        {
            name: 'word/_rels/document.xml.rels',
            text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        },
        {
            name: 'word/styles.xml',
            text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="777777"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="360"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>`,
        },
        {
            name: 'word/document.xml',
            text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body></w:document>`,
        },
    ])
}
