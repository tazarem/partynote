// 옛 주소(coding-coconut.com/partynote)에 남는 마지막 서비스 워커
// 예전에 설치한 파티노트가 업데이트를 확인하면 이 파일을 받음 →
// 옛 파티노트가 기기에 저장해 둔 파일(캐시)을 지우고 스스로 물러난 뒤, 열려 있는 화면을 새로고침 → 이사 안내(index.html)가 보임
// (글이 든 저장소 IndexedDB는 건드리지 않음. 새 주소로 옮길 때 그대로 읽어야 하므로)
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        // 같은 사이트(coding-coconut.com)의 블로그 쪽 캐시는 두고 파티노트 것만
        for (const key of await caches.keys()) {
            if (key.startsWith('partynote_')) await caches.delete(key)
        }
        await self.clients.claim()
        await self.registration.unregister()
        // 옛 앱 화면만 새로고침 (?cleaned 를 붙여서, 혹시라도 다시 이 워커가 깔려도 같은 화면을 또 새로고침하지 않게)
        for (const client of await self.clients.matchAll({ type: 'window' })) {
            const url = new URL(client.url)
            if (url.searchParams.has('cleaned')) continue
            url.searchParams.set('cleaned', '1')
            client.navigate(url.href).catch(() => {})
        }
    })())
})
