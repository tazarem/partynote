// 공지: 메뉴(환경설정) 맨 위 '공지' 칸에 보여 줌. 글 쓰는 화면은 방해하지 않고, 새 공지가 있으면 메뉴 버튼에 작은 점만 찍음
// 새 공지는 맨 위에 추가하고 id를 1씩 올려 주세요. body는 직접 쓰는 HTML이에요 (링크는 상대 주소로)
const NOTICES = [
    {
        id: 1,
        date: '2026-10-22',
        title: '개인정보 처리방침과 이용약관을 새로 정리했어요',
        body: `
            <p>로그인과 클라우드 백업이 생기면서, 개인정보보호위원회의 작성지침에 맞춰 두 문서를 다시 정리했어요. 2026년 10월 22일부터 적용돼요.</p>
            <ul>
                <li>처리하는 정보와 보관 기간을 표로 정리 (구글 이메일, 백업 최근 3개, 접속 기록 14일)</li>
                <li>개인정보 보호책임자와 문의처 안내</li>
                <li>이용약관을 조항 형식으로 정리 (약관 변경 시 7일 전 공지, 불리한 변경은 30일 전)</li>
            </ul>
            <p><a href="./privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a> · <a href="./terms.html" target="_blank" rel="noopener">이용약관</a></p>`,
    },
]

const NOTICE_SEEN_KEY = 'ptnt_notice_seen'

const notices = {
    latestId() {
        return NOTICES.reduce((max, n) => Math.max(max, n.id), 0)
    },

    seenId() {
        try { return Number(localStorage.getItem(NOTICE_SEEN_KEY)) || 0 } catch (e) { return 0 }
    },

    render() {
        const wrap = $('.notice-wrap')
        if (!wrap) return
        wrap.hidden = !NOTICES.length
        const seen = this.seenId()
        // 최근 3개까지. 아직 안 읽은 공지는 펼쳐 둠
        $('.notice-list').innerHTML = NOTICES.slice(0, 3).map(n => `
            <details class="notice" ${n.id > seen ? 'open' : ''}>
                <summary>
                    ${n.id > seen ? '<span class="notice-new">새 공지</span>' : ''}
                    <span class="notice-title">${esc(n.title)}</span>
                    <span class="notice-date">${esc(n.date.replace(/-/g, '. '))}.</span>
                </summary>
                <div class="notice-body">${n.body}</div>
            </details>`).join('')
        this.renderDot()
    },

    // 메뉴 버튼의 작은 점: 안 읽은 공지가 있을 때만
    renderDot() {
        const dot = $('.menu-dot')
        if (dot) dot.hidden = this.latestId() <= this.seenId()
    },

    // 메뉴를 열면 읽은 것으로 (점은 바로 사라지고, '새 공지' 표시는 다음에 메뉴를 열 때 사라짐)
    markSeen() {
        try { localStorage.setItem(NOTICE_SEEN_KEY, String(this.latestId())) } catch (e) { }
        this.renderDot()
    },
}
