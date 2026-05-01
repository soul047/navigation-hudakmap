// features/media/mediaUI.js
// 클러스터 마커 렌더링 + 하단 슬라이드 패널

// window.L = Leaflet (CDN 로드됨)

let _clusterLayer = null
let _panelEl = null

/**
 * 지도에 클러스터 마커 렌더링
 * @param {L.Map} map
 * @param {{ lat:number, lon:number, count:number, items:Media[] }[]} clusters
 */
export function renderClusters(map, clusters) {
  // 기존 레이어 제거
  if (_clusterLayer) {
    map.removeLayer(_clusterLayer)
  }
  _clusterLayer = L.featureGroup().addTo(map)

  for (const cluster of clusters) {
    const marker = createClusterMarker(cluster)
    marker.addTo(_clusterLayer)
    attachClusterClick(marker, cluster)
  }
}

/**
 * 클러스터 마커 생성
 * @param {{ lat:number, lon:number, count:number }} cluster
 * @returns {L.Marker}
 */
export function createClusterMarker(cluster) {
  const icon = L.divIcon({
    className: '',
    html: `<div class="hudak-cluster-marker">
      <span class="hudak-cluster-icon">📸</span>
      <span class="hudak-cluster-count">${cluster.count}</span>
    </div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    popupAnchor: [0, -30]
  })
  return L.marker([cluster.lat, cluster.lon], { icon })
}

/**
 * 클러스터 마커 클릭 이벤트 연결
 */
export function attachClusterClick(marker, cluster) {
  marker.on('click', () => showMediaPanel(cluster.items))
}

/**
 * 하단 슬라이드 패널에 미디어 썸네일 목록 표시
 * @param {Media[]} items
 */
export function showMediaPanel(items) {
  _ensurePanel()

  const html = items.map(item => `
    <div class="hudak-media-thumb" data-url="${escapeAttr(item.url)}" data-type="${item.type}">
      ${item.type === 'video'
        ? `<video src="${escapeAttr(item.thumbnail)}" class="thumb-img" muted playsinline></video><span class="thumb-badge">▶</span>`
        : `<img src="${escapeAttr(item.thumbnail)}" class="thumb-img" alt="사진" loading="lazy" />`
      }
      <div class="thumb-date">${_formatDate(item.createdAt)}</div>
    </div>
  `).join('')

  _panelEl.querySelector('.hudak-panel-body').innerHTML = html
  _panelEl.classList.add('open')

  // 썸네일 클릭 → 원본 열기
  _panelEl.querySelectorAll('.hudak-media-thumb').forEach(el => {
    el.addEventListener('click', () => {
      window.open(el.dataset.url, '_blank')
    })
  })
}

export function hideMediaPanel() {
  _panelEl?.classList.remove('open')
}

// ─── 내부 유틸 ────────────────────────────────────────────

function _ensurePanel() {
  if (_panelEl) return

  _panelEl = document.createElement('div')
  _panelEl.className = 'hudak-media-panel'
  _panelEl.innerHTML = `
    <div class="hudak-panel-header">
      <span class="hudak-panel-title">📍 이 곳의 추억</span>
      <button class="hudak-panel-close" aria-label="닫기">✕</button>
    </div>
    <div class="hudak-panel-body"></div>
  `
  document.body.appendChild(_panelEl)

  _panelEl.querySelector('.hudak-panel-close').addEventListener('click', hideMediaPanel)
}

function _formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('ko-KR', { year:'2-digit', month:'numeric', day:'numeric' })
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;')
}