// features/media/geoIndex.js
// 좌표 기반 클러스터링 (거리 기반 MVP)

/**
 * 미디어 목록을 줌 레벨 기준으로 클러스터링
 * @param {Media[]} mediaList
 * @param {number} zoom - Leaflet map.getZoom()
 * @returns {{ lat:number, lon:number, count:number, items:Media[] }[]}
 */
export function clusterMedia(mediaList, zoom) {
  if (!mediaList.length) return []

  // zoom이 클수록 threshold 작아짐 → 더 세밀하게 분리
  const threshold = 0.5 / zoom

  const clusters = []
  const assigned = new Set()

  for (let i = 0; i < mediaList.length; i++) {
    if (assigned.has(i)) continue

    const seed = mediaList[i]
    const group = [seed]
    assigned.add(i)

    for (let j = i + 1; j < mediaList.length; j++) {
      if (assigned.has(j)) continue

      const target = mediaList[j]
      const dist = Math.sqrt(
        Math.pow(seed.lat - target.lat, 2) +
        Math.pow(seed.lon - target.lon, 2)
      )

      if (dist <= threshold) {
        group.push(target)
        assigned.add(j)
      }
    }

    // 클러스터 중심 = 그룹 평균 좌표
    const lat = group.reduce((s, m) => s + m.lat, 0) / group.length
    const lon = group.reduce((s, m) => s + m.lon, 0) / group.length

    clusters.push({ lat, lon, count: group.length, items: group })
  }

  return clusters
}