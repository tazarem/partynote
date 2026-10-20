class PartyNoteInit {
    activeServiceWorker() {
        if (!('serviceWorker' in navigator)) return
        // 새 버전의 서비스워커가 이 화면을 넘겨받으면 한 번 새로고침해서 새 파일을 보여 줌.
        // (처음 설치될 때는 넘겨받을 이전 버전이 없으므로 새로고침하지 않음)
        const had_controller = !!navigator.serviceWorker.controller
        let reloaded = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!had_controller || reloaded) return
            reloaded = true
            // 뭔가 쓰는 중이면 방해하지 않음
            if (ui.popup_open || ui.sheet || document.querySelector('.dialog-overlay')) {
                return ui.toast('새 버전이 준비됐어요. 앱을 다시 열면 적용돼요')
            }
            location.reload()
        })
        window.addEventListener('load', () => {
            // updateViaCache: 'none' = 서비스워커 파일 자체도 브라우저 보관함을 거치지 않고 확인
            navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })
                .then((reg) => {
                    console.log('Service worker registered', reg.scope)
                    // 설치한 앱은 껐다 켜도 '새로 열기'가 아닐 수 있어서, 화면으로 돌아올 때마다 새 버전을 확인
                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible') reg.update().catch(() => {})
                    })
                })
                .catch(err => console.log(err))
        })
    }

    bindTopBar() {
        $('.search-btn').addEventListener('click', () => {
            const banner = $('.search-banner')
            const opened = !banner.classList.toggle('collapse-y')
            $('.search-btn').classList.toggle('active', opened)
            // 검색창이 열려 있으면 종류 탭이 그 아래에 붙도록 높이를 알려 줌
            document.documentElement.style.setProperty('--search-h', opened ? `${banner.scrollHeight}px` : '0px')
            if (opened) $('#item-searcher').focus({ preventScroll: true })
        })
        let search_timer
        const search = (value) => {
            $('.search-deleter').classList.toggle('hide', !value)
            clearTimeout(search_timer)
            search_timer = setTimeout(() => {
                party_note.q = value
                party_note.render()
            }, 150)
        }
        $('#item-searcher').addEventListener('input', (e) => search(e.target.value))
        $('.search-deleter').addEventListener('click', () => {
            $('#item-searcher').value = ''
            search('')
            $('#item-searcher').focus()
        })
        $('.item-writer').addEventListener('click', () => party_note.openNew())
        $('.menu-btn').addEventListener('click', () => ui.toggleDrawer())
        $('.menu-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) ui.setDrawer(false)
        })
    }

    bindList() {
        $('.type-tabs').addEventListener('click', (e) => {
            const tab = e.target.closest('[data-tab]')
            if (tab) party_note.setTab(tab.dataset.tab)
        })

        const list = $('.item-list')
        const open = (e) => {
            const trashed = e.target.closest('[data-trash-id]')
            if (trashed) return party_note.openTrashItem(trashed.dataset.trashKind, Number(trashed.dataset.trashId))
            const book = e.target.closest('[data-book-id]')
            if (book) return party_note.openBook(Number(book.dataset.bookId))
            const memo = e.target.closest('[data-memo-id]')
            if (memo) party_note.openMemo(Number(memo.dataset.memoId))
        }
        list.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')
            if (action?.dataset.action === 'new-memo') return party_note.editMemo(null)
            if (action?.dataset.action === 'new-book') return party_note.newBook()
            open(e)
        })
        list.addEventListener('keydown', (e) => {
            if (e.target.closest('.item-row') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                open(e)
            }
        })
    }

    bindPopup() {
        $('.popup-overlay .close').addEventListener('click', () => ui.closePopup())
        $('.popup-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) ui.closePopup()
        })
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || $('.dialog-overlay')) return
            if (ui.sheet) return ui.closeSheet(null) // 선택창이 떠 있으면 그것부터
            if (ui.popup_open) ui.closePopup()
        })

        const popup = $('.popup')
        popup.addEventListener('click', async (e) => {
            // 메모 속 외부 링크: 이동 전에 한 번 묻습니다.
            const link = e.target.closest('a[data-ext-link]')
            if (link) {
                e.preventDefault()
                const url = link.getAttribute('href')
                const ok = await ui.confirm(`외부 링크로 이동할까요?\n${url}`, { ok: '예', cancel: '아니오' })
                if (ok) window.open(url, '_blank', 'noopener,noreferrer')
                return
            }

            const action = e.target.closest('[data-action]')
            if (action) {
                switch (action.dataset.action) {
                    case 'favorite': return party_note.toggleFavorite()
                    case 'book-info': return party_note.openBookInfo()
                    case 'book-rename': return party_note.renameBook()
                    case 'book-delete': return party_note.deleteBook()
                    case 'page-new': return party_note.nav('editMemo', [null, party_note.open_book_id])
                    case 'page-sort': return party_note.togglePageSort()
                    case 'page-pick': return party_note.pickLooseMemo()
                    case 'back-to-book': return party_note.backTo('openBook', party_note.open_book_id)
                    case 'memo-edit': return party_note.nav('editMemo', [party_note.open_memo_id])
                    case 'memo-copy': return party_note.copyMemoContent()
                    case 'memo-more': return party_note.openMemoMenu()
                    case 'draft-load': return party_note.loadDraft()
                    case 'memo-save': return party_note.saveMemo()
                    case 'memo-cancel': return party_note.cancelMemoEdit()
                }
            }

            // 책의 쪽
            const page = e.target.closest('[data-page-open]')
            // 책에서 쪽을 열면 한 화면 들어가고, 읽던 쪽에서 앞쪽/뒤쪽은 옆으로 이동
            if (page) return party_note.nav('openMemo', [Number(page.dataset.pageOpen)], party_note.screen?.kind === 'openMemo' ? 'replace' : 'push')
            const more = e.target.closest('[data-page-more]')
            if (more) return party_note.openPageMenu(Number(more.dataset.pageMore))
        })

        popup.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing) return // 한글 조합 중 Enter는 무시
            // 메모 제목 칸 Enter → 내용 칸으로 (폼이 제출되지 않게)
            if (e.target.matches('.memo-title-input')) {
                e.preventDefault()
                $('.memo-content-input').focus()
            }
        })

        // 메모 내용 칸은 쓰는 만큼 늘어나고 지우면 줄어듭니다.
        popup.addEventListener('input', (e) => {
            if (e.target.matches('.memo-content-input')) autoGrow(e.target)
            if (e.target.matches('.memo-title-input, .memo-content-input')) party_note.renderMemoCount()
        })
        // 임시 저장은 쓰는 동안 8초에 한 번(note.js). 앱이 닫히거나 뒤로 숨겨질 때는 기다리지 않고 바로 저장
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') party_note.writeDraft()
        })
        window.addEventListener('pagehide', () => party_note.writeDraft())
        // 화면 폭이 바뀌면(가로 회전 등) 줄바꿈이 달라지니 다시 맞춤
        window.addEventListener('resize', () => $$('.popup-content .memo-content-input').forEach(autoGrow))

        // 읽기 화면에서 스크롤 방향에 따라 위·아래 줄 숨기기
        $('.popup-content').addEventListener('scroll', () => party_note.onReaderScroll(), { passive: true })

        popup.addEventListener('submit', (e) => {
            e.preventDefault()
            if (e.target.matches('.memo-editor')) party_note.saveMemo()
        })
    }

    bindMenu() {
        $('.menu-screen').addEventListener('change', (e) => {
            if (e.target.name === 'empty_title') {
                note_config.set('empty_title', e.target.value)
                ui.toast(e.target.value === 'date' ? '제목을 비우면 날짜가 붙어요' : '제목을 비우면 1편, 무제1처럼 붙어요')
            }
            if (e.target.name === 'app_theme') {
                note_config.set('app_theme', e.target.value)
                party_note.applyTheme(e.target.value)
            }
            if (e.target.matches('#import-file') && e.target.files[0]) {
                party_note.importBackup(e.target.files[0])
                e.target.value = ''
            }
        })
        $('.export-btn').addEventListener('click', () => party_note.exportBackup())
        $('.import-btn').addEventListener('click', () => $('#import-file').click())
        $('.delete-all-btn').addEventListener('click', () => party_note.deleteAll())
        $('.app-version').textContent = `v${APP_CONFIG.app_version}`
    }
}

const init_svc = new PartyNoteInit()
init_svc.activeServiceWorker()

document.addEventListener('DOMContentLoaded', async () => {
    init_svc.bindTopBar()
    init_svc.bindList()
    init_svc.bindPopup()
    init_svc.bindMenu()
    install_guide.init()
    ui.on_popup_step_back = () => party_note.navBack()
    try {
        await party_note.init()
    } catch (e) {
        console.error(e)
        $('.item-list').innerHTML = `<div class="empty-state"><p>저장소(IndexedDB)를 열 수 없어요.<br>시크릿 모드라면 일반 창에서 열어 주세요.</p></div>`
    }
})
