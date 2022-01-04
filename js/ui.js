// import idb from '../store/idb.js' //타입이 모듈일 때 사용

function main(){ //스크립트일 때 사용

function activeServiceWorker(){
    if('serviceWorker' in navigator){
        window.addEventListener('load',()=>{
            navigator.serviceWorker.register('service-worker.js')
            .then((reg)=>{
                console.log('Service worker registered',reg)
            })
            .catch(err=>{
                console.log(err)
            })
        })
    }
}

    activeServiceWorker()
    renderDom_selectInput()

    //indexedDB 지원여부 확인
    // if (!window.indexedDB){
    //     alert('indexedDB 를 지원하지 않는 브라우저입니다.')
    // }else{
    //     idb.openDatabase()
    // }


    function evtMaker(selector,listenType,willFunction){
        let trigger = document.querySelectorAll(selector)
        Array.from(trigger).forEach(function(el) { //el을 넣어줌. 이벤트 수신을 원하면 이벤트를..
            el.addEventListener(listenType, function(ev){
                willFunction(el,ev)
            })
        })
    }

    let select= (function(){
        return{
            removeBanner:(el)=>{
                let selectList=document.querySelectorAll('.select_dropdown_banner')
                selectList.forEach(select=>{
                    select.classList.add('collapse')
                })
            },
            toggleBanner:(el,ev)=>{ // 배너 열었다 닫았다
                let nextEl = el.nextElementSibling
                // console.log(nextEl)
                nextEl.classList.toggle('collapse')
            },
            clickArrow:(el,ev)=>{ //화살표 모양이 가리키는 방향으로 value 치환
                let isPrev = el.classList.contains('left')
                let wrapper=el.closest('.select_wrapper')
                let lastActived =wrapper.querySelector('.active')
                let factors = wrapper.querySelector('.select_dropdown_banner').children
                let nextTarget

                if(isPrev){//이전 것 선택
                    nextTarget=lastActived.previousElementSibling
                    nextTarget=(nextTarget==null? factors[factors.length-1]:lastActived.previousElementSibling)
                }else{ //다음 것 선택
                    nextTarget=lastActived.nextElementSibling
                    nextTarget=(nextTarget==null? factors[0]:lastActived.nextElementSibling)
                }
                nextTarget.classList.add('active')
                lastActived.classList.remove('active')

                //active된 것 선택 요소의 value로 동기화시키기.
                let targetEl=wrapper.querySelector('.select_dropdown_main')
                let selectedVal=nextTarget.innerHTML

                //이제 화살표를 누르면 내부 텍스트로 치환된다.
                select.renderInnerVal(targetEl,selectedVal)
            },
            clickFactor:(el,ev)=>{ //클릭한 것으로 value 치환
                let wrapper=el.closest('.select_wrapper')
                let targetEl=wrapper.querySelector('.select_dropdown_main')
                let lastActived =wrapper.querySelector('.active')
                lastActived.classList.remove('active')
                el.classList.add('active')
                let selectedVal=el.innerHTML
                select.renderInnerVal(targetEl,selectedVal)
            },
            renderInnerVal:(targetEl,val)=>{
                targetEl.innerHTML=val
            },
        }
    })()

    function renderDom_selectInput(){
        let titleArray = Object.keys(SelectOptions)
        let selectDOM=''
        for(let title of titleArray){
            selectDOM += `
            <div class="select_wrapper">
                <div class="input_title">${title}</div>
                <div class="select_input_wrapper">
                    <i class="fas fa-caret-left select_arrow left"></i>
                        <div class="select_dropdown">
                            <div class="select_dropdown_main">${SelectOptions[title][0]}</div>
                            <div class="select_dropdown_banner collapse">`
            for(let i in SelectOptions[title]){
                selectDOM +=`<div class="select_dropdown_factor ${i==0? 'active': ''}">${SelectOptions[title][i]}</div>`
            }
            selectDOM +=`</div>
                        </div>
                    <i class="fas fa-caret-right select_arrow right"></i>
                </div>
            </div>`

        }
        let formzone = document.querySelector('.form_zone')
        let parser = new DOMParser()
        formzone.appendChild((parser.parseFromString(selectDOM,'text/html')).documentElement)
    }

    // evtMaker('div','click',select.removeBanner)
    evtMaker('.select_dropdown_factor','click',select.clickFactor) //클릭한 요소로 치환
    evtMaker('.select_arrow','click',select.clickArrow) //화살표 값 치환
    evtMaker('.select_dropdown_main','click',select.toggleBanner) //배너 토글(열었다 닫았다)
    //온마우스 오버로 2초후에 배너 닫힘 구현해야 함.

} //main() 닫힘

