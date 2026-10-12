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

// 기기에 남기는 화면 설정 (테마, 마지막으로 보던 탭)
const note_config = (() => {
    const KEY = 'ptnt_config'
    const defaults = { app_theme: 'partynote', tab: 'all' }
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

class PartyNote {
    memos = []          // 저장된 메모 전부 (낱장 + 책 속의 쪽)
    books = []
    tab = 'all'         // all | memo | book | favorite
    q = ''              // 검색어
    open_memo_id = null // 지금 팝업에 열려 있는 메모
    open_book_id = null // 지금 팝업에 열려 있는 책 (책 속의 메모를 읽는 중에도 유지)
    memo_base = null    // 메모 편집을 시작할 때의 값 (바뀌었는지 비교용)
    edit_book_id = 0    // 새 메모를 저장할 때 넣을 책 (0 = 낱장)

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
            { value: 'memo', label: '메모', icon: ICONS.memo },
            { value: 'book', label: '책', icon: ICONS.book },
            { value: 'favorite', label: '', aria: '즐겨찾기', icon: 'fas fa-star' },
        ]
        $('.type-tabs').innerHTML = tabs.map(t => `
            <button type="button" role="tab" data-tab="${t.value}" aria-selected="${this.tab === t.value}"${t.aria ? ` aria-label="${t.aria}"` : ''}>
                <i class="${t.icon}"></i> ${t.label} <span class="count">${in_tab(t.value).length}</span>
            </button>`).join('')

        // 즐겨찾기가 맨 위, 그 안에서는 최근 고친 순
        const list = in_tab(this.tab).sort((a, b) => (b.item.favorite ? 1 : 0) - (a.item.favorite ? 1 : 0) || b.item.updated_at - a.item.updated_at)
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
                        ${this.tab !== 'book' ? `<button type="button" class="btn primary" data-action="new-memo"><i class="${ICONS.memo}"></i> 메모 쓰기</button>` : ''}
                        ${this.tab !== 'memo' ? `<button type="button" class="btn ${this.tab === 'book' ? 'primary' : 'ghost'}" data-action="new-book"><i class="${ICONS.book}"></i> 책 만들기</button>` : ''}
                    </div>
                </div>`
        }
    }

    favoriteMarkHtml(item) {
        return item.favorite ? `<i class="item-fav fas fa-star" aria-label="즐겨찾기"></i>` : ''
    }

    bookRowHtml(b) {
        const pages = this.pages(b.id)
        return `
            <div class="item-row book" data-book-id="${b.id}" tabindex="0" role="button">
                <i class="item-icon book-cover ${ICONS.book}" style="background:${this.coverColor(b)}"></i>
                <div class="item-body">
                    <div class="item-title">${esc(b.title)}</div>
                    <div class="item-sub clip">${pages.length ? `${pages.length}쪽 · ${esc(pages.map(p => p.title).join(', '))}` : '아직 빈 책이에요'}</div>
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
                    <button type="button" class="sheet-option" data-sheet-value="memo"><i class="${ICONS.memo}"></i> 메모</button>
                    <button type="button" class="sheet-option" data-sheet-value="book"><i class="${ICONS.book}"></i> 책</button>
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
            actions: `
                ${this.favoriteBtnHtml(b)}
                <button type="button" class="icon-btn" data-action="book-rename" aria-label="책 제목 고치기"><i class="fas fa-pen"></i></button>
                <button type="button" class="icon-btn" data-action="book-delete" aria-label="책 삭제"><i class="far fa-trash-alt"></i></button>`,
            content: `<div class="book-detail"></div>`,
        })
        this.renderBook()
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
        el.innerHTML = `
            <div class="book-head" style="--cover:${this.coverColor(b)}">
                <div class="book-spine"><i class="${ICONS.book}"></i></div>
                <div class="book-info">
                    <h2 class="book-title">${esc(b.title)}</h2>
                    <div class="book-meta">${pages.length ? `${pages.length}쪽` : '아직 빈 책이에요'} · ${esc(dateTimeLabel(b.created_at))}에 만듦</div>
                </div>
            </div>
            <div class="book-btns">
                <button type="button" class="btn primary" data-action="page-new"><i class="fas fa-plus"></i> 새 쪽 쓰기</button>
                ${loose ? `<button type="button" class="btn ghost" data-action="page-pick"><i class="${ICONS.memo}"></i> 낱장 메모 넣기</button>` : ''}
                ${mark >= 0 ? `<button type="button" class="btn ghost" data-page-open="${pages[mark].id}"><i class="fas fa-bookmark"></i> 이어 읽기 (${mark + 1}쪽)</button>` : ''}
            </div>
            ${pages.length ? `
                <ol class="page-list">
                    ${pages.map((p, i) => `
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
        ui.openPopup({
            title: m ? '메모 고치기' : b ? '새 쪽 쓰기' : '메모 쓰기',
            content: `
                <form class="memo-editor" novalidate>
                    ${b ? `<div class="editor-book"><i class="${ICONS.book}"></i> ${esc(b.title)}</div>` : ''}
                    <input type="text" class="memo-title-input" placeholder="제목" maxlength="100" autocomplete="off" value="${esc(this.memo_base.title)}">
                    <textarea class="memo-content-input" rows="10" placeholder="짧은 이야기를 적어 보세요">${esc(this.memo_base.content)}</textarea>
                    <div class="editor-btns">
                        <button type="button" class="btn ghost" data-action="memo-cancel">취소</button>
                        <button type="submit" class="btn primary"><i class="fas fa-check"></i> 저장</button>
                    </div>
                </form>`,
            // 쓰던 내용이 있으면 닫기 전에 묻습니다.
            before_close: async () => !this.memoChanged() || ui.confirm('쓰던 내용을 버릴까요?', { ok: '버리기', cancel: '계속 쓰기', danger: true }),
        })
        autoGrow($('.memo-content-input'))
        $(m ? '.memo-content-input' : '.memo-title-input').focus()
    }

    memoChanged() {
        const title = $('.memo-title-input'), content = $('.memo-content-input')
        if (!this.memo_base || !title || !content) return false
        return title.value !== this.memo_base.title || content.value !== this.memo_base.content
    }

    async saveMemo() {
        const content = $('.memo-content-input').value
        // 제목을 비우면 내용의 첫 줄을 제목으로
        const title = $('.memo-title-input').value.trim() || content.trim().split('\n')[0].slice(0, 100)
        if (!title) {
            ui.toast('제목이나 내용을 적어 주세요')
            return $('.memo-title-input').focus()
        }
        let m = this.open_memo_id ? this.memo(this.open_memo_id) : null
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
        this.render()
        ui.toast('저장했어요')
        this.openMemo(m.id)
    }

    // 편집 취소: 고치던 메모면 조회 화면으로, 책에 쓰던 새 쪽이면 책으로, 새 낱장이면 닫기
    async cancelMemoEdit() {
        const back = this.open_memo_id ? () => this.openMemo(this.open_memo_id)
            : this.edit_book_id && this.book(this.edit_book_id) ? () => this.openBook(this.edit_book_id)
                : null
        if (!back) return ui.closePopup() // 닫기 전에 before_close가 물어봄
        if (this.memoChanged() && !(await ui.confirm('쓰던 내용을 버릴까요?', { ok: '버리기', cancel: '계속 쓰기', danger: true }))) return
        back()
    }

    /* ---------- 백업 ---------- */
    exportBackup() {
        const book_uid = new Map(this.books.map(b => [b.id, b.uid]))
        const memo_uid = new Map(this.memos.map(m => [m.id, m.uid]))
        const payload = {
            app: APP_CONFIG.app_alias,
            version: APP_CONFIG.app_version,
            exported_at: new Date().toISOString(),
            // 기기마다 번호(id)가 달라서, 서로를 가리키는 값은 고유값(uid)으로 적어 둡니다.
            books: this.books.map(({ id, bookmark_id, ...b }) => ({ ...b, bookmark_uid: memo_uid.get(bookmark_id) || '' })),
            memos: this.memos.map(({ id, book_id, ...m }) => ({ ...m, book_uid: book_uid.get(book_id) || '' })),
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `partynote-${dateStamp()}.json`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
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
        if (kind === 'book') return { ...idb.newRecord('book'), ...base, bookmark_uid: uid(raw.bookmark_uid) }
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
        const ok = await ui.confirm(`백업의 메모 ${memos.length}개, 책 ${books.length}권을 지금 목록에 합칠까요?\n같은 기록은 더 최근에 고친 쪽을 남겨요.`, { ok: '합치기' })
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
