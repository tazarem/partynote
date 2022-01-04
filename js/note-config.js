function deepClone(input){
    return JSON.parse(JSON.stringify(input))
}
let note_config=(function(){
    let _default={
        card_layout:'list',
        card_size:'med',
        thumb_text:'expose'
    }
    let now_config=deepClone(_default)
    return{
        getConfig:()=>{
            return JSON.parse(localStorage.getItem('ptnt_config'))
        },
        setConfig:()=>{ //실시간 세팅
            localStorage.setItem('ptnt_config',
            JSON.stringify(now_config)
            )
        },
        changeState:(config_key,input)=>{
            now_config[config_key] = input
            note_config.setConfig()
            note_config.confirmConfig()
        },
        confirmConfig:()=>{
            now_config = note_config.getConfig()
            
            if(now_config==undefined){
                now_config=deepClone(_default)
                note_config.setConfig()
            }

            let config_key_arr = Object.keys(now_config)
            
            //돔 동기화
            config_key_arr.forEach(keyName =>{
                $(`input[name=${keyName}]`).prop('checked','')
                $(`input[name=${keyName}][value=${now_config[keyName]}]`).prop('checked',true)
            })


            //카드 레이아웃
            $('.note-container').alterClass('*-style',`${now_config.card_layout}-style`)

            //카드 사이즈
            $('.note-container').alterClass('*-card-size',`${now_config.card_size}-card-size`)

            //내용 보이기 여부
            $('.note-container').alterClass('*-th-text',`${now_config.thumb_text}-th-text`)
        },
    }
})()

//deepClone

//초기 시작 시 레이아웃 배치 설정 가져오기
$(function(){
    note_config.confirmConfig()
})

$(document).on('change','input[type="radio"]',function(){ //환경설정 바꿀 때.
    let config_key = $(this).prop('name')
    let param = $(this).val()
    note_config.changeState(config_key,param)
})