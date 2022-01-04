(()=>{ //클로저로 감싸기

    const STATIC_CACHE_NAME = 'partynote_static_v0.83';
    const DYNAMIC_CACHE_NAME = 'partynote_dynamic_v0.83';
    // 캐시하고 싶은 리소스
    let staticCache = [
      // './profile_gen.html',
      './index.html',
      './lib/js/jquery.alterclass.js',
      './js/ui.js',
      './js/note.js',
      './store/idb.js',
      './css/note.css',
      './css/note-layout.css',
      './css/hide.css',
      
      // './css/style.css'
    ]
    const KACEVIEWER_WEB_CACHE = {
        init() {
            self.addEventListener('install', this.staticCacheStrategy.bind(this));
            self.addEventListener('activate', this.deleteOldCache.bind(this));
            self.addEventListener('fetch', this.dynamicCacheStrategy.bind(this));
          },
          staticCacheStrategy(event) {// 스태틱 캐싱 인스톨
            event.waitUntil( 
                // @return {Promise} 연결된 Cache Database를 반환한다.
                caches
                  .open(STATIC_CACHE_NAME) 
                  .then((cache) => { //캐시 DB와 연결됨.
                    // addAll 메소드로 내가 캐싱할 리소스를 다 넣어주자.
                    return cache.addAll(staticCache)
                  })
                  .then(() => {
                    // 설치 후에 바로 활성화 단계로 들어갈 수 있게 해준다.
                    return self.skipWaiting();
                  })
                  ,
                  caches
                  .open(DYNAMIC_CACHE_NAME)
                  .then(() => {
                    // 설치 후에 바로 활성화 단계로 들어갈 수 있게 해준다.
                    return self.skipWaiting();
                  })
              )

        },
      
        deleteOldCache(event) {// 캐시 삭제
            // 영구적으로 가져갈 캐시 스트리지 화이트리스트
            var cacheWhiteList = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME];

            event.waitUntil(
              // 캐시 스토리지의 모든 스토리지명을 가져온다.
              caches.keys().then((cacheNames) => {
                // 캐시를 삭제하는 건 Promise를 반환하므로 Promise.all을 사용해 끝날 시점을 잡아야한다.
                return Promise.all(
                  // 이 결과는 [Promise, Promise...] 형태가 되시겠다.
                  cacheNames.map((cacheName) => {
                    // 각각의 캐시 스토리지명이 화이트 리스트와 같지 않을 경우
                    if (cacheWhiteList.indexOf(cacheName) === -1) {
                      // 캐시를 삭제하는 Promise를 배열에 추가한다.
                      return caches.delete(cacheName);
                    }
                  })
                )
              })
            )
            // activate 시에는 clients claim 메소드를 호출해서
            // 브라우저에 대한 제어권을 가져와야한다.
            return self.clients.claim()
        },
      
          dynamicCacheStrategy(event) {// 다이나믹 캐싱
            event.respondWith(
                caches.match(event.request).then((response) => {
                  // 캐시에 있으면 repsonse를 그대로 돌려준다.
                  if (response) {
                    return response
                  }
            
                  // 여기서 request를 복사해준다.
                  // request는 스트림으로 fetch 당 한 번만 사용해야하기 때문이다.
                  // 근데 event.request로 받아도 실행은 된다
                  var fetchRequest = event.request.clone()
            
                  // if (response) return response 구문을 하나로 합칠 수도 있다.
                  // return response || fetch(fetchRequest)
                  return fetch(fetchRequest).then((response) => {
                    // 응답이 제대로 왔는지 체크한다.
                    // 구글 문서에는 다음과 같이 처리하라고 되어있는데
                    // 이 경우 Cross Site Request에 대해 캐싱 처리를 할 수가 없다.
                    // if(!response || response.status !== 200 || response.type !== 'basic') {
                    if (!response) {
                      return response
                    }
            
                    // 응답은 꼭 복사 해줘야한다.
                    var responseToCache = response.clone();
            
                    // 캐시 스토리지를 열고 정말 캐싱을 해준다.
                    caches.open(STATIC_CACHE_NAME).then((cache) => {
                      try{
                        cache.put(event.request, responseToCache);
                      }catch(e){
                        console.log(e)
                      }
                    })
            
                    // 여기서 response를 내보내줘야 캐싱 처리 후에 리소스를 반환한다.
                    return response
                  })
                })
              )
          }
    }
    
    KACEVIEWER_WEB_CACHE.init()

})()
