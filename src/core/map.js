// core/map.js
// 지도 초기화 + 기존 기능 + 미디어 레이어 연결

import { initMediaStore, addMedia, getMediaInBounds, clearMedia } from '../features/media/mediastore.js'
import { clusterMedia } from '../features/media/geoIndex.js'
import { renderClusters } from '../features/media/mediaUI.js'
import { extractGPS } from '../utils/exif.js'

// ─── 지도 초기화 ───────────────────────────────────────────
export const map = L.map('map', { zoomControl: true })
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map)
map.setView([37.5665, 126.9780], 13)
L.control.scale({ metric: true, imperial: false }).addTo(map)

// ─── 핀 마커 레이어 (기존) ────────────────────────────────
export const markers = L.featureGroup().addTo(map)

// ─── Kakao REST Key ───────────────────────────────────────
const KAKAO_REST_KEY = 'c5016bd99dd643018bdc55e26c6b83eb'

// ─── 핀 색상 ──────────────────────────────────────────────
let currentColor = localStorage.getItem('hudak_pin_color') || '#22c55e'
let pinIcon = _buildPinIcon(currentColor)

function _buildPinIcon(color) {
  const svg = `<svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".3"/></filter></defs>
    <path d="M13 0C6.373 0 1 5.373 1 12c0 8.25 12 26 12 26s12-17.75 12-26C25 5.373 19.627 0 13 0z" fill="${color}" filter="url(#s)"/>
    <circle cx="13" cy="12" r="4" fill="white" opacity="0.9"/>
  </svg>`
  return L.divIcon({ className: 'pin', html: svg, iconSize: [26, 38], iconAnchor: [13, 38], popupAnchor: [0, -30] })
}

export function updatePinColor(color) {
  currentColor = color
  localStorage.setItem('hudak_pin_color', color)
  pinIcon = _buildPinIcon(color)
  markers.eachLayer(l => { if (l.setIcon) l.setIcon(pinIcon) })
}

// ─── 지도 이동 ─────────────────────────────────────────────
export function goTo(latlng, zoom = 17, dropMarker = false) {
  map.setView(latlng, zoom)
  if (dropMarker) {
    L.marker(latlng, { icon: pinIcon }).addTo(markers)
  }
}

// ─── 역지오코딩 ────────────────────────────────────────────
export async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lon}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    )
    if (!r.ok) throw new Error()
    const j = await r.json()
    const d = (j.documents || [])[0]
    return d?.road_address?.address_name || d?.address?.address_name || null
  } catch {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
      if (!r.ok) throw new Error()
      const j = await r.json()
      return j?.display_name || null
    } catch { return null }
  }
}

// ─── 검색 ──────────────────────────────────────────────────
export async function runSearch(q) {
  const headers = { Authorization: `KakaoAK ${KAKAO_REST_KEY}` }
  try {
    const [r1, r2] = await Promise.all([
      fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=8`, { headers }),
      fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=8`, { headers })
    ])
    if (!r1.ok && !r2.ok) throw new Error('Kakao 검색 실패')
    const [j1, j2] = [r1.ok ? await r1.json() : { documents: [] }, r2.ok ? await r2.json() : { documents: [] }]
    const list = []
    for (const d of j1.documents || []) {
      if (d.x && d.y) list.push({ label: d.place_name || d.address_name || q, lat: +d.y, lon: +d.x })
    }
    for (const d of j2.documents || []) {
      if (d.x && d.y) list.push({ label: d.address_name || d.road_address?.address_name || q, lat: +d.y, lon: +d.x })
    }
    return list
  } catch {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8`)
    if (!r.ok) throw new Error('검색 오류')
    const j = await r.json()
    return j.map(it => ({ label: it.display_name, lat: +it.lat, lon: +it.lon }))
  }
}

// ─── 즐겨찾기/검색 기록 ────────────────────────────────────
export function addHistory(label, lat, lon) {
  const key = 'hudak_history'
  const arr = JSON.parse(localStorage.getItem(key) || '[]')
  arr.unshift({ label, lat, lon, ts: Date.now() })
  const dedup = []
  const seen = new Set()
  for (const it of arr) {
    const k = `${it.label}|${it.lat}|${it.lon}`
    if (!seen.has(k)) { seen.add(k); dedup.push(it) }
  }
  localStorage.setItem(key, JSON.stringify(dedup.slice(0, 20)))
}

export function getHistory() {
  return JSON.parse(localStorage.getItem('hudak_history') || '[]')
}

// ─── 미디어 레이어 ─────────────────────────────────────────
export function updateMediaLayer() {
  const b = map.getBounds()
  const bounds = {
    north: b.getNorth(),
    south: b.getSouth(),
    east: b.getEast(),
    west: b.getWest()
  }
  const media = getMediaInBounds(bounds)
  const clusters = clusterMedia(media, map.getZoom())
  renderClusters(map, clusters)
}

// ─── 미디어 업로드 처리 ────────────────────────────────────
export async function handleMediaUpload(files, onProgress) {
  let processed = 0
  let skipped = 0

  for (const file of files) {
    const gps = await extractGPS(file)

    if (!gps) {
      skipped++
      onProgress?.({ processed, skipped, total: files.length, status: 'no_gps' })
      continue
    }

    const media = {
      id: crypto.randomUUID(),
      lat: gps.lat,
      lon: gps.lon,
      createdAt: Date.now(),
      type: file.type.startsWith('video') ? 'video' : 'image',
      url: URL.createObjectURL(file),
      thumbnail: URL.createObjectURL(file)
    }

    addMedia(media)
    processed++
    onProgress?.({ processed, skipped, total: files.length, status: 'ok' })
  }

  updateMediaLayer()
  return { processed, skipped }
}

// ─── 이벤트: 지도 이동 시 미디어 레이어 갱신 ────────────────
map.on('moveend', updateMediaLayer)

// ─── 이벤트: 지도 클릭 → 핀 + 주소 팝업 ────────────────────
map.on('click', async (e) => {
  const { lat, lng } = e.latlng
  const m = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(markers)
  const addr = await reverseGeocode(lat, lng)
  m.bindPopup(
    `<b>여기</b><br/>${addr ? _esc(addr) : '주소 없음'}<br/><small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small>`
  ).openPopup()
})

// ─── 좌표 HUD ─────────────────────────────────────────────
map.on('mousemove', (e) => {
  const el = document.getElementById('coords')
  if (el) el.textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`
})

// ─── 초기화 ───────────────────────────────────────────────
initMediaStore()
updateMediaLayer()

// ─── permalink ────────────────────────────────────────────
export function permalink() {
  const c = map.getCenter()
  return `${location.origin}${location.pathname}#${map.getZoom()}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`
}

// ─── 유틸 ─────────────────────────────────────────────────
function _esc(x) {
  return x?.toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export { currentColor, pinIcon, KAKAO_REST_KEY, _esc as escapeHtml }