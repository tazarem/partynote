const APP_CONFIG = {
    app_version: `1.31`,
    app_name: `PartyNote`,
    app_alias: `partynote`,
    // 파티노트 서버(로그인·서버 백업). 운영 서버가 생기기 전에는 로컬에서만 씀 (비어 있으면 메뉴의 계정 칸이 숨겨짐)
    api_base: ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:4100' : '',
}
