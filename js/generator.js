
class Parts{
    #field = {
        name:null,
        pSize:null,
        color:[]
    }
    get(){
        return this.#field
    }
    set(){
        // this.#field=
    }
}

class Whale{
    #whale={
      name:null,
      body:null,
      tail:null,
      eye:null,
      horn:null,
      hat:null,
      face:null,
      palette:null
    }
    #inventory=[]
    #money=0
    constructor(name,body,tail,eye,horn,hat,face,palette){
        this.#whale.name = name
        this.#whale.body = body
        this.#whale.tail = tail
        this.#whale.eye = eye
        this.#whale.horn= horn
        this.#whale.hat=hat
        this.#whale.face=face
        this.#whale.palette = palette //복잡한 형태의 객체
    }
    get(fieldName){
      if(fieldName!=null){
        return this.#whale[fieldName]
      }else{
        return this.#whale
      }
    }
    set(fieldName,value){
        this.#whale[fieldName] = value
    }
    getInventory(){
        return this.#inventory
    }
    getMoney(){
        return this.#money
    }
}
let SelectOptions={
    body:['simple','belly','fin'],
    tail:['round','leaf','fishlike'],
    eye:['simple','round','bright','sleepy','sour','equanimous','mindless','lashes'],
    horn:['none','simple','spiral','party','syrup','twin'],
    hat:['none','baked','sunflower','starfish','silkhat','leaf','teabag','eggfry'],
    face:['none','party','freckles']
}
let preset={
    partyWhale:{
        body:'simple',
        tail:'round',
        eye:'simple',
        horn:'party',
        hat:'none',
        face:'party',
        palette:{
            body:{
                key:'simple',
                color:['#fff']
            },
            eye:{
                key:'simple',
                color:['#555']
            },
            horn:{
                key:'party',
                color:['yellow','pink','hotpink']
            },
            face:{
                key:'party',
                color:['hotpink']
            }
        }
    },
    sunny:{
        body:'simple',
        tail:'round',
        eye:'sour',
        horn:'none',
        hat:'eggfry',
        face:'none',
        palette:{
            body:{
                key:'simple',
                color:['brown']
            },
            eye:{
                key:'sour',
                color:['#555']
            },
            hat:{
                key:'eggfry',
                color:['#fff','yellow']
            }
        }
    },
    pado:{
        body:'belly',
        tail:'leaf',
        eye:'sleepy',
        horn:'none',
        hat:'starfish',
        face:'none',
        palette:{
            body:{
                key:'belly',
                color:['darkblue']
            },
            eye:{
                key:'sleepy',
                color:['#fff']
            },
            hat:{
                key:'starfish',
                color:['red','blue']
            }
        }
    }
}
let presetWhale = Object.keys(preset)
//body: simple(원톤) belly(투톤) fin(지느러미) tropical(트로피컬)
//tail: round(둥근 꼬리) leaf(나뭇잎 모양) fishlike(상어모양)
//eye: simple(O) round(o) bright(0) sleepy(U) sour(<) equanimous(D) mindless(ㅣ) lashes(Q)

// let member = []
// for(let name of presetWhale){  
//   let new_whale = new Whale(
//   name,
//   preset[name].body,
//   preset[name].tail,
//   preset[name].eye,
//   preset[name].horn,
//   preset[name].hat,
//   preset[name].face,
//   preset[name].palette
//   )
//   member.push(new_whale)
// }
// for(let item of member){
//   console.log(item.get())
// }