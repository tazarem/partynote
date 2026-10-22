const APP_CONFIG = {
    app_version: `1.38`,
    app_name: `PartyNote`,
    app_alias: `partynote`,
    // 파티노트 서버(로그인·클라우드 백업). 로컬에서 열면 로컬 서버, 그 밖에는 운영 서버
    api_base: ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:4100' : 'https://api.coding-coconut.com',
}
