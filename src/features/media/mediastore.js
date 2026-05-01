// features/media/mediaStore.js
// 미디어 데이터 CRUD + localStorage 관리

const STORAGE_KEY = 'hudak_media'
let _store = []

/**
 * localStorage에서 데이터 로드. 앱 초기화 시 1회 호출.
 */
export function initMediaStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    _store = raw ? JSON.parse(raw) : []
  } catch {
    _store = []
  }
}

/**
 * 전체 미디어 목록 반환
 * @returns {Media[]}
 */
export function getAllMedia() {
  return [..._store]
}

/**
 * 미디어 추가. id 중복 시 무시.
 * @param {{ id:string, lat:number, lon:number, createdAt:number, type:'image'|'video', url:string, thumbnail:string }} media
 */
export function addMedia(media) {
  if (_store.some(m => m.id === media.id)) return
  _store.push(media)
  _persist()
}

/**
 * 뷰포트 범위 내 미디어 필터링
 * @param {{ north:number, south:number, east:number, west:number }} bounds
 * @returns {Media[]}
 */
export function getMediaInBounds(bounds) {
  return _store.filter(m =>
    m.lat <= bounds.north &&
    m.lat >= bounds.south &&
    m.lon <= bounds.east &&
    m.lon >= bounds.west
  )
}

/**
 * 전체 미디어 삭제
 */
export function clearMedia() {
  _store = []
  _persist()
}

function _persist() {
  try {
    // URL.createObjectURL은 세션 한정이므로 url/thumbnail은 저장 제외
    const serializable = _store.map(({ url, thumbnail, ...rest }) => rest)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
  } catch (e) {
    console.warn('[mediaStore] localStorage 저장 실패:', e)
  }
}