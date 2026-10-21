// 계정: 구글 로그인 (앞으로 서버 백업·기기 동기화에 씀)
// 파티노트 서버 주소(APP_CONFIG.api_base)가 없으면 아무것도 하지 않고 메뉴의 계정 칸도 숨김
// 로그인 상태는 서버가 주는 쿠키로 유지 (이 앱의 저장소에는 남기지 않음)
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client'

class Account {
    user = null        // 로그인한 회원 { id, email, pen_name, pen_tag } 또는 null
    reachable = true   // 서버에 닿는지 (오프라인·서버 꺼짐이면 false)
    google_ready = null

    get base() {
        return APP_CONFIG.api_base || ''
    }

    async init() {
        if (!this.base) return
        $('.account-wrap').hidden = false
        // 인터넷이 끊기면 바로 안내, 다시 이어지면 알아서 서버에 다시 붙음 (로그인 쿠키는 그대로라 다시 로그인할 필요 없음)
        window.addEventListener('offline', () => {
            this.user = null
            this.reachable = false
            this.render()
        })
        window.addEventListener('online', () => this.refresh())
        // 앱을 오래 뒤에 다시 열었을 때도 (폰에서 다른 앱 갔다가 돌아옴 등) 연결이 안 돼 있던 상태면 한 번 더 시도
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !this.reachable && navigator.onLine) this.refresh()
        })
        await this.refresh()
    }

    // 파티노트 서버 부르기 (쿠키를 같이 보냄)
    api(path, { method = 'GET', body } = {}) {
        return fetch(this.base + path, {
            method,
            credentials: 'include',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        })
    }

    async refresh() {
        try {
            const res = await this.api('/auth/me')
            this.user = res.ok ? (await res.json()).user : null
            this.reachable = true
        } catch (e) {
            this.user = null
            this.reachable = false
        }
        this.render()
    }

    render() {
        const el = $('.account-section')
        if (!el) return
        if (!this.reachable) {
            el.innerHTML = `<div class="account-note"><i class="fas fa-cloud"></i> 지금은 서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.</div>
                <div class="menu-btn-group"><button type="button" class="btn ghost" data-account="retry"><i class="fas fa-redo"></i> 다시 시도</button></div>`
            return
        }
        if (this.user) {
            el.innerHTML = `<div class="account-user"><i class="fas fa-user-circle"></i> <b>${esc(this.user.email)}</b> 로 로그인했어요</div>
                <div class="menu-btn-group"><button type="button" class="btn ghost" data-account="logout"><i class="fas fa-sign-out-alt"></i> 로그아웃</button></div>`
            return
        }
        el.innerHTML = `<div class="google-btn"></div>`
        this.renderGoogleButton($('.account-section .google-btn'))
    }

    // 구글 로그인 스크립트는 계정 칸이 있을 때만, 한 번만 불러옴
    loadGoogle() {
        if (!this.google_ready) {
            this.google_ready = new Promise((res, rej) => {
                const script = document.createElement('script')
                script.src = GOOGLE_SCRIPT
                script.async = true
                script.onload = res
                script.onerror = () => {
                    this.google_ready = null // 다음에 다시 시도
                    rej(new Error('google script'))
                }
                document.head.appendChild(script)
            })
        }
        return this.google_ready
    }

    async renderGoogleButton(box) {
        try {
            const [config] = await Promise.all([this.api('/auth/config').then(r => r.json()), this.loadGoogle()])
            if (!config.google_client_id || !box.isConnected) return
            google.accounts.id.initialize({
                client_id: config.google_client_id,
                callback: (response) => this.onCredential(response.credential),
                auto_select: false,
            })
            google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ko', width: 260 })
        } catch (e) {
            box.innerHTML = `<div class="account-note">구글 로그인 버튼을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</div>`
        }
    }

    // 구글 버튼에서 받은 ID 토큰을 서버로 → 서버가 확인하고 로그인 쿠키를 줌
    async onCredential(credential) {
        try {
            const res = await this.api('/auth/google', { method: 'POST', body: { credential } })
            if (!res.ok) throw new Error(String(res.status))
            const data = await res.json()
            this.user = data.user
            this.render()
            ui.toast(data.is_new ? '가입했어요. 반가워요!' : '로그인했어요')
        } catch (e) {
            ui.toast('로그인하지 못했어요. 잠시 뒤 다시 해 주세요')
        }
    }

    /* ---------- 클라우드 백업 ---------- */
    // 서버에서 임시 주소를 받아 S3에 직접 올림 → 다 올렸다고 서버에 알림 (서버는 최근 3개만 남김)
    async backupToCloud() {
        const payload = party_note.backupPayload(party_note.books, party_note.memos)
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
        ui.toast('클라우드에 백업하는 중…')
        try {
            const ticket = await this.api('/backups/upload-url', { method: 'POST', body: { size: blob.size } })
            if (ticket.status === 401) return this.expired()
            if (!ticket.ok) throw new Error(`upload-url ${ticket.status}`)
            const { key, upload_url, content_type } = await ticket.json()
            const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': content_type }, body: blob })
            if (!put.ok) throw new Error(`put ${put.status}`)
            const done = await this.api('/backups', {
                method: 'POST',
                body: { key, memo_count: payload.memos.length, book_count: payload.books.length, app_version: APP_CONFIG.app_version },
            })
            if (!done.ok) throw new Error(`complete ${done.status}`)
            ui.toast(`클라우드에 백업했어요 (메모 ${payload.memos.length}개, 책 ${payload.books.length}권)`)
        } catch (e) {
            console.error(e)
            ui.toast('클라우드에 백업하지 못했어요. 잠시 뒤 다시 해 주세요')
        }
    }

    // 클라우드의 백업 목록에서 하나를 골라 받아서, 파일 가져오기와 같은 방식으로 합침
    async restoreFromCloud() {
        let list
        try {
            const res = await this.api('/backups')
            if (res.status === 401) return this.expired()
            if (!res.ok) throw new Error(`list ${res.status}`)
            list = (await res.json()).backups
        } catch (e) {
            return ui.toast('백업 목록을 불러오지 못했어요')
        }
        if (!list.length) return ui.toast('클라우드에 백업한 것이 아직 없어요')
        const size = (n) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`
        const choice = await ui.openSheet({
            title: '어느 백업으로 복원할까요?',
            content: `
                <div class="sheet-options">
                    ${list.map((b, i) => `
                        <button type="button" class="sheet-option" data-sheet-value="${b.id}">
                            <i class="fas fa-cloud-download-alt"></i>
                            <span>${esc(dateTimeLabel(new Date(b.created_at).getTime()))}${i === 0 ? ' · 최근' : ''}<br>
                            <small class="sub">메모 ${b.memo_count}개 · 책 ${b.book_count}권 · ${size(b.size)}</small></span>
                        </button>`).join('')}
                </div>`,
        })
        if (!choice) return
        try {
            const res = await this.api(`/backups/${Number(choice)}/download-url`)
            if (!res.ok) throw new Error(`download-url ${res.status}`)
            const file = await fetch((await res.json()).download_url)
            if (!file.ok) throw new Error(`get ${file.status}`)
            // 파일 가져오기와 똑같이: 지금 목록에 합치고, 같은 글은 더 최근에 고친 쪽을 남김
            await party_note.importBackup(new File([await file.text()], 'cloud-backup.json', { type: 'application/json' }))
        } catch (e) {
            console.error(e)
            ui.toast('백업을 받아 오지 못했어요. 잠시 뒤 다시 해 주세요')
        }
    }

    // 로그인 기한이 지남
    expired() {
        this.user = null
        this.render()
        ui.toast('로그인이 풀렸어요. 메뉴의 계정에서 다시 로그인해 주세요')
    }

    async logout() {
        try {
            await this.api('/auth/logout', { method: 'POST' })
        } catch (e) { }
        window.google?.accounts.id.disableAutoSelect()
        this.user = null
        this.render()
        ui.toast('로그아웃했어요')
    }
}

const account = new Account()
