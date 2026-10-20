/**
 * IndexedDB Client - PartyNote
 * 파티노트·레시피북의 IndexedDBClient 구조를 따릅니다.
 */
class IndexedDBClient {
    db
    // 예전 파티노트의 저장소('Partynote', 'partynote')와 겹치지 않는 새 이름. 옛 글은 note.js의 migrateLegacy가 옮겨 옵니다.
    DATABASE_NAME = 'partynote_v1'
    DATABASE_VERSION = 1
    TABLE_LIST = [
        {
            // 메모 한 장. book_id가 0이면 낱장, 아니면 그 책의 한 쪽입니다.
            name: 'memo',
            option: { keyPath: 'id', autoIncrement: true },
            indexes: [
                { name: 'book_id', params: 'book_id', unique: false },
                { name: 'updated_at', params: 'updated_at', unique: false },
            ],
            scheme: {
                uid: '',            // 기기와 상관없는 고유값 (백업을 합칠 때 같은 기록인지 알아보는 용도)
                title: '',
                content: '',
                book_id: 0,         // 들어 있는 책 (0 = 낱장)
                order: 0,           // 책 안에서의 순서 (작을수록 앞쪽)
                favorite: 0,        // 즐겨찾기 0 | 1
                hidden: 0,          // 비공개 0 | 1 (책 속의 쪽은 책을 따라감)
                deleted_at: 0,      // 휴지통으로 옮긴 시각 (0 = 휴지통 아님)
                created_at: 0,
                updated_at: 0,
            }
        },
        {
            // 책: 메모를 순서대로 묶은 것. 쪽들은 memo 표에서 book_id로 찾습니다.
            name: 'book',
            option: { keyPath: 'id', autoIncrement: true },
            indexes: [
                { name: 'updated_at', params: 'updated_at', unique: false },
            ],
            scheme: {
                uid: '',
                title: '',
                favorite: 0,
                bookmark_id: 0,     // 마지막으로 읽은 쪽(메모 id). 0 = 없음
                status: 'active',   // active(쓰는 중) | done(완결) | stopped(연재 중지)
                status_at: 0,       // 완결·중지한 시각 (쓰는 중이면 0)
                locked: 0,          // 잠금 0 | 1 (잠근 책은 … 메뉴의 삭제가 숨겨짐)
                hidden: 0,          // 비공개 0 | 1
                deleted_at: 0,      // 휴지통으로 옮긴 시각 (0 = 휴지통 아님)
                created_at: 0,
                updated_at: 0,
            }
        },
        {
            // 앱이 기억해 둘 작은 값들 (예: 예전 파티노트 글을 이미 가져왔는지)
            name: 'meta',
            option: { keyPath: 'key' },
            indexes: [],
            scheme: { key: '', value: null }
        },
    ]

    openDatabase() {
        return new Promise((res, rej) => {
            const req = indexedDB.open(this.DATABASE_NAME, this.DATABASE_VERSION)

            req.onupgradeneeded = (e) => {
                this.db = e.target.result
                const transaction = e.target.transaction
                this.TABLE_LIST.forEach((table) => {
                    const store = this.db.objectStoreNames.contains(table.name)
                        ? transaction.objectStore(table.name)
                        : this.db.createObjectStore(table.name, table.option)
                    table.indexes.forEach((index) => {
                        if (!store.indexNames.contains(index.name)) {
                            store.createIndex(index.name, index.params, { unique: index.unique, multiEntry: !!index.multiEntry })
                        }
                    })
                })
            }
            req.onsuccess = (e) => {
                this.db = e.target.result
                // 다른 탭에서 새 버전으로 업그레이드하려 하면 이 연결을 닫고 새로고침합니다.
                this.db.onversionchange = () => {
                    this.db.close()
                    location.reload()
                }
                res(this.db)
            }
            req.onblocked = () => {
                console.log('indexedDB upgrade blocked: 다른 탭에 열린 파티노트가 있어요.')
            }
            req.onerror = (e) => rej(e)
        })
    }

    newRecord(table_name) {
        const table = this.TABLE_LIST.find(t => t.name === table_name)
        return structuredClone(table.scheme)
    }

    requestHandler(req) {
        return new Promise((res, rej) => {
            req.onsuccess = (e) => res(e.target.result)
            req.onerror = (e) => rej(e.target.error)
        })
    }

    store(table_name, mode = 'readonly') {
        return this.db.transaction([table_name], mode).objectStore(table_name)
    }

    doInsert(table_name, value) {
        const record = { ...value }
        delete record.id // autoIncrement 키를 받도록
        return this.requestHandler(this.store(table_name, 'readwrite').add(record))
    }

    doUpdate(table_name, id, value) {
        return this.requestHandler(this.store(table_name, 'readwrite').put({ ...value, id }))
    }

    doDelete(table_name, id) {
        return this.requestHandler(this.store(table_name, 'readwrite').delete(id))
    }

    doSelectOne(table_name, id) {
        return this.requestHandler(this.store(table_name).get(id))
    }

    doSelectAll(table_name) {
        return this.requestHandler(this.store(table_name).getAll())
    }

    doSelectByIndex(table_name, index_name, value) {
        return this.requestHandler(this.store(table_name).index(index_name).getAll(value))
    }

    // meta 표: 키 하나에 값 하나
    async getMeta(key) {
        return (await this.requestHandler(this.store('meta').get(key)))?.value
    }

    setMeta(key, value) {
        return this.requestHandler(this.store('meta', 'readwrite').put({ key, value }))
    }

    doCountTotal(table_name) {
        return this.requestHandler(this.store(table_name).count())
    }

    doTruncate(table_name) {
        return this.requestHandler(this.store(table_name, 'readwrite').clear())
    }
}

const idb = new IndexedDBClient()
