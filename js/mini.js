// 미니 창: PC에서 다른 창 위에 늘 떠 있는 작은 글쓰기 창 (딱 세 줄)
// 크롬·엣지 데스크톱의 Document Picture-in-Picture 기능을 씀. 사파리·파이어폭스·폰에서는 버튼이 안 보임
// 미니 창에서 쓴 글은 바로 원래 편집 칸으로 들어감 (임시 저장·글자 수·저장은 원래 화면이 그대로 맡음)
const MINI_SIZE = { width: 380, height: 116 }

const mini_writer = {
    win: null,

    supported() {
        return 'documentPictureInPicture' in window && matchMedia('(pointer: fine)').matches
    },

    async open() {
        const main = $('.memo-content-input')
        if (!main || this.win) return
        let win
        try {
            win = await documentPictureInPicture.requestWindow(MINI_SIZE)
        } catch (e) {
            return ui.toast('미니 창을 열지 못했어요')
        }
        this.win = win
        const doc = win.document
        // 앱과 같은 글꼴·테마: 이미 읽어 둔 note.css 규칙을 그대로 옮겨 붙임 (새로 받지 않아서 바로 보임)
        const sheet = [...document.styleSheets].find(s => s.href?.endsWith('/css/note.css'))
        const style = doc.createElement('style')
        style.textContent = sheet ? [...sheet.cssRules].map(r => r.cssText).join('\n') : ''
        doc.head.appendChild(style)
        doc.documentElement.lang = 'ko'
        doc.documentElement.setAttribute('style', document.documentElement.getAttribute('style') || '') // 테마 색 (applyTheme)
        doc.documentElement.dataset.theme = document.documentElement.dataset.theme || ''
        doc.title = '파티노트'
        doc.body.className = 'mini-body'
        doc.body.innerHTML = `<div class="mini-box"><textarea class="mini-input" rows="3" placeholder="이어서 써 보세요"></textarea></div>`

        const input = doc.querySelector('.mini-input')
        // 채팅 입력칸처럼 늘 맨 끝(지금 쓰는 줄)이 보이게. 앞 글을 고치는 중이면 그 자리를 그대로 둠
        const toEnd = () => { if (input.selectionEnd === input.value.length) input.scrollTop = input.scrollHeight }
        input.value = main.value
        input.addEventListener('input', () => {
            if (!main.isConnected) return this.close()
            main.value = input.value
            main.dispatchEvent(new Event('input', { bubbles: true })) // 원래 칸의 높이·글자 수
            toEnd()
        })
        // 원래 화면에서 고쳐도 미니 창에 반영
        const onMain = () => { if (input.value !== main.value) { input.value = main.value; toEnd() } }
        main.addEventListener('input', onMain)
        // 저장·취소로 편집 화면이 닫히면 미니 창도 닫음
        const watch = setInterval(() => { if (!main.isConnected) this.close() }, 1000)
        win.addEventListener('pagehide', () => {
            clearInterval(watch)
            main.removeEventListener('input', onMain)
            this.win = null
            if (main.isConnected) {
                main.focus()
                main.setSelectionRange(main.value.length, main.value.length)
            }
        })
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
        input.scrollTop = input.scrollHeight
    },

    close() {
        this.win?.close()
    },
}
