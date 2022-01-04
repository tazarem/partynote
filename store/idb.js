let db //db와 obs(오브젝트 스토어. 테이블과 비슷합니다.), transaction 선언
// 도움말 : 
// https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore
const DATABASE_NAME = "Partynote"
const TABLE_LIST = [ //오프라인 테이블 리스트
{
    name:'note',
    option: {keyPath: 'id', autoIncrement:true}
}
]
/*
,
{
    name:'note_info',
    option: {keyPath: 'id', autoIncrement:true}
}

*/

//indexedDB 지원여부 확인
// if (!window.indexedDB){
//     window.onload = () => {
//         alert('indexedDB 를 지원하지 않는 브라우저입니다.')
//     }
//     }else{
//     window.onload = () =>{
//         idb.openDatabase()
//     }
// }

let idb = (function(){
    return{
        openDatabase:()=>{
            return new Promise((resolve,reject)=>{
             //데이터베이스 열기
            let req = indexedDB.open(DATABASE_NAME,1)
            db = this.result    
                req.onupgradeneeded=(e)=>{ //업그레이드 먼저 트리거 됨 e.oldVersion 이라는 변수가 존재하며 기존 데이터베이스의 버전을 가져와 비교를 하는 등 사용이 가능하다.
                    console.log("indexedDB will upgrade.")
                    db=e.target.result
                    //오브젝트 스토어 및 테이블 만들기
                    TABLE_LIST.forEach(table=>{
                        idb.createTable(table.name,table.option)
                    })
                    resolve(db)
                }
                req.onsuccess=(e)=>{
                    console.log("indexedDB Open Success.")
                    db=e.target.result
                    //업그레이드 필요시 업그레이드 후 오픈 성공
                    resolve(db)
                }
                req.onerror=(e)=>{
                    console.log("indexedDB Open Failed.")
                    //에러 발생 시 DB 를 지우고 다시 할 것인가.
                }
            })
        },
        createTable:(tableName, detailOption)=>{
            let obs = db.createObjectStore(tableName,detailOption)
            if(obs){
                console.log(`테이블 생성: ${tableName}`)
            }
        },
        doCrud: (order,tableName,command)=>{ //JSON 째로 등록할 수 있는 NOSQL
            return new Promise((resolve,reject)=>{
                // console.log(db)
                let ts = db.transaction([tableName],"readwrite")
                let obs = ts.objectStore(tableName)
                let req
                switch(order){
                    case "insert":{ // 등록
                        req = obs.add({val:command})
                        req.onsuccess=()=>{
                            resolve(1)
                        }
                        req.onerror=(e)=>{
                            reject(`Data Input failed: ${e}`)
                        }
                    break}
                    case "delete":{ // 삭제  //command = IDBKeyRange.bound(x, y) x<삭제 또는 셀렉트할 키값<y
                        req = obs.delete(command)
                        req.onsuccess= ()=>{
                            resolve(1)
                        }
                        req.onerror =(e)=>{
                            reject(`Data Delete failed: ${e}`)
                        }
                    break}
                    case "update":{ // 수정
                        console.log(command)
                        req = obs.put(command) //item,key
                        req.onsuccess= ()=>{
                            resolve(1)
                        }
                        req.onerror =(e)=>{
                            reject(`Data Update failed: ${e}`)
                        }
                    break}
                    case "select":{ // 조회 (키레인지,카운트) 키레인지는 키 독단만 셀렉트할수있습니다. 공백을 전달하면 전체를 가져옴
                         req=obs.getAll(command)
                        req.onsuccess= ()=>{
                            resolve(req.result)
                        }
                        req.onerror =(e)=>{
                            reject(`Data Select failed: ${e}`)
                        }
                    break}
                    case "clearAll":{ // 테이블 비우기
                        req=obs.clear()
                        req.onsuccess= ()=>{
                            resolve(1)
                        }
                        req.onerror =(e)=>{
                            reject(`Data Table Clear failed: ${e}`)
                        }
                    break}
                }
            })
        
        },
        ddlDatabase:(order,tableName)=>{
            return new Promise((reject,resolve)=>{
                switch(order){
                    case "dropAll":{ // 데이터베이스 드랍
                        db.close ()
                        console.log('DB closed..')
                        let req = window.indexedDB.deleteDatabase(DATABASE_NAME)
                        req.onsuccess=()=>{
                            console.log('delete DB success.')
                        }
                        req.onerror=(e)=>{
                            console.log(`delete DB failed.: ${e}`)
                        }
                    break}
                    case "dropTable":{
                        db.close()
                        console.log('DB closed..')
                        let req = window.indexedDB.deleteObjectStore(tableName)
                        req.onsuccess=()=>{
                            console.log('delete Table success.')
                        }
                        req.onerror=(e)=>{
                            console.log(`delete Table failed.: ${e}`)
                        }
                    break }
                    case "create":{ // 테이블 만들기
                        idb.openDatabase()
                    break}
                }
            })
        }
    }

})()

// export default {
//     DATABASE_NAME,
//     TABLE_LIST,
//     idb
// }