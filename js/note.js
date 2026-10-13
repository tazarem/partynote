// 테마. 색 변수는 css의 :root 기본값을 덮어씁니다.
const THEMES = {
    partynote: {
        vars: { '--bg': '#FFCDD2', '--surface': '#FFF5F6', '--text': '#3A1F26', '--sub': '#8A5A66', '--accent': '#FF8FAB', '--accent-text': '#3A1F26', '--line': '#0000001f', '--overlay': '#00000022' },
        // 책 표지 색 (책마다 하나씩 돌아가며)
        cover_pack: ['#FF8FAB', '#FFB74D', '#FFD54F', '#AED581', '#4DD0E1', '#64B5F6', '#9575CD', '#F06292'],
        meta_color: '#FFCDD2',
    },
    marine: {
        vars: { '--bg': '#E1F5FE', '--surface': '#F5FCFF', '--text': '#141D47', '--sub': '#4A5A80', '--accent': '#4FC3F7', '--accent-text': '#141D47', '--line': '#141d4721', '--overlay': '#141d4722' },
        cover_pack: ['#4FC3F7', '#4DB6AC', '#81C784', '#7986CB', '#64B5F6', '#4DD0E1', '#9575CD', '#90A4AE'],
        meta_color: '#E1F5FE',
    },
    cryptic: {
        vars: { '--bg': '#0D1117', '--surface': '#161B22', '--text': '#E6EDF3', '--sub': '#8B949E', '--accent': '#FF79A8', '--accent-text': '#0D1117', '--line': '#ffffff1f', '--overlay': '#00000066' },
        cover_pack: ['#FF79A8', '#FFB86C', '#F1FA8C', '#50FA7B', '#8BE9FD', '#6272A4', '#BD93F9', '#FF5555'],
        meta_color: '#0D1117',
    },
}

const ICONS = {
    memo: 'far fa-sticky-note',
    book: 'fas fa-book',
}

// 예전 파티노트(v0.83까지)가 쓰던 저장소 이름
const LEGACY_DATABASE = 'Partynote'

// 임시 저장: 쓰고 있는 글 하나만, 가장 최근 것으로 덮어씁니다. (저장을 잊거나 앱이 닫혔을 때 되살리는 용도)
const DRAFT_KEY = 'ptnt_draft'
const DRAFT_INTERVAL = 8000 // 쓰는 동안 8초에 한 번 임시 저장

// 기기에 남기는 화면 설정 (테마, 마지막으로 보던 탭)
const note_config = (() => {
    const KEY = 'ptnt_config'
    const defaults = { app_theme: 'partynote', tab: 'all', page_sort: 'asc' } // page_sort: 책 안의 쪽을 보여 주는 순서 (모든 책 공통)
    let data = { ...defaults }
    try { data = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch (e) { }
    return {
        get: (key) => data[key],
        set: (key, value) => {
            data[key] = value
            try { localStorage.setItem(KEY, JSON.stringify(data)) } catch (e) { }
        },
    }
})()

function newUid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// 기기 현지 날짜 YYYYMMDD
function dateStamp(d = new Date()) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

// 임시 저장한 때: 오늘이면 '오늘 오후 2:05:32', 어제면 '어제 오후 2:05:32', 더 예전이면 '2026.10.10 오후 2:05:32'
function draftTimeLabel(time) {
    const d = new Date(time)
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const days_ago = Math.round((day(new Date()) - day(d)) / 86400000)
    const date = days_ago === 0 ? '오늘' : days_ago === 1 ? '어제'
        : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
    const h = d.getHours()
    const pad = (n) => String(n).padStart(2, '0')
    return `${date} ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function dateTimeLabel(time) {
    return new Date(time).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

// 예전 파티노트의 글(편집기가 만든 html)을 줄글로 바꿉니다. 문단은 줄바꿈으로, 목록은 '• '로.
// DOMParser로 읽기만 하므로 안의 스크립트는 실행되지 않습니다.
function legacyHtmlToText(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html')
    const lines = []
    const blockText = (el) => {
        // 빈 줄은 <p><br></p> 로 들어 있음
        if (el.childNodes.length === 1 && el.firstChild.nodeName === 'BR') return ''
        el.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
        return el.textContent
    }
    for (const node of doc.body.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim()) lines.push(node.textContent)
        } else if (node.nodeName === 'UL' || node.nodeName === 'OL') {
            ;[...node.children].forEach((li, i) => lines.push(`${node.nodeName === 'OL' ? `${i + 1}.` : '•'} ${blockText(li)}`))
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            lines.push(blockText(node))
        }
    }
    return lines.join('\n').replace(/ /g, ' ').trim()
}

// 책의 상태. order: 목록에서 쓰는 중 → 완결 → 연재 중지 순으로
const BOOK_STATUS = {
    active: { order: 0 },
    done: { order: 1, label: '완결한 책', short: '완결', icon: 'fas fa-trophy' },
    stopped: { order: 2, label: '연재를 멈춘 책', short: '연재 중지', icon: 'fas fa-pause' },
}
function statusOf(book) {
    return ['done', 'stopped'].includes(book?.status) ? book.status : 'active'
}

// 시각 → '2026년 10월 12일'
function fullDate(time) {
    const d = new Date(time)
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

// 시작한 날부터 오늘까지의 기간: '12일째', '3개월 5일째', '1년 2개월째' (시작한 날이 1일째)
function periodLabel(from, to = Date.now()) {
    const a = new Date(from), b = new Date(to)
    let months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()
    let days = b.getDate() - a.getDate()
    if (days < 0) {
        months--
        // 지난달의 같은 날짜부터 센 날 수 (31일에 시작했는데 지난달이 28일까지면 28일부터)
        const prev_days = new Date(b.getFullYear(), b.getMonth(), 0).getDate()
        days = prev_days - Math.min(a.getDate(), prev_days) + b.getDate()
    }
    if (months <= 0) return `${Math.max(days, 0) + 1}일째`
    const parts = []
    if (months >= 12) parts.push(`${Math.floor(months / 12)}년`)
    if (months % 12) parts.push(`${months % 12}개월`)
    if (days) parts.push(`${days}일`)
    return `${parts.join(' ')}째`
}

// 내려받기: 글자를 파일로
function downloadText(filename, text, type) {
    const blob = new Blob([text], { type })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

class PartyNote {
    memos = []          // 저장된 메모 전부 (낱장 + 책 속의 쪽)
    books = []
    tab = 'all'         // all | memo | book | favorite
    q = ''              // 검색어
    open_memo_id = null // 지금 팝업에 열려 있는 메모
    open_book_id = null // 지금 팝업에 열려 있는 책 (책 속의 메모를 읽는 중에도 유지)
    memo_base = null    // 메모 편집을 시작할 때의 값 (바뀌었는지 비교용)
    edit_book_id = 0    // 새 메모를 저장할 때 넣을 책 (0 = 낱장)
    draft_mine = false  // 지금 편집 화면이 임시 저장의 주인인지 (다른 글의 임시 저장을 실수로 지우지 않기 위함)
    draft_saved = null  // 이 화면에서 마지막으로 임시 저장한 것: { at, title, content } (상태 표시와, 바뀐 게 없을 때 다시 쓰지 않기 위함)
    draft_kept = null   // 이 화면이 덮어쓰기 직전에 임시 저장소에 있던 글 (편집 화면을 떠나기 전까지는 불러올 수 있게 잠깐 들고 있음)

    async init() {
        this.applyTheme(note_config.get('app_theme'))
        this.tab = ['all', 'memo', 'book', 'favorite'].includes(note_config.get('tab')) ? note_config.get('tab') : 'all'
        await idb.openDatabase()
        const moved = await this.migrateLegacy()
        this.memos = await idb.doSelectAll('memo')
        this.books = await idb.doSelectAll('book')
        this.render()
        if (moved) ui.toast(`예전 파티노트의 글 ${moved}개를 가져왔어요`)
    }

    applyTheme(name) {
        if (!THEMES[name]) name = 'partynote'
        const theme = THEMES[name]
        Object.entries(theme.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))
        $('meta[name="theme-color"]').setAttribute('content', theme.meta_color)
        document.documentElement.dataset.theme = name
        $$('input[name="app_theme"]').forEach(el => el.checked = el.value === name)
        this.theme = theme
    }

    coverColor(book) {
        const pack = this.theme.cover_pack
        return pack[book.id % pack.length]
    }

    /* ---------- 예전 파티노트 글 가져오기 ---------- */
    // 같은 주소에 남아 있는 옛 저장소의 글을 처음 한 번만 메모로 옮깁니다. 옛 저장소는 지우지 않습니다.
    async migrateLegacy() {
        if (await idb.getMeta('legacy_migrated')) return 0
        let moved = 0
        try {
            const rows = await this.readLegacyNotes()
            for (const row of rows) {
                const val = row?.val
                if (!val || typeof val !== 'object') continue
                const content = legacyHtmlToText(val.contents)
                const title = String(val.title ?? '').trim().slice(0, 100) || content.split('\n')[0].slice(0, 100)
                if (!title && !content) continue
                // 옛 날짜 모양: '2024/07/11 13:05:09'
                const parsed = new Date(String(val.date ?? '').replace(/\//g, '-').replace(' ', 'T')).getTime()
                const time = Number.isFinite(parsed) ? parsed : Date.now()
                await idb.doInsert('memo', { ...idb.newRecord('memo'), uid: newUid(), title: title || '제목 없음', content, created_at: time, updated_at: time })
                moved++
            }
        } catch (e) {
            console.error(e)
            return moved // 표시를 남기지 않아 다음에 다시 시도 (하나도 못 옮긴 경우)
        }
        await idb.setMeta('legacy_migrated', Date.now())
        return moved
    }

    // 옛 저장소가 없으면 새로 만들지 않고 빈 배열을 돌려줍니다.
    readLegacyNotes() {
        return new Promise((res) => {
            const req = indexedDB.open(LEGACY_DATABASE)
            req.onupgradeneeded = (e) => e.target.transaction.abort() // 없던 저장소: 만들지 않고 취소
            req.onerror = (e) => {
                e.preventDefault()
                res([])
            }
            req.onsuccess = (e) => {
                const db = e.target.result
                if (!db.objectStoreNames.contains('note')) {
                    db.close()
                    return res([])
                }
                const get = db.transaction('note').objectStore('note').getAll()
                get.onsuccess = () => {
                    db.close()
                    res(get.result || [])
                }
                get.onerror = () => {
                    db.close()
                    res([])
                }
            }
        })
    }

    /* ---------- 저장 ---------- */
    memo(id) { return this.memos.find(m => m.id === id) }
    book(id) { return this.books.find(b => b.id === id) }

    // 책의 쪽들 (순서대로)
    pages(book_id) {
        return this.memos.filter(m => m.book_id === book_id).sort((a, b) => a.order - b.order || a.id - b.id)
    }

    async saveMemoRecord(memo, { touch = true } = {}) {
        if (touch) memo.updated_at = Date.now()
        await idb.doUpdate('memo', memo.id, memo)
    }

    async saveBookRecord(book, { touch = true } = {}) {
        if (touch) book.updated_at = Date.now()
        await idb.doUpdate('book', book.id, book)
    }

    async insertMemo(values) {
        const now = Date.now()
        const memo = { ...idb.newRecord('memo'), uid: newUid(), created_at: now, updated_at: now, ...values }
        memo.id = await idb.doInsert('memo', memo)
        this.memos.push(memo)
        return memo
    }

    async insertBook(title) {
        const now = Date.now()
        const book = { ...idb.newRecord('book'), uid: newUid(), title, created_at: now, updated_at: now }
        book.id = await idb.doInsert('book', book)
        this.books.push(book)
        return book
    }

    // 책의 맨 뒤 순서
    nextOrder(book_id) {
        return this.pages(book_id).reduce((max, m) => Math.max(max, m.order), 0) + 1
    }

    /* ---------- 목록 ---------- */
    setTab(tab) {
        this.tab = tab
        note_config.set('tab', tab)
        this.render()
    }

    words() {
        return this.q.toLowerCase().split(/\s+/).filter(Boolean)
    }

    // 띄어 쓴 낱말이 모두 들어 있어야 함
    textMatches(text) {
        const lower = text.toLowerCase()
        return this.words().every(w => lower.includes(w))
    }

    // 목록에 나올 줄들: 책 + 낱장 메모. 검색 중이거나 즐겨찾기 탭이면 책 속의 쪽도 따로 보여 줍니다.
    listRows() {
        const searching = this.words().length > 0
        const rows = []
        for (const b of this.books) {
            const pages = this.pages(b.id)
            if (searching && !this.textMatches([b.title, ...pages.flatMap(p => [p.title, p.content])].join('\n'))) continue
            rows.push({ kind: 'book', item: b })
        }
        for (const m of this.memos) {
            if (searching && !this.textMatches(`${m.title}\n${m.content}`)) continue
            if (m.book_id && !searching && !m.favorite) continue // 책 속의 쪽은 평소엔 책 안에서만
            rows.push({ kind: m.book_id ? 'page' : 'memo', item: m })
        }
        return rows
    }

    render() {
        const rows = this.listRows()
        const in_tab = (tab) => rows.filter(r =>
            tab === 'all' ? r.kind !== 'page' || this.words().length > 0
                : tab === 'favorite' ? r.item.favorite
                    : tab === 'memo' ? r.kind === 'memo' || (r.kind === 'page' && this.words().length > 0)
                        : r.kind === 'book')
        const tabs = [
            { value: 'all', label: '전체', icon: 'fas fa-layer-group' },
            { value: 'book', label: '책', icon: ICONS.book },
            { value: 'memo', label: '메모', icon: ICONS.memo },
            { value: 'favorite', label: '', aria: '즐겨찾기', icon: 'fas fa-star' },
        ]
        $('.type-tabs').innerHTML = tabs.map(t => `
            <button type="button" role="tab" data-tab="${t.value}" aria-selected="${this.tab === t.value}"${t.aria ? ` aria-label="${t.aria}"` : ''}>
                <i class="${t.icon}"></i> ${t.label} <span class="count">${in_tab(t.value).length}</span>
            </button>`).join('')

        // 즐겨찾기가 맨 위, 그 안에서는 최근 고친 순
        const rank = (r) => r.kind === 'book' ? BOOK_STATUS[statusOf(r.item)].order : 0 // 완결·연재 중지한 책은 뒤로
        const list = in_tab(this.tab).sort((a, b) => (b.item.favorite ? 1 : 0) - (a.item.favorite ? 1 : 0) || rank(a) - rank(b) || b.item.updated_at - a.item.updated_at)
        const el = $('.item-list')
        if (list.length) {
            el.innerHTML = list.map(r => r.kind === 'book' ? this.bookRowHtml(r.item) : this.memoRowHtml(r.item)).join('')
            return
        }
        if (this.q.trim()) {
            el.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>'${esc(this.q.trim())}'에 맞는 것이 없어요.</p></div>`
        } else if (this.tab === 'favorite') {
            el.innerHTML = `<div class="empty-state"><i class="far fa-star"></i><p>아직 즐겨찾기한 것이 없어요.<br>메모나 책을 열고 별을 눌러 보세요.</p></div>`
        } else {
            const what = this.tab === 'memo' ? '낱장 메모가' : this.tab === 'book' ? '책이' : '적어 둔 것이'
            el.innerHTML = `
                <div class="empty-state">
                    <i class="far fa-edit"></i>
                    <p>아직 ${what} 없어요.</p>
                    <div class="empty-btns">
                        ${this.tab !== 'memo' ? `<button type="button" class="btn primary" data-action="new-book"><i class="${ICONS.book}"></i> 책 만들기</button>` : ''}
                        ${this.tab !== 'book' ? `<button type="button" class="btn ${this.tab === 'memo' ? 'primary' : 'ghost'}" data-action="new-memo"><i class="${ICONS.memo}"></i> 메모 쓰기</button>` : ''}
                    </div>
                </div>`
        }
    }

    favoriteMarkHtml(item) {
        return item.favorite ? `<i class="item-fav fas fa-star" aria-label="즐겨찾기"></i>` : ''
    }

    bookRowHtml(b) {
        const pages = this.pages(b.id)
        const status = statusOf(b)
        const closed = BOOK_STATUS[status].short
        return `
            <div class="item-row book" data-book-id="${b.id}" data-status="${status}" tabindex="0" role="button">
                <i class="item-icon book-cover ${ICONS.book}" style="background:${this.coverColor(b)}"></i>
                <div class="item-body">
                    <div class="item-title">${esc(b.title)}${b.locked ? ` <i class="book-lock fas fa-lock" aria-label="잠근 책"></i>` : ''}</div>
                    <div class="item-sub clip">${closed ? `<i class="${BOOK_STATUS[status].icon}"></i> ${closed} · ` : ''}${pages.length ? `${pages.length}쪽 · ${esc(pages.map(p => p.title).join(', '))}` : '아직 빈 책이에요'}</div>
                </div>
                ${this.favoriteMarkHtml(b)}
                <i class="item-arrow fas fa-chevron-right"></i>
            </div>`
    }

    memoRowHtml(m) {
        const book = m.book_id ? this.book(m.book_id) : null
        const preview = m.content.trim().split('\n')[0]
        return `
            <div class="item-row memo" data-memo-id="${m.id}" tabindex="0" role="button">
                <i class="item-icon ${ICONS.memo}"></i>
                <div class="item-body">
                    <div class="item-title">${esc(m.title)}</div>
                    ${book ? `<div class="item-sub clip"><i class="${ICONS.book}"></i> ${esc(book.title)}</div>` : preview ? `<div class="item-sub clip">${esc(preview)}</div>` : ''}
                </div>
                ${this.favoriteMarkHtml(m)}
                <i class="item-arrow fas fa-chevron-right"></i>
            </div>`
    }

    // + 버튼: 무엇을 만들지 고르기
    async openNew() {
        const choice = await ui.openSheet({
            title: '새로 만들기',
            content: `
                <div class="sheet-options">
                    <button type="button" class="sheet-option" data-sheet-value="book"><i class="${ICONS.book}"></i> 책</button>
                    <button type="button" class="sheet-option" data-sheet-value="memo"><i class="${ICONS.memo}"></i> 메모</button>
                </div>`,
        })
        if (choice === 'memo') this.editMemo(null)
        if (choice === 'book') this.newBook()
    }

    // 팝업 위쪽의 별 버튼
    favoriteBtnHtml(item) {
        return `<button type="button" class="icon-btn fav-btn" data-action="favorite" aria-label="즐겨찾기" aria-pressed="${!!item.favorite}"><i class="${item.favorite ? 'fas' : 'far'} fa-star"></i></button>`
    }

    // 지금 화면에 보이는 것(메모를 보고 있으면 메모, 아니면 책)의 즐겨찾기
    async toggleFavorite() {
        const memo = this.open_memo_id ? this.memo(this.open_memo_id) : null
        const item = memo || this.book(this.open_book_id)
        if (!item) return
        item.favorite = item.favorite ? 0 : 1
        if (memo) await this.saveMemoRecord(memo, { touch: false })
        else await this.saveBookRecord(item, { touch: false })
        this.render()
        const btn = $('.popup-header .fav-btn')
        if (btn) btn.outerHTML = this.favoriteBtnHtml(item)
        ui.toast(item.favorite ? '즐겨찾기에 넣었어요' : '즐겨찾기에서 뺐어요')
    }

    /* ---------- 책 ---------- */
    async newBook() {
        const title = await ui.prompt('새 책의 제목을 적어 주세요.', { placeholder: '책 제목', ok: '만들기', maxlength: 60 })
        if (!title) return null
        const book = await this.insertBook(title)
        this.render()
        this.openBook(book.id)
        return book
    }

    openBook(id) {
        const b = this.book(id)
        if (!b) return
        this.open_book_id = id
        this.open_memo_id = null
        this.memo_base = null
        ui.openPopup({
            title: `<i class="${ICONS.book}"></i> ${esc(b.title)}`,
            actions: this.bookActionsHtml(b),
            content: `<div class="book-detail"></div>`,
        })
        this.renderBook()
    }

    // 책 화면 위쪽의 버튼들. 잠근 책은 삭제(쓰레기통) 버튼을 숨깁니다.
    bookActionsHtml(b) {
        return `
            ${this.favoriteBtnHtml(b)}
            <button type="button" class="icon-btn" data-action="book-info" aria-label="책 정보"><i class="fas fa-info-circle"></i></button>
            <button type="button" class="icon-btn" data-action="book-rename" aria-label="책 제목 고치기"><i class="fas fa-pen"></i></button>
            ${b.locked ? '' : `<button type="button" class="icon-btn" data-action="book-delete" aria-label="책 삭제"><i class="far fa-trash-alt"></i></button>`}`
    }

    // 열려 있는 책의 내용만 다시 그립니다. (스크롤 위치는 그대로)
    renderBook() {
        const b = this.book(this.open_book_id)
        const el = $('.book-detail')
        if (!b || !el) return
        $('.popup-header .title').innerHTML = `<i class="${ICONS.book}"></i> ${esc(b.title)}`
        const pages = this.pages(b.id)
        const mark = pages.findIndex(p => p.id === b.bookmark_id)
        const loose = this.memos.some(m => !m.book_id)
        const status = statusOf(b)
        el.dataset.status = status
        // 보여 주는 순서만 뒤집음 (쪽 번호와 앞·뒤쪽으로 넘겨 읽는 순서는 그대로). 모든 책에 같은 설정
        const desc = note_config.get('page_sort') === 'desc'
        const shown = pages.map((p, i) => [p, i])
        if (desc) shown.reverse()
        el.innerHTML = `
            ${status !== 'active' ? `
                <div class="status-banner">
                    <i class="${BOOK_STATUS[status].icon}"></i>
                    <span>${BOOK_STATUS[status].label}이에요 · ${esc(fullDate(b.status_at))}</span>
                </div>` : ''}
            <div class="book-head" style="--cover:${this.coverColor(b)}">
                <div class="book-spine"><i class="${ICONS.book}"></i></div>
                <div class="book-info">
                    <h2 class="book-title">${esc(b.title)}${b.locked ? ` <i class="book-lock fas fa-lock" aria-label="잠근 책"></i>` : ''}</h2>
                    <div class="book-meta">${pages.length ? `${pages.length}쪽` : '아직 빈 책이에요'} · ${esc(dateTimeLabel(b.created_at))}에 만듦</div>
                </div>
            </div>
            <div class="book-btns">
                <button type="button" class="btn primary" data-action="page-new"><i class="fas fa-plus"></i> 새 쪽 쓰기</button>
                ${loose ? `<button type="button" class="btn ghost" data-action="page-pick"><i class="${ICONS.memo}"></i> 낱장 넣기</button>` : ''}
                ${mark >= 0 ? `<button type="button" class="btn ghost" data-page-open="${pages[mark].id}"><i class="fas fa-bookmark"></i> 이어 읽기 (${mark + 1}쪽)</button>` : ''}
                ${pages.length > 1 ? `
                    <button type="button" class="text-btn page-sort" data-action="page-sort" aria-label="쪽 정렬 바꾸기">
                        <i class="fas ${desc ? 'fa-sort-numeric-down-alt' : 'fa-sort-numeric-down'}"></i> ${desc ? '내림차순' : '오름차순'}
                    </button>` : ''}
            </div>
            ${pages.length ? `
                <ol class="page-list">
                    ${shown.map(([p, i]) => `
                        <li class="page ${p.id === b.bookmark_id ? 'marked' : ''}">
                            <button type="button" class="page-item" data-page-open="${p.id}">
                                <span class="page-no">${i + 1}</span>
                                <span class="page-text">
                                    <span class="page-title">${esc(p.title)}${p.favorite ? ` <i class="item-fav fas fa-star"></i>` : ''}</span>
                                    ${p.content.trim() ? `<span class="page-preview">${esc(p.content.trim().split('\n')[0])}</span>` : ''}
                                </span>
                                ${p.id === b.bookmark_id ? `<i class="page-mark fas fa-bookmark" aria-label="마지막으로 읽은 쪽"></i>` : ''}
                            </button>
                            <button type="button" class="icon-btn" data-page-more="${p.id}" aria-label="더 보기"><i class="fas fa-ellipsis-h"></i></button>
                        </li>`).join('')}
                </ol>` : `<p class="book-empty">첫 쪽을 써 보세요. 낱장으로 써 둔 메모를 넣을 수도 있어요.</p>`}`
    }

    // 책 정보: 언제 만들었고 얼마나 써 왔는지. 아래에 내보내기와 완결·연재 중지·재개.
    async openBookInfo() {
        const b = this.book(this.open_book_id)
        if (!b) return
        const pages = this.pages(b.id)
        const status = statusOf(b)
        const end = status === 'active' ? Date.now() : b.status_at // 완결·중지했으면 기간도 거기서 멈춤
        const day = (time) => new Date(new Date(time).toDateString()).getTime()
        const total_days = Math.round((day(end) - day(b.created_at)) / 86400000) + 1
        const period = `${periodLabel(b.created_at, end)}${total_days > 31 ? ` (${total_days}일)` : ''}`
        const first = pages.length ? Math.min(...pages.map(p => p.created_at)) : 0
        const last = pages.length ? Math.max(...pages.map(p => p.updated_at)) : 0
        const chars = pages.reduce((sum, p) => sum + p.content.replace(/\s/g, '').length, 0)
        const rows = [
            ['far fa-calendar-plus', '처음 만든 날', fullDate(b.created_at)],
            ['fas fa-feather-alt', '첫 쪽을 쓴 날', first ? fullDate(first) : '아직 없어요'],
            ['fas fa-hourglass-half', status === 'active' ? '써 온 기간' : '쓴 기간', status === 'active' ? period : period.replace('째', '')],
            ['fas fa-pen', '마지막으로 쓴 날', last ? fullDate(last) : '아직 없어요'],
            ['fas fa-align-left', '분량', `${pages.length}쪽 · ${chars.toLocaleString('ko-KR')}자`],
        ]
        if (status !== 'active') rows.push([BOOK_STATUS[status].icon, status === 'done' ? '완결한 날' : '연재를 멈춘 날', fullDate(b.status_at)])
        const choice = await ui.openSheet({
            title: b.title,
            content: `
                <dl class="info-list">
                    ${rows.map(([icon, label, value]) => `<div><dt><i class="${icon}"></i> ${label}</dt><dd>${esc(value)}</dd></div>`).join('')}
                </dl>
                <div class="status-actions">
                    <button type="button" class="status-btn" data-sheet-value="export">
                        <b><i class="fas fa-file-export"></i> 책 내보내기</b>
                        <span>파일로 만들어 다른 파티노트 이용자에게 선물해요</span>
                    </button>
                    <button type="button" class="status-btn" data-sheet-value="${b.locked ? 'unlock' : 'lock'}">
                        <b><i class="fas ${b.locked ? 'fa-lock-open' : 'fa-lock'}"></i> ${b.locked ? '잠금 풀기' : '책 잠그기'}</b>
                        <span>${b.locked ? '삭제 버튼이 다시 보여요' : '실수로 지우지 않게 삭제 버튼을 숨겨요'}</span>
                    </button>
                    ${status === 'active' ? `
                        <button type="button" class="status-btn done" data-sheet-value="done">
                            <b><i class="fas fa-trophy"></i> 완결하기</b>
                            <span>이야기를 끝까지 다 썼을 때</span>
                        </button>
                        <button type="button" class="status-btn stopped" data-sheet-value="stopped">
                            <b><i class="fas fa-pause"></i> 연재 중지하기</b>
                            <span>사정이 있어 쓰기를 멈추거나 그만둘 때</span>
                        </button>` : `
                        <button type="button" class="status-btn" data-sheet-value="active">
                            <b><i class="fas fa-play"></i> 연재 재개하기</b>
                            <span>${status === 'done' ? '완결' : '연재 중지'}을 취소하고 쓰는 중으로 되돌려요</span>
                        </button>`}
                </div>`,
        })
        if (choice === 'export') return this.exportBook()
        if (choice === 'lock' || choice === 'unlock') return this.setBookLock(choice === 'lock')
        if (choice) this.setBookStatus(choice)
    }

    // 책 잠금: 잠그면 삭제 버튼이 숨겨짐 (글을 쓰고 고치는 것은 그대로)
    async setBookLock(locked) {
        const b = this.book(this.open_book_id)
        if (!b) return
        b.locked = locked ? 1 : 0
        await this.saveBookRecord(b, { touch: false })
        this.render()
        this.renderBook()
        const actions = $('.popup-header .actions')
        if (actions && $('.book-detail')) actions.innerHTML = this.bookActionsHtml(b)
        ui.toast(locked ? '책을 잠갔어요' : '잠금을 풀었어요')
    }

    // 완결(폭죽) / 연재 중지 / 재개
    async setBookStatus(status) {
        const b = this.book(this.open_book_id)
        if (!b || !BOOK_STATUS[status] || statusOf(b) === status) return
        b.status = status
        b.status_at = status === 'active' ? 0 : Date.now()
        await this.saveBookRecord(b)
        this.render()
        this.renderBook()
        $('.popup-content').scrollTop = 0 // 맨 위의 상태 띠가 보이게
        if (status === 'done') {
            this.burstConfetti()
            ui.toast('완결! 끝까지 쓰느라 수고했어요 🎉')
        } else {
            ui.toast(status === 'stopped' ? '연재를 멈췄어요' : '연재를 재개했어요')
        }
    }

    // 폭죽 조각을 화면 가운데에서 사방으로 터뜨립니다. (기기의 '동작 줄이기' 설정과 상관없이)
    burstConfetti() {
        const colors = ['#FFD54F', '#FF8FAB', '#80D8FF', '#B9F6CA', '#EA80FC', '#FFAB40', '#FFF59D', '#F06292']
        const layer = document.createElement('div')
        layer.className = 'confetti-layer'
        for (let i = 0; i < 72; i++) {
            const piece = document.createElement('i')
            const angle = Math.random() * Math.PI * 2
            const dist = 90 + Math.random() * 220
            piece.className = 'confetti'
            piece.style.setProperty('--x', `${Math.cos(angle) * dist}px`)
            piece.style.setProperty('--y', `${Math.sin(angle) * dist - 80}px`)
            piece.style.setProperty('--r', `${Math.random() * 720 - 360}deg`)
            piece.style.setProperty('--d', `${800 + Math.random() * 700}ms`)
            piece.style.background = colors[i % colors.length]
            if (i % 3 === 0) piece.style.borderRadius = '50%'
            layer.appendChild(piece)
        }
        document.body.appendChild(layer)
        setTimeout(() => layer.remove(), 1700)
    }

    // 책 한 권 내보내기: 다른 파티노트 이용자가 '가져오기'로 받을 수 있는 파일 (책 선물)
    exportBook() {
        const b = this.book(this.open_book_id)
        if (!b) return
        const pages = this.pages(b.id)
        if (!pages.length) return ui.toast('아직 내보낼 쪽이 없어요')
        const payload = this.backupPayload([b], pages)
        payload.kind = 'book' // 전체 백업이 아니라 책 한 권이라는 표시 (받는 쪽 안내 문구용)
        // 내 즐겨찾기·책갈피는 받는 사람에게 넘기지 않음
        payload.books.forEach(x => { x.favorite = 0; x.bookmark_uid = ''; x.locked = 0 }) // 잠금도 내 기기의 설정이라 넘기지 않음
        payload.memos.forEach(x => { x.favorite = 0 })
        // 파일 이름에 쓸 수 없는 글자는 뺌
        const name = b.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 60) || 'book'
        downloadText(`${name}.partynote.json`, JSON.stringify(payload, null, 2), 'application/json')
        ui.toast(`'${b.title}' ${pages.length}쪽을 내보냈어요`)
    }

    // 쪽 목록을 오름차순 ↔ 내림차순으로. 한 번 바꾸면 다른 책에도 똑같이 적용됩니다.
    togglePageSort() {
        note_config.set('page_sort', note_config.get('page_sort') === 'desc' ? 'asc' : 'desc')
        this.renderBook()
    }

    async renameBook() {
        const b = this.book(this.open_book_id)
        if (!b) return
        const title = await ui.prompt('책 제목을 고쳐 주세요.', { value: b.title, ok: '저장', maxlength: 60 })
        if (!title || title === b.title) return
        b.title = title
        await this.saveBookRecord(b)
        this.render()
        this.renderBook()
    }

    // 책 삭제: 안의 메모를 낱장으로 남길지, 같이 지울지 고릅니다.
    async deleteBook() {
        const b = this.book(this.open_book_id)
        if (!b) return
        if (b.locked) return ui.toast('잠근 책이에요. 책 정보에서 잠금을 풀어 주세요')
        const pages = this.pages(b.id)
        let with_pages = false
        if (pages.length) {
            const choice = await ui.choose(`'${b.title}' 책을 삭제할까요?\n안에 메모 ${pages.length}개가 있어요.`, [
                { value: 'keep', label: '책만 삭제 (메모는 낱장으로 남기기)', style: 'danger-ghost' },
                { value: 'all', label: '메모까지 모두 삭제', style: 'danger' },
            ], { stack: true })
            if (!choice) return
            with_pages = choice === 'all'
        } else if (!(await ui.confirm(`'${b.title}' 책을 삭제할까요?`, { ok: '삭제', danger: true }))) {
            return
        }
        for (const p of pages) {
            if (with_pages) {
                await idb.doDelete('memo', p.id)
            } else {
                p.book_id = 0
                p.order = 0
                await this.saveMemoRecord(p, { touch: false })
            }
        }
        if (with_pages) this.memos = this.memos.filter(m => m.book_id !== b.id)
        await idb.doDelete('book', b.id)
        this.books = this.books.filter(x => x.id !== b.id)
        this.open_book_id = null
        this.render()
        ui.closePopup()
        ui.toast('책을 삭제했어요')
    }

    // 쪽 한 줄의 … 버튼: 순서 옮기기 / 책에서 빼기 / 삭제
    async openPageMenu(memo_id) {
        const m = this.memo(memo_id)
        const b = m ? this.book(m.book_id) : null
        if (!b) return
        const pages = this.pages(b.id)
        const index = pages.findIndex(p => p.id === m.id)
        const choice = await ui.openSheet({
            title: m.title,
            content: `
                <div class="sheet-options">
                    ${index > 0 ? `<button type="button" class="sheet-option" data-sheet-value="up"><i class="fas fa-arrow-up"></i> 앞쪽으로</button>` : ''}
                    ${index < pages.length - 1 ? `<button type="button" class="sheet-option" data-sheet-value="down"><i class="fas fa-arrow-down"></i> 뒤쪽으로</button>` : ''}
                    <button type="button" class="sheet-option" data-sheet-value="out"><i class="fas fa-sign-out-alt"></i> 책에서 빼기 (낱장으로)</button>
                    <button type="button" class="sheet-option danger" data-sheet-value="delete"><i class="far fa-trash-alt"></i> 삭제</button>
                </div>`,
        })
        if (choice === 'up' || choice === 'down') {
            const other = pages[index + (choice === 'up' ? -1 : 1)]
            // 순서를 1부터 다시 매긴 뒤 둘을 맞바꿈 (옛 기록의 순서 값이 겹쳐 있어도 안전)
            pages.forEach((p, i) => p.order = i + 1)
            ;[m.order, other.order] = [other.order, m.order]
            for (const p of pages) await this.saveMemoRecord(p, { touch: false })
            await this.saveBookRecord(b)
        } else if (choice === 'out') {
            await this.takeOutOfBook(m)
        } else if (choice === 'delete') {
            if (!(await ui.confirm(`'${m.title}' 메모를 삭제할까요?\n되돌릴 수 없어요.`, { ok: '삭제', danger: true }))) return
            await this.removeMemo(m)
        } else {
            return
        }
        this.render()
        this.renderBook()
    }

    // 낱장 메모 하나를 골라 이 책의 맨 뒤에 넣기
    async pickLooseMemo() {
        const b = this.book(this.open_book_id)
        if (!b) return
        const loose = this.memos.filter(m => !m.book_id).sort((x, y) => y.updated_at - x.updated_at)
        const choice = await ui.openSheet({
            title: '넣을 메모 고르기',
            content: `
                <div class="sheet-options">
                    ${loose.map(m => `<button type="button" class="sheet-option" data-sheet-value="${m.id}"><i class="${ICONS.memo}"></i> <span class="clip">${esc(m.title)}</span></button>`).join('')}
                </div>`,
        })
        const m = this.memo(Number(choice))
        if (!m) return
        await this.putIntoBook(m, b)
        this.render()
        this.renderBook()
        ui.toast('책에 넣었어요')
    }

    async putIntoBook(memo, book) {
        memo.order = this.nextOrder(book.id)
        memo.book_id = book.id
        await this.saveMemoRecord(memo, { touch: false })
        await this.saveBookRecord(book)
    }

    async takeOutOfBook(memo) {
        const book = this.book(memo.book_id)
        memo.book_id = 0
        memo.order = 0
        await this.saveMemoRecord(memo, { touch: false })
        if (book) {
            if (book.bookmark_id === memo.id) book.bookmark_id = 0
            await this.saveBookRecord(book)
        }
    }

    async removeMemo(memo) {
        const book = memo.book_id ? this.book(memo.book_id) : null
        await idb.doDelete('memo', memo.id)
        this.memos = this.memos.filter(m => m.id !== memo.id)
        if (book) {
            if (book.bookmark_id === memo.id) book.bookmark_id = 0
            await this.saveBookRecord(book)
        }
    }

    /* ---------- 메모 ---------- */
    // 책 속의 쪽이면 위에 책으로 돌아가는 줄, 아래에 앞·뒤 쪽 버튼이 붙습니다.
    async openMemo(id) {
        const m = this.memo(id)
        if (!m) return
        this.open_memo_id = id
        this.memo_base = null
        const b = m.book_id ? this.book(m.book_id) : null
        this.open_book_id = b ? b.id : null
        const pages = b ? this.pages(b.id) : []
        const index = pages.findIndex(p => p.id === m.id)
        ui.openPopup({
            title: `<i class="${ICONS.memo}"></i> ${esc(m.title)}`,
            actions: `
                ${this.favoriteBtnHtml(m)}
                <button type="button" class="icon-btn" data-action="memo-edit" aria-label="메모 고치기"><i class="fas fa-pen"></i></button>
                <button type="button" class="icon-btn" data-action="memo-more" aria-label="더 보기"><i class="fas fa-ellipsis-h"></i></button>`,
            content: `
                <div class="memo-view">
                    ${b ? `
                        <button type="button" class="book-crumb" data-action="back-to-book">
                            <i class="fas fa-chevron-left"></i> <i class="${ICONS.book}"></i> <span class="clip">${esc(b.title)}</span>
                            <span class="crumb-no">${index + 1} / ${pages.length}쪽</span>
                        </button>` : ''}
                    <h2 class="memo-title">${esc(m.title)}</h2>
                    ${m.content.trim() ? `<div class="memo-content">${linkify(m.content)}</div>` : `<p class="book-empty">내용이 없어요</p>`}
                    <div class="memo-date">${esc(dateTimeLabel(m.updated_at))} 수정</div>
                    ${b ? `
                        <div class="page-nav">
                            <button type="button" class="btn ghost" ${index > 0 ? `data-page-open="${pages[index - 1].id}"` : 'disabled'}><i class="fas fa-chevron-left"></i> 앞쪽</button>
                            <button type="button" class="btn ghost" ${index < pages.length - 1 ? `data-page-open="${pages[index + 1].id}"` : 'disabled'}>뒤쪽 <i class="fas fa-chevron-right"></i></button>
                        </div>` : ''}
                </div>`,
        })
        // 책갈피: 마지막으로 읽은 쪽 (고친 시각은 건드리지 않음)
        if (b && b.bookmark_id !== m.id) {
            b.bookmark_id = m.id
            await this.saveBookRecord(b, { touch: false })
        }
    }

    // 메모의 … 버튼: 책에 넣기(옮기기) / 책에서 빼기 / 삭제
    async openMemoMenu() {
        const m = this.memo(this.open_memo_id)
        if (!m) return
        const choice = await ui.openSheet({
            title: m.title,
            content: `
                <div class="sheet-options">
                    <button type="button" class="sheet-option" data-sheet-value="move"><i class="${ICONS.book}"></i> ${m.book_id ? '다른 책으로 옮기기' : '책에 넣기'}</button>
                    ${m.book_id ? `<button type="button" class="sheet-option" data-sheet-value="out"><i class="fas fa-sign-out-alt"></i> 책에서 빼기 (낱장으로)</button>` : ''}
                    <button type="button" class="sheet-option danger" data-sheet-value="delete"><i class="far fa-trash-alt"></i> 삭제</button>
                </div>`,
        })
        if (choice === 'move') return this.moveMemoToBook(m)
        if (choice === 'out') {
            await this.takeOutOfBook(m)
            this.render()
            ui.toast('책에서 뺐어요')
            return this.openMemo(m.id)
        }
        if (choice === 'delete') {
            if (!(await ui.confirm(`'${m.title}' 메모를 삭제할까요?\n되돌릴 수 없어요.`, { ok: '삭제', danger: true }))) return
            const book_id = m.book_id
            await this.removeMemo(m)
            this.open_memo_id = null
            this.render()
            ui.toast('메모를 삭제했어요')
            // 책 속의 쪽이었으면 책으로, 낱장이었으면 닫기
            if (book_id && this.book(book_id)) return this.openBook(book_id)
            ui.closePopup()
        }
    }

    // 넣을 책 고르기 (새 책 만들기 포함)
    async moveMemoToBook(m) {
        const others = this.books.filter(b => b.id !== m.book_id).sort((x, y) => y.updated_at - x.updated_at)
        const choice = await ui.openSheet({
            title: '어느 책에 넣을까요?',
            content: `
                <div class="sheet-options">
                    ${others.map(b => `<button type="button" class="sheet-option" data-sheet-value="${b.id}"><i class="${ICONS.book}"></i> <span class="clip">${esc(b.title)}</span></button>`).join('')}
                    <button type="button" class="sheet-option" data-sheet-value="new"><i class="fas fa-plus"></i> 새 책 만들기</button>
                </div>`,
        })
        if (!choice) return
        let book = this.book(Number(choice))
        if (choice === 'new') {
            const title = await ui.prompt('새 책의 제목을 적어 주세요.', { placeholder: '책 제목', ok: '만들기', maxlength: 60 })
            if (!title) return
            book = await this.insertBook(title)
        }
        if (!book) return
        const from = m.book_id ? this.book(m.book_id) : null
        if (from?.bookmark_id === m.id) {
            from.bookmark_id = 0
            await this.saveBookRecord(from)
        }
        await this.putIntoBook(m, book)
        this.render()
        ui.toast(`'${book.title}'에 넣었어요`)
        this.openMemo(m.id)
    }

    // id가 없으면 새 메모. book_id를 주면 그 책의 새 쪽으로 저장됩니다.
    editMemo(id, book_id = 0) {
        const m = id ? this.memo(id) : null
        if (id && !m) return
        this.open_memo_id = id
        this.edit_book_id = m ? m.book_id : book_id
        const b = this.edit_book_id ? this.book(this.edit_book_id) : null
        this.memo_base = { title: m?.title || '', content: m?.content || '' }
        this.draft_mine = false
        this.draft_kept = null
        this.draft_saved = null
        ui.openPopup({
            title: m ? '메모 고치기' : b ? '새 쪽 쓰기' : '메모 쓰기',
            // 임시 저장 상태: 글이 길어져도 늘 보이도록 위쪽 고정 줄에 둠
            actions: `<span class="draft-status" aria-live="polite"></span>`,
            content: `
                <form class="memo-editor" novalidate>
                    <div class="editor-top">
                        ${b ? `<div class="editor-book"><i class="${ICONS.book}"></i> ${esc(b.title)}</div>` : ''}
                        <span class="draft-load-zone"></span>
                    </div>
                    <input type="text" class="memo-title-input" placeholder="제목 (비워 두면 '${esc(this.defaultTitle(m, this.edit_book_id))}')" maxlength="100" autocomplete="off" value="${esc(this.memo_base.title)}">
                    <textarea class="memo-content-input" rows="10" placeholder="짧은 이야기를 적어 보세요">${esc(this.memo_base.content)}</textarea>
                    <div class="memo-count" aria-live="off"></div>
                    <div class="editor-btns">
                        <button type="button" class="btn ghost" data-action="memo-cancel">취소</button>
                        <button type="submit" class="btn primary"><i class="fas fa-check"></i> 저장</button>
                    </div>
                </form>`,
            // 쓰던 내용이 있으면 닫기 전에 묻습니다.
            before_close: () => this.confirmDiscard(),
        })
        autoGrow($('.memo-content-input'))
        $(m ? '.memo-content-input' : '.memo-title-input').focus()
        this.renderDraftLink()
        this.renderMemoCount()
        // 쓰는 동안 8초에 한 번 임시 저장 (편집 화면을 떠나면 writeDraft가 알아서 멈춤)
        clearInterval(this.draft_timer)
        this.draft_timer = setInterval(() => this.writeDraft(), DRAFT_INTERVAL)
        // 자정을 넘기면 '오늘'이 '어제'로 바뀌어야 하므로 가끔 다시 적음
        clearInterval(this.draft_tick)
        this.draft_tick = setInterval(() => this.renderDraftStatus(), 30000)
    }

    // 내용 칸 아래의 글자 수와 대략의 크기. (글자 수는 책 정보의 분량처럼 공백을 뺀 수, 크기는 제목+내용을 저장할 때의 바이트 수)
    renderMemoCount() {
        const el = $('.memo-count'), title = $('.memo-title-input'), content = $('.memo-content-input')
        if (!el || !title || !content) return
        const chars = content.value.replace(/\s/g, '').length
        const with_space = content.value.length
        const kb = new TextEncoder().encode(title.value + content.value).length / 1024
        // 대략의 크기: 0.5KB, 15KB, 1.2MB 처럼
        const size = kb < 0.05 ? '0KB' : kb < 10 ? `${kb.toFixed(1)}KB` : kb < 1024 ? `${Math.round(kb)}KB` : `${(kb / 1024).toFixed(1)}MB`
        el.textContent = `${chars.toLocaleString('ko-KR')}자 (공백 포함 ${with_space.toLocaleString('ko-KR')}자) · 약 ${size}`
    }

    // 위쪽 고정 줄의 임시 저장 상태
    renderDraftStatus(message = null) {
        const status = $('.draft-status')
        if (!status) return clearInterval(this.draft_tick) // 편집 화면이 아님: 정지
        if (message !== null) this.draft_message = message
        // 저장한 적이 있으면 그 시각, 없으면 안내 문구(불러왔어요 등)나 빈칸
        status.textContent = this.draft_saved ? `${draftTimeLabel(this.draft_saved.at)}에 임시 저장됨` : (this.draft_message || '')
    }

    // 편집 화면을 떠나도 되는지: 바뀐 게 없으면 바로, 있으면 물어봄.
    // 버리기로 해도 임시 저장소에는 남깁니다. (그냥 화면을 벗어나려고 닫았을 수도 있어서. 저장 버튼을 눌렀을 때만 비움)
    async confirmDiscard() {
        if (this.memoChanged() && !(await ui.confirm('쓰던 내용을 버릴까요?\n임시 저장소에는 남아 있어서 다시 불러올 수 있어요.', { ok: '버리기', cancel: '계속 쓰기', danger: true }))) return false
        this.writeDraft() // 마지막 8초 사이에 쓴 것까지 임시 저장소에
        return true
    }

    /* ---------- 임시 저장 ---------- */
    // 기기의 localStorage에 한 건만 둡니다. (앱이 갑자기 닫힐 때도 바로 써지도록 IndexedDB 대신 이쪽)
    readDraft() {
        try {
            const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
            return d && typeof d.title === 'string' && typeof d.content === 'string' ? d : null
        } catch (e) {
            return null
        }
    }

    clearDraft() {
        this.draft_kept = null
        try { localStorage.removeItem(DRAFT_KEY) } catch (e) { }
        this.renderDraftLink()
    }

    // 편집 화면 오른쪽 위의 '임시 저장한 글 불러오기' 링크.
    // 지금 화면이 만든 임시 저장이 아닐 때만(= 예전에 쓰다 만 글이 남아 있을 때만) 보입니다.
    renderDraftLink() {
        const zone = $('.draft-load-zone')
        if (!zone) return
        const d = this.draft_kept || (this.draft_mine ? null : this.readDraft())
        zone.innerHTML = d
            ? `<button type="button" class="text-btn draft-load" data-action="draft-load"><i class="fas fa-history"></i> 임시 저장한 글 불러오기 (${esc(draftTimeLabel(d.saved_at))})</button>`
            : ''
    }

    // 임시 저장소의 글을 지금 편집 화면에 불러오기
    async loadDraft() {
        const d = this.draft_kept || this.readDraft()
        const title = $('.memo-title-input'), content = $('.memo-content-input')
        if (!d || !title || !content) return this.renderDraftLink()
        if (this.memoChanged() && !(await ui.confirm('지금 쓰고 있는 내용이 임시 저장한 글로 바뀌어요.\n불러올까요?', { ok: '불러오기' }))) return
        this.fillFromDraft(d)
    }

    fillFromDraft(d) {
        const content = $('.memo-content-input')
        $('.memo-title-input').value = d.title
        content.value = d.content
        autoGrow(content)
        content.focus()
        this.renderMemoCount()
        this.draft_mine = true // 이제 이 화면이 임시 저장의 주인 (이어서 8초마다 덮어씀)
        this.draft_kept = null
        this.renderDraftLink()
        this.draft_saved = null
        this.renderDraftStatus('임시 저장한 글을 불러왔어요')
    }

    // 지금 편집 화면의 내용을 임시 저장. 편집 중이 아니면 아무것도 안 함.
    writeDraft() {
        const title = $('.memo-title-input'), content = $('.memo-content-input')
        if (!this.memo_base || !title || !content) return clearInterval(this.draft_timer) // 편집 화면이 아님: 타이머 정지
        if (!this.memoChanged()) {
            if (this.draft_mine) this.clearDraft() // 원래대로 되돌렸으면 남길 것이 없음
            this.draft_saved = null
            return this.renderDraftStatus('')
        }
        // 마지막 임시 저장 뒤로 바뀐 게 없으면 다시 쓰지 않음 → 표시된 시각이 마지막으로 바뀐 내용을 저장한 때를 가리킴
        if (this.draft_saved && this.draft_saved.title === title.value && this.draft_saved.content === content.value) return
        const m = this.open_memo_id ? this.memo(this.open_memo_id) : null
        // 임시 저장소는 하나뿐이라 예전에 쓰다 만 글은 여기서 덮어써짐. 이 화면에 있는 동안은 불러올 수 있게 들고 있음
        if (!this.draft_mine && !this.draft_kept) this.draft_kept = this.readDraft()
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                memo_uid: m ? m.uid : '',               // 고치던 메모 ('' = 새 글)
                book_uid: this.book(this.edit_book_id)?.uid || '', // 새 쪽을 쓰던 책
                title: title.value,
                content: content.value,
                saved_at: Date.now(),
            }))
            this.draft_mine = true
            this.draft_saved = { at: Date.now(), title: title.value, content: content.value }
            this.renderDraftLink()
            this.renderDraftStatus()
        } catch (e) {
            this.draft_saved = null
            this.renderDraftStatus('임시 저장을 못 했어요')
        }
    }

    memoChanged() {
        const title = $('.memo-title-input'), content = $('.memo-content-input')
        if (!this.memo_base || !title || !content) return false
        return title.value !== this.memo_base.title || content.value !== this.memo_base.content
    }

    async saveMemo() {
        const content = $('.memo-content-input').value
        let m = this.open_memo_id ? this.memo(this.open_memo_id) : null
        let title = $('.memo-title-input').value.trim()
        if (!title && !content.trim()) {
            ui.toast('제목이나 내용을 적어 주세요')
            return $('.memo-title-input').focus()
        }
        // 제목을 비우면 자동으로 붙임: 낱장은 '무제1', 책의 쪽은 '1편'
        if (!title) title = this.defaultTitle(m, this.edit_book_id)
        if (m) {
            m.title = title
            m.content = content
            await this.saveMemoRecord(m)
        } else {
            const b = this.edit_book_id ? this.book(this.edit_book_id) : null
            m = await this.insertMemo({ title, content, book_id: b ? b.id : 0, order: b ? this.nextOrder(b.id) : 0 })
        }
        const book = m.book_id ? this.book(m.book_id) : null
        if (book) await this.saveBookRecord(book) // 책도 방금 고친 것으로
        this.clearDraft()
        this.render()
        ui.toast('저장했어요')
        this.openMemo(m.id)
    }

    // 제목을 비웠을 때 붙일 이름.
    // - 책의 쪽: 그 쪽의 번호로 '3편' (새 쪽이면 맨 뒤 번호)
    // - 낱장 메모: '무제1', '무제2' … (지금 있는 낱장의 무제 번호 중 가장 큰 것 다음)
    defaultTitle(memo, book_id) {
        const b = book_id ? this.book(book_id) : null
        if (b) {
            const pages = this.pages(b.id)
            const index = memo ? pages.findIndex(p => p.id === memo.id) : -1
            return `${index >= 0 ? index + 1 : pages.length + 1}편`
        }
        const used = this.memos.filter(x => !x.book_id && x !== memo).map(x => /^무제(\d+)$/.exec(x.title)).filter(Boolean).map(r => Number(r[1]))
        return `무제${Math.max(0, ...used) + 1}`
    }

    // 편집 취소: 고치던 메모면 조회 화면으로, 책에 쓰던 새 쪽이면 책으로, 새 낱장이면 닫기
    async cancelMemoEdit() {
        const back = this.open_memo_id ? () => this.openMemo(this.open_memo_id)
            : this.edit_book_id && this.book(this.edit_book_id) ? () => this.openBook(this.edit_book_id)
                : null
        if (!back) return ui.closePopup() // 닫기 전에 before_close가 물어봄
        if (!(await this.confirmDiscard())) return
        back()
    }

    /* ---------- 백업 ---------- */
    // 백업 파일에 담을 내용. 기기마다 번호(id)가 달라서, 서로를 가리키는 값은 고유값(uid)으로 적어 둡니다.
    backupPayload(books, memos) {
        const book_uid = new Map(this.books.map(b => [b.id, b.uid]))
        const memo_uid = new Map(this.memos.map(m => [m.id, m.uid]))
        return {
            app: APP_CONFIG.app_alias,
            version: APP_CONFIG.app_version,
            exported_at: new Date().toISOString(),
            books: books.map(({ id, bookmark_id, ...b }) => ({ ...b, bookmark_uid: memo_uid.get(bookmark_id) || '' })),
            memos: memos.map(({ id, book_id, ...m }) => ({ ...m, book_uid: book_uid.get(book_id) || '' })),
        }
    }

    exportBackup() {
        downloadText(`partynote-${dateStamp()}.json`, JSON.stringify(this.backupPayload(this.books, this.memos), null, 2), 'application/json')
        ui.toast(`메모 ${this.memos.length}개, 책 ${this.books.length}권을 내보냈어요`)
    }

    // 백업 파일의 기록을 이 앱의 모양으로 다듬습니다. 못 쓰는 기록은 null.
    cleanImported(raw, kind) {
        if (!raw || typeof raw !== 'object') return null
        const text = (v, max) => (typeof v === 'string' ? v : '').slice(0, max)
        const time = (v) => (Number.isFinite(v) && v > 0 ? v : 0)
        const uid = (v) => (typeof v === 'string' && /^[a-z0-9]{6,40}$/.test(v) ? v : '')
        const title = text(raw.title, 100).trim()
        if (!title) return null
        const base = { uid: uid(raw.uid) || newUid(), title, favorite: raw.favorite ? 1 : 0, created_at: time(raw.created_at), updated_at: time(raw.updated_at) }
        if (kind === 'book') {
            const status = ['done', 'stopped'].includes(raw.status) ? raw.status : 'active'
            return { ...idb.newRecord('book'), ...base, status, status_at: status === 'active' ? 0 : time(raw.status_at), locked: raw.locked ? 1 : 0, bookmark_uid: uid(raw.bookmark_uid) }
        }
        return { ...idb.newRecord('memo'), ...base, content: text(raw.content, 200000), order: Number.isFinite(raw.order) ? raw.order : 0, book_uid: uid(raw.book_uid) }
    }

    // 가져오기는 지금 있는 것에 합칩니다. 같은 기록(uid)이면 더 최근에 고친 쪽을 남깁니다.
    async importBackup(file) {
        let payload
        try {
            payload = JSON.parse(await file.text())
        } catch (e) {
            return ui.toast('백업 파일을 읽을 수 없어요')
        }
        if (payload?.app !== APP_CONFIG.app_alias || !Array.isArray(payload.memos) || !Array.isArray(payload.books)) {
            return ui.toast('파티노트 백업 파일이 아니에요')
        }
        const books = payload.books.map(raw => this.cleanImported(raw, 'book')).filter(Boolean)
        const memos = payload.memos.map(raw => this.cleanImported(raw, 'memo')).filter(Boolean)
        if (!books.length && !memos.length) return ui.toast('가져올 내용이 없어요')
        // 책 한 권짜리 파일(책 내보내기로 만든 것)이면 선물 받는 안내로
        const gift = payload.kind === 'book' && books.length === 1
        const ok = gift
            ? await ui.confirm(`'${books[0].title}' 책(${memos.length}쪽)을 받을까요?`, { ok: '받기' })
            : await ui.confirm(`백업의 메모 ${memos.length}개, 책 ${books.length}권을 지금 목록에 합칠까요?\n같은 기록은 더 최근에 고친 쪽을 남겨요.`, { ok: '합치기' })
        if (!ok) return

        let added = 0, updated = 0
        // 1) 책 먼저 (메모가 가리킬 번호가 있어야 함)
        const bookmarks = [] // [책, 책갈피 메모의 uid]
        for (const { bookmark_uid, ...book } of books) {
            let mine = this.books.find(b => b.uid === book.uid)
            if (!mine) {
                book.id = await idb.doInsert('book', book)
                this.books.push(book)
                mine = book
                added++
                bookmarks.push([mine, bookmark_uid])
            } else if (book.updated_at > mine.updated_at) {
                Object.assign(mine, book, { id: mine.id, bookmark_id: mine.bookmark_id })
                await idb.doUpdate('book', mine.id, mine)
                updated++
                bookmarks.push([mine, bookmark_uid])
            }
        }
        // 2) 메모
        for (const { book_uid, ...memo } of memos) {
            memo.book_id = this.books.find(b => b.uid === book_uid)?.id || 0
            const mine = this.memos.find(m => m.uid === memo.uid)
            if (!mine) {
                memo.id = await idb.doInsert('memo', memo)
                this.memos.push(memo)
                added++
            } else if (memo.updated_at > mine.updated_at) {
                Object.assign(mine, memo, { id: mine.id })
                await idb.doUpdate('memo', mine.id, mine)
                updated++
            }
        }
        // 3) 책갈피 다시 잇기
        for (const [book, bookmark_uid] of bookmarks) {
            const page = this.memos.find(m => m.uid === bookmark_uid && m.book_id === book.id)
            book.bookmark_id = page ? page.id : 0
            await idb.doUpdate('book', book.id, book)
        }
        this.render()
        if (gift) {
            // 받은 책을 바로 펼쳐 보여 줌
            const received = this.books.find(b => b.uid === books[0].uid)
            ui.toast(added || updated ? `'${books[0].title}' 책을 받았어요` : '이미 받은 책이에요')
            ui.setDrawer(false)
            if (received) this.openBook(received.id)
            return
        }
        ui.toast(added || updated ? `${added}개 추가, ${updated}개 갱신했어요` : '이미 모두 들어 있어요')
    }

    async deleteAll() {
        if (!this.memos.length && !this.books.length) return ui.toast('지울 것이 없어요')
        const ok = await ui.confirmTyped(`메모 ${this.memos.length}개와 책 ${this.books.length}권을 모두 지워요.\n되돌릴 수 없어요.`, '정말로 전체 삭제')
        if (!ok) return
        await idb.doTruncate('memo')
        await idb.doTruncate('book')
        this.memos = []
        this.books = []
        this.render()
        ui.setDrawer(false)
        ui.toast('모두 삭제했어요')
    }
}

const party_note = new PartyNote()
