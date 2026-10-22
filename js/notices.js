// 공지: 메뉴(환경설정) 맨 위 '공지' 칸. 글 쓰는 화면은 방해하지 않고, 새 공지가 있으면 메뉴 버튼에 작은 점만 찍음
// 공지는 파티노트 서버(GET /notices)에서 받아 오고, 마지막으로 받은 것을 기기에 저장해 둠
// - 오프라인·서버 장애: 저장해 둔 공지를 그대로 보여 줌 (오류 문구 없이)
// - 한 번도 받은 적이 없으면 공지 칸을 숨김
const NOTICE_SEEN_KEY = 'ptnt_notice_seen'
const NOTICE_CACHE_KEY = 'ptnt_notices'

// 공지 내용(HTML)에서 이 태그들만 남기고, 링크는 앱 안 주소·https·메일만 허용
const NOTICE_TAGS = new Set(['P', 'UL', 'OL', 'LI', 'B', 'STRONG', 'EM', 'BR', 'A'])
// 이 태그들은 안의 내용까지 통째로 버림
const NOTICE_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH'])

function cleanNoticeHtml(html) {
    const src = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstChild
    const out = document.createElement('div')
    const copy = (from, to) => {
        for (const node of from.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                to.appendChild(document.createTextNode(node.textContent))
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (NOTICE_DROP.has(node.tagName.toUpperCase())) continue
                if (!NOTICE_TAGS.has(node.tagName)) {
                    copy(node, to) // 허용하지 않는 태그는 벗기고 안의 글자만
                    continue
                }
                const el = document.createElement(node.tagName)
                if (node.tagName === 'A') {
                    const href = node.getAttribute('href') || ''
                    if (/^(\.\/|https:\/\/|mailto:)/.test(href)) {
                        el.setAttribute('href', href)
                        el.setAttribute('target', '_blank')
                        el.setAttribute('rel', 'noopener')
                    }
                }
                copy(node, el)
                to.appendChild(el)
            }
        }
    }
    copy(src, out)
    return out.innerHTML
}

const notices = {
    items: [],

    // 기기에 저장해 둔 공지로 먼저 그리고, 서버에서 새로 받아 오면 다시 그림
    async init() {
        try { this.items = JSON.parse(localStorage.getItem(NOTICE_CACHE_KEY) || '[]') } catch (e) { this.items = [] }
        this.render()
        await this.refresh()
        window.addEventListener('online', () => this.refresh())
    },

    async refresh() {
        const base = APP_CONFIG.api_base
        if (!base) return
        try {
            const res = await fetch(`${base}/notices`)
            if (!res.ok) return // 서버 장애: 저장해 둔 공지를 그대로 둠
            this.items = (await res.json()).notices || []
            try { localStorage.setItem(NOTICE_CACHE_KEY, JSON.stringify(this.items)) } catch (e) { }
            this.render()
        } catch (e) {
            // 오프라인: 저장해 둔 공지를 그대로 둠 (아무 표시도 하지 않음)
        }
    },

    latestId() {
        return this.items.reduce((max, n) => Math.max(max, n.id), 0)
    },

    seenId() {
        try { return Number(localStorage.getItem(NOTICE_SEEN_KEY)) || 0 } catch (e) { return 0 }
    },

    dateLabel(value) {
        const d = new Date(value)
        if (Number.isNaN(d.getTime())) return ''
        return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`
    },

    render() {
        const wrap = $('.notice-wrap')
        if (!wrap) return
        wrap.hidden = !this.items.length // 받은 공지가 없으면 칸째 숨김
        const seen = this.seenId()
        // 최근 3개까지, 제목만 접어서. 아직 안 읽은 공지는 제목 앞에 빨간 점
        $('.notice-list').innerHTML = this.items.slice(0, 3).map(n => `
            <details class="notice">
                <summary>
                    ${n.id > seen ? '<span class="notice-new" aria-label="새 공지"></span>' : ''}
                    <span class="notice-title">${esc(n.title)}</span>
                    <span class="notice-date">${esc(this.dateLabel(n.date))}</span>
                </summary>
                <div class="notice-body">${cleanNoticeHtml(n.body || '')}</div>
            </details>`).join('')
        this.renderDot()
    },

    // 메뉴 버튼의 작은 점: 안 읽은 공지가 있을 때만
    renderDot() {
        const dot = $('.menu-dot')
        if (dot) dot.hidden = this.latestId() <= this.seenId()
    },

    // 메뉴를 열면 읽은 것으로 (메뉴 버튼의 점은 바로 사라지고, 제목 앞의 점은 다음에 앱을 열 때 사라짐)
    markSeen() {
        if (!this.items.length) return
        try { localStorage.setItem(NOTICE_SEEN_KEY, String(Math.max(this.latestId(), this.seenId()))) } catch (e) { }
        this.renderDot()
    },
}
