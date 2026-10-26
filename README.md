# partynote (옛 주소 이사 안내)

파티노트는 **[party-note.com](https://party-note.com)** 으로 이사했어요. (앱 저장소: `tazarem/party-note`)

이 저장소는 옛 주소 `coding-coconut.com/partynote/` 에 남겨 두는 안내용이에요.

- `index.html` — 이사 안내 + 이 브라우저에 남은 글 수 + "새 주소에서 글 가져오기" (`party-note.com/?move=1`)
- `service-worker.js` — 예전에 설치한 파티노트가 업데이트를 확인하면 이걸 받아서, 옛 캐시를 지우고 물러난 뒤 안내 화면으로 새로고침. 글(IndexedDB)은 건드리지 않음
- `manifest.json`, `img/icons/` — 설치된 옛 앱의 이름·아이콘 유지용

실제로 글을 옮기는 일은 새 앱이 블로그 쪽 이사 도우미(`coding-coconut.com/partynote-move/`)를 열어서 해요.
마이그레이션 적용 커밋