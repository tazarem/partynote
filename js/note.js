let themes={
    partynote:{//파스텔톤 베이스
        color_pack:[
            '#FF8A80',
            '#FF80AB',
            '#EA80FC',
            '#B388FF',
            '#8C9EFF',
            '#82B1FF',
            '#80D8FF',
            '#84FFFF',
            '#A7FFEB',
            '#B9F6CA',
            '#CCFF90',
            '#F4FF81',
            '#FFFF8D',
            '#FFE57F',
            '#FFD180',
            '#FF9E80'
            ],
        bg_color_pack:[
            '#FFCCBC',
            '#FFE0B2',
            '#FFECB3',
            '#FFF9C4',
            '#F0F4C3',
            '#DCEDC8',
            '#C8E6C9',
            '#B2DFDB',
            '#B2EBF2',
            '#B3E5FC',
            '#BBDEFB',
            '#C5CAE9',
            '#D1C4E9',
            '#E1BEE7',
            '#F8BBD0',
            '#FFCDD2'
        ]
    },
    marine:{ //테마색상 테스트용
        color_pack:[
            '#F0F1F5',
            '#AFB8D9',
            '#144988',
            '#57607C',
            '#F0F0F0',
            '#E0E0E0',
            '#D6D6D6',
            '#17284F',
        ],
        bg_color_pack:[
            '#F0F1F5',
            '#F0F0F0',
            '#E0E0E0',
            '#D6D6D6'
        ]
    },
    cryptic:{ //까만 모노톤
    }
}
    
function randomCardColor(themeName){
    return themes[themeName].color_pack[Math.floor(Math.random()*themes[themeName].color_pack.length)]
}
function randomBgColor(themeName){
    return themes[themeName].bg_color_pack[Math.floor(Math.random()*themes[themeName].bg_color_pack.length)]
}
function randomProfileColor(themeName){
    return themes[themeName].bg_color_pack[Math.floor(Math.random()*themes[themeName].bg_color_pack.length)]
}

function evtMaker(selector,listenType,willFunction){
    let trigger = document.querySelectorAll(selector)
    Array.from(trigger).forEach(function(el) { //el을 넣어줌. 이벤트 수신을 원하면 이벤트를..
        el.addEventListener(listenType, function(ev){
            willFunction(el,ev)
        })
    })
}

function activeServiceWorker(){
    if('serviceWorker' in navigator){
        window.addEventListener('load',()=>{
            navigator.serviceWorker.register('service-worker.js')
            .then((reg)=>{
                console.log('Service worker registered', reg)
            })
            .catch(err=>{
                console.log(err)
            })
        })
    }
}

activeServiceWorker()


//store/idb모듈 사용
let note=(()=>{
    let noteList
    let popup={ 
        //dom 추가.
        isOpen:false,
        state:'write'
    }
    let drawer = false
    let quill
    let db
    let searched=false
    let isLogin=false
    let userInfo = undefined //계정정보
    let apiUrl = 'http://localhost:8080/api'
    let _userInfo = {
        user_id:'',
        user_email:'',
        user_nickname:'',
        is_cert:''
    }
    let serverMod=false
    let now_theme = 'partynote'
    return{
        setIsLogin:(input)=>{
            isLogin = input
        },
        getIsLogin:()=>{
            return isLogin
        },
        getUserInfo:()=>{
            return userInfo
        },
        setUserInfo:(input)=>{
            userInfo = input
        },
        onPageLoad:async ()=>{ //repository open
            //온라인여부 확인
            if(serverMod){
                if(navigator.onLine){ //온라인임
                    await note.sessionCheck()
                }else{ //오프라인임
    
                }
            }
            if (!window.indexedDB){ //기본 오프라인 모드 기반으로 동작함
                alert('indexedDB 를 지원하지 않는 브라우저입니다.')
            }else{
                let body=document.querySelector('body')
                body.style.backgroundColor=randomBgColor(now_theme)
                $('.creator-profile').css('background-color',randomProfileColor(now_theme))
                db = await idb.openDatabase()
                note.getNotes()
            }

        },
        sessionCheck:async ()=>{
            let result = await fetchGet(`${apiUrl}/sessionCheck`)//세션체크하면 유저정보줘야하는거아니냐?
            if(result.isLogin){ //세션있음
                console.log('세션있음')
                note.setIsLogin(result.isLogin)
                note.setUserInfo(result.userInfo)
                note.renderLoginState()
            }else{ //세션없음
                console.log('세션없음')
                note.setIsLogin(result.isLogin)
                note.renderLoginState()
            }
        },
        getNotes:async ()=>{ //note Select query
            noteList = await idb.doCrud("select","note") //order by options?
            note.renderNotes(noteList)
        },
        renderNotes:(datas)=>{
            let notes=document.querySelectorAll('.note-factor')
            notes.forEach(item=>{
                item.remove()
            })
            let loader = document.querySelector('.card-loader')
            if(datas!=undefined){
                for(item of datas){
                    let card = document.createElement('div')
                    card.classList.add('card')
                    card.classList.add('note-factor')
                    card.setAttribute('id',`note_${item.id}`)
                    // card.style.backgroundColor=item.val.color
                    card.style.backgroundColor=randomCardColor(now_theme)

                    var th1 = (item.val.contents).replace(/(<\/p><p>|<\/p><p\/>|<\/p><p \/>)/g, '&nbsp;'); //엔터는 띄어쓰기로 치환됨

                    var thumbnail_text = (th1).replace(/(<([^>]+)>)/ig,"") //태그 제거
                    // ${(item.val.title).length>10? (item.val.title).substring(0,10)+'...':item.val.title}
                    // ${thumbnail_text.length>20?thumbnail_text.substring(0,20)+"...":thumbnail_text}
                    let innerContents=`
                        <div class="note-contents">
                            <div class="title">${item.val.title}</div>
                            <div class="date">${item.val.date}</div>
                            <div class="th-text">${thumbnail_text}</div>
                        </div>
                    `
                    card.innerHTML= innerContents
                    loader.after(card)
                }  
            }
        },
        renderDetail:(el)=>{
            //noteList에서 아이디로 검색하자.
            // if(!popup['isOpen']){
                let note_id=el.getAttribute('id')
                note_id=note_id.substring(5) //note_를 자르기.
                let noteArray=noteList.filter(item=>{
                    return item.id==note_id
                })
                let note = noteArray[0]
                let note_title = note.val.title
                let note_date = note.val.date
                let note_contents = note.val.contents
                
                //popup 돔 위에다가 그리기.
                popup['state'] = 'detail'
    
                popup['dom'] = document.querySelector('.popup-overlay')
                popup['dom'].classList.remove('hide')
                popup['isOpen']=true
    
                //제목 렌더링
                let popup_header=(popup['dom']).querySelector('.popup-header')
                let title = popup_header.querySelector('.title')
                title.innerHTML=note_title
    
                //아이디 세팅
                title.setAttribute('id',`detail_${note_id}`)
    
                //날짜 렌더링
                let date = popup_header.querySelector('.date')
                date.innerHTML=note_date
    
                //내용 렌더링
                let popup_contents=(popup['dom']).querySelector('.popup-contents')
                popup_contents.innerHTML = note_contents
    
                //버튼 렌더링
                let popup_option_list = (popup['dom']).querySelector('.popup-option-list')
    
                //수정
                let edit_button = `
                <div class="note-edit-mode detail-btn" onclick="note.renderEdit()"
                title="편집">
                <i class="mdi mdi-pencil"></i>
                </div>
                `
                //삭제
                let delete_button = `
                <div class="note-delete detail-btn" onclick="note.deleteNote()"
                title="삭제">
                <i class="mdi mdi-delete-forever"></i>
                </div>
                `
                let dom_concats = edit_button+delete_button
                popup_option_list.innerHTML = dom_concats
            // }
        }, 
        dateConverter:(input,isMonth)=>{
            if(!isMonth){
                if(input<10){
                    return input='0'+input
                }else{
                    return input=input+''
                }
            }else{ //월일 때. 1을 더하고 
                input = parseInt(input)+1
                if(input<10){
                    return input='0'+input
                }else{
                    return input=input+''
                }
            }
        },
        renderWrite:()=>{ // render note write form
            //닫혀있는가?
            if(!popup['isOpen']){
                popup['dom'] = document.querySelector('.popup-overlay')
                popup['dom'].classList.remove('hide')
                popup['isOpen'] = true
    
                //제목 렌더링
                let popup_header=(popup['dom']).querySelector('.popup-header')
                let title = popup_header.querySelector('.title')
                title.innerHTML='노트 추가하기'
                // 텍스트 에디터 추가
                let popup_contents=(popup['dom']).querySelector('.popup-contents')
                let text_editor = document.createElement('div')
                let note_title = document.createElement('input')
                note_title.classList.add('note_title')
                note_title.setAttribute('type',`text`)
                note_title.setAttribute('placeholder',`노트 제목을 입력해 주세요`)
    
                text_editor.setAttribute('id',`quill_editor`)
    
                popup_contents.append(note_title)
                popup_contents.append(text_editor)
    
                quill = new Quill('#quill_editor',{
                    theme:'snow'
                })
                
                document.querySelector('.ql-editor').classList.add('scroll')
                //작성 버튼 추가
                let popup_option_list = (popup['dom']).querySelector('.popup-option-list')
                let write_button = `
                <div class="note-write detail-btn" onclick="note.writeNote()"
                title="글쓰기">
                    <i class="mdi mdi-check"></i>
                </div>
                `
                popup_option_list.innerHTML=write_button
            }            
        },
        writeNote:async ()=>{ //note write form and save
            //quill 안에 있는 내용물 갖고오기
            let note_contents = quill.root.innerHTML
            let note_title = document.querySelector('.note_title').value
            if(note_title.length==0){
                note_title='제목 없음'
            }
            let rd = new Date()
            let note_date = `${rd.getFullYear()}/${note.dateConverter(rd.getMonth(),true)}/${note.dateConverter(rd.getDate())} ${note.dateConverter(rd.getHours())}:${note.dateConverter(rd.getMinutes())}:${note.dateConverter(rd.getSeconds())}`
            //note_title이 없다면.. 유효성 검증 처리하기
            let note_data = {
                title:note_title,
                date:note_date,
                contents:note_contents
                // color:randomCardColor(now_theme)
            }
            let result = await idb.doCrud('insert','note',note_data)
            note.closePopup()
            note.getNotes()
        },
        deleteNote:async ()=>{
            //id 가져와서 db에서 삭제하기.
            let note_title=popup['dom'].querySelector('.title')
            let note_id = note_title.getAttribute('id')
            note_id = note_id.substring(7) //detail_
            let result = await idb.doCrud('delete','note',parseInt(note_id))
            if(result==1){
                note.closePopup()
                await note.getNotes()
            }else{
                alert('게시물 삭제하는 데 오류가 발생했습니다')
            }
        },
        editNote:async (note_id)=>{
            let note_title = document.querySelector('.note_title').value
            let note_contents = quill.root.innerHTML
            let noteArray = noteList.filter(item=>{
                return item.id==note_id
            })
            let note_color = noteArray[0].val.color
            let rd = new Date()
            let note_date = `${rd.getFullYear()}/${note.dateConverter(rd.getMonth(),true)}/${note.dateConverter(rd.getDate())} ${note.dateConverter(rd.getHours())}:${note.dateConverter(rd.getMinutes())}:${note.dateConverter(rd.getSeconds())}`
            //note_title이 없다면.. 유효성 검증 처리하기
            let note_data = {
                title:note_title,
                date:note_date,
                // color:note_color,
                contents:note_contents
            }
            let result = await idb.doCrud('update','note', {val:note_data, id:parseInt(note_id)})
            // note.closePopup()
            // note.getNotes()
            await note.getNotes()
            note.resetInnerDom()
            let edited_note = document.querySelector(`#note_${note_id}`)
            note.renderDetail(edited_note)
        },
        editCancel:(note_id)=>{
            note.resetInnerDom()
            let note_el = document.querySelector(`#${note_id}`)
            console.log(note_el)
            note.renderDetail(note_el)
        },
        renderEdit:()=>{
            //id 값 추출(쿼리에 필요)
            let popup_title=popup['dom'].querySelector('.title')
            let note_id = popup_title.getAttribute('id')
            popup_title.removeAttribute('id')
            let note_title = popup_title.innerHTML
            note_id = note_id.substring(7)

            let popup_contents=(popup['dom']).querySelector('.popup-contents')
            let note_contents = popup_contents.innerHTML
            // 컨텐츠 가져와서 돔 지운다음에 라이터 띄우고 컨텐츠랑 제목 넣기
            note.resetInnerDom()

            /*폼 그리기*/
            //제목 렌더링
            popup_title.innerHTML='노트 수정하기'
            // 텍스트 에디터 추가
            let text_editor = document.createElement('div')
            let note_title_dom = document.createElement('input')
            note_title_dom.classList.add('note_title')
            note_title_dom.setAttribute('type',`text`)
            note_title_dom.setAttribute('placeholder',`노트 제목을 입력해 주세요`)
            note_title_dom.value = note_title

            text_editor.setAttribute('id',`quill_editor`)

            popup_contents.append(note_title_dom)
            popup_contents.append(text_editor)

            quill = new Quill('#quill_editor',{
                theme:'snow'
            })
            
            document.querySelector('.ql-editor').classList.add('scroll')

            quill.root.innerHTML = note_contents

            //푸터 버튼 추가
            let popup_option_list = (popup['dom']).querySelector('.popup-option-list')

            //수정 취소 버튼 추가
            let edit_cancel_button =`
            <div class="note-edit-cancel detail-btn" onclick="note.editCancel('note_${note_id}')"
            title="수정 취소">
            <i class="mdi mdi-pencil-off"></i>
            </div>
            `

            //수정 적용 버튼 추가
            let edit_button=`
            <div class="note-edit detail-btn" onclick="note.editNote(${note_id})"
            title="수정 완료">
            <i class="mdi mdi-check"></i>
            </div>
            `
            let btns_concat = edit_cancel_button + edit_button

            popup_option_list.innerHTML = btns_concat
        },
        searchNote:(search_text)=>{
            //이거 노트 목록 가지고 해여해.
            //title과 contents에서 검색하면 됨.
            console.log(noteList)
            let search_result = noteList.filter(item=>{
                return (item.val.title).includes(search_text)||(item.val.contents).includes(search_text)
            })
            //검색 전용 화면에다가 결과를 렌더링
            note.renderSearch(search_result)
            searched=true
        },
        isSearched:()=>{
            return searched
        },
        renderSearch:(datas)=>{
            //검색 결과 배너 하나 달아주고싶은뎅

            let notes=document.querySelectorAll('.note-factor')
            notes.forEach(item=>{
                item.remove()
            })
            let loader = document.querySelector('.card-loader')
            if(datas!=undefined){
                for(item of datas){
                    let card = document.createElement('div')
                    card.classList.add('card')
                    card.classList.add('note-factor')
                    card.setAttribute('id',`note_${item.id}`)
                    card.style.backgroundColor=item.val.color

                    var th1 = (item.val.contents).replace(/(<\/p><p>|<\/p><p\/>|<\/p><p \/>)/g, '&nbsp;'); //엔터는 띄어쓰기로 치환됨
                    var thumbnail_text = (th1).replace(/(<([^>]+)>)/ig,"") //태그 제거

                    let innerContents=`
                        <div class="note-contents">
                            <div class="title">${item.val.title}</div>
                            <div class="date">${item.val.date}</div>
                            <div class="th-text">${thumbnail_text}</div>
                        </div>
                    `
                    card.innerHTML= innerContents
                    loader.after(card)
                }  
            }
        },
        clearSearch:()=>{
            searched=false
            note.getNotes() //배너를 집어넣거나 삭제하면 다시 그려주기
        },
        resetInnerDom:()=>{
        let popup_header=(popup['dom']).querySelector('.popup-header')
        let title = popup_header.querySelector('.title')
        title.removeAttribute('id')
        title.innerHTML=''
        let date = popup_header.querySelector('.date')
        date.innerHTML=''
        let popup_contents=(popup['dom']).querySelector('.popup-contents')
        popup_contents.innerHTML=''
        let popup_option_list = (popup['dom']).querySelector('.popup-option-list')
        popup_option_list.innerHTML=''
        
        // 디테일 창 메뉴도 닫아주기
        $('.popup-right-float').removeClass('active')
        $('.popup-option-list').addClass('y-collapse')

        },
        closePopup:()=>{
            (popup['dom']).classList.add('hide')
            popup['isOpen']=false
            note.resetInnerDom()
            //팝업 닫을 때 디테일 창 메뉴도 닫아주기
            $('.popup-right-float').removeClass('active')
            $('.popup-option-list').addClass('y-collapse')
        },
        toggleDrawer:()=>{
            drawer=!drawer
            if(drawer){ //열림 로직
                $('.menu-overlay').removeClass('collapse-x')
            }else{ //닫힘 로직
                $('.menu-overlay').addClass('collapse-x')
            }
        },
        renderLoginState:()=>{ //사용자 정보를 그려주기
            if(note.getIsLogin()){
                $('.active-login').removeClass('hide')
                $('.req-login').addClass('hide')
                // $('.loginform').addClass('hide')

                note.renderProfile(userInfo) //그려주기
            }else{
                $('.active-login').addClass('hide')
                $('.req-login').removeClass('hide')
                // $('.loginform').removeClass('hide')
                note.renderProfile(_userInfo) //초기화
            }
        },
        doLogin:async (userId,userPassword)=>{
            if(serverMod){
                let param = {
                    user_id:userId,
                    user_password:userPassword
                }
                let result = await fetchPost(`${apiUrl}/login`,param)
                if(result.isLogin){ //로그인 성공
                    note.setUserInfo(result.userInfo)
                    note.setIsLogin(result.isLogin)
                    //로그인상태를 dom에 적용해야함
                    note.renderLoginState()
                }else{ //로그인 실패
                    alert(result.alert_text)
                    note.setIsLogin(result.isLogin)
                    note.renderLoginState()
                }
            }
        },
        doLogout: async ()=>{
            if(serverMod){
                let result = await fetchGet(`${apiUrl}/logout`)
                if(result.answer===1){
                    alert('로그아웃 되었습니다.')
                    note.setIsLogin(false)
                    note.setUserInfo(_userInfo)
                    note.renderLoginState()
                }
            }
        },
        goJoinPage:()=>{
            if(serverMod){
                location.href="http://localhost:8080/join"
            }
        },
        renderProfile:(usrInfo)=>{
            if(serverMod){
                $('#userNick').html(usrInfo.user_nickname)
                $('#userId').html(usrInfo.user_id)
                $('#userEmail').html(usrInfo.user_email)
                $('#isCert').html(usrInfo.is_cert===0? '이메일이 인증되지 않았습니다':'이메일 인증됨' )
            }
        }
    }
})()

$(function(){ //onLoadFunction
    note.onPageLoad()
})

//노트 관련 버튼 로직
$(document).on('click','.note-factor',function(){
    note.renderDetail(this)
})
$(document).on('click','.close',function(){
    note.closePopup(this)
})
$(document).on('click','.note-writer',function(){
    note.renderWrite(this)
})
//노트 검색 기능
//검색한 노트들만 그려준다.

$(document).on('click','.note-search',function(){ //배너는 그냥..배너만 접히도록 하자. 기록 초기화는 x버튼 누를때에만.
    $('.search-banner').toggleClass('collapse-y')
    let searchBannerIsOpen = !$('.search-banner').hasClass('collapse-y')
    if(searchBannerIsOpen){
        $(this).addClass('active')
    }else{
        $(this).removeClass('active')
    }
    
})
$(document).on('click','div',function(e){//검색 탭이 열린 상태에서 다른 div를 누르면 닫아주도록 하자
    if(($(this).hasClass('note-search')||$(this).closest('.search-banner').length>0)){
        e.stopPropagation()
    }else{
        let searchBannerIsOpen = !$('.search-banner').hasClass('collapse-y')
        let isChild = $(this).closest('.search-banner') //누른 대상이 search banner의 자식임
        if(searchBannerIsOpen&&isChild.length==0){
            $('.search-banner').addClass('collapse-y')
            $('.note-search').removeClass('active')
        }
    }
})

$(document).on('keyup','#note-searcher',function(e){ //note searcher 말고 다른걸 누르면 닫혀야해.
    let val = $(this).val()
    if(val.length>0){
        $('.search-deleter').removeClass('hide')
    }
    if(e.keyCode==13){// 엔터 키 치면 검색로직 시행
        note.searchNote(val)
    }
})

$(document).on('click','.search-deleter',function(){
    $('#note-searcher').val('')
    $('.search-deleter').addClass('hide')
    if(note.isSearched()){ //검색결과가 렌더링된 상태이면
        note.clearSearch() //클리어 해주기
    }
})

//노트 관련 버튼 로직
$(document).on('click','.menu-factor',function(){ //메뉴 탭 전환
    $('.menu-factor').removeClass('active')
    let target = $(this).data('target')
    $(this).addClass('active')
    $('.screen-compo').addClass('hide')
    $(`.${target}`).removeClass('hide')
})
$(document).on('click','.popup-option-btn',function(){
    $('.popup-right-float').toggleClass('active')
    $('.popup-option-list').toggleClass('y-collapse')
})

function fetchGet(url,param){
    return new Promise((resolve,reject)=>{
        $.ajax({
            type:'GET',
            url:url,
            data:param,
            xhrFields: {
                withCredentials: true
             },
            success:(res)=>{
                resolve(res)
            },
            error:(err)=>{
                reject(err)
            }
        })
    })
}
function fetchPost(url,param){
    return new Promise((resolve,reject)=>{
        $.ajax({
            type:'POST',
            url:url,
            data:param,
            xhrFields: {
                withCredentials: true
             },
            success:(res)=>{
                resolve(res)
            },
            error:(err)=>{
                reject(err)
            }
        })
    })
}



$(document).on('click','.login',function(){
    // sessionCheck()
    let userId = $('#user_id').val()
    let userPassword = $('#user_password').val()
    note.doLogin(userId,userPassword)
})
$(document).on('click','.logout',function(){
    note.doLogout()
})

$(document).on('click','.sign-up',function(){
    note.goJoinPage()
})
//로그인 및 회원가입 사이트 리다이렉트 로직
