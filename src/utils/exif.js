// utils/exif.js
// 이미지 파일에서 GPS EXIF 추출
// 의존: exif-js (CDN, window.EXIF)

/**
 * DMS(도분초) → decimal degree 변환
 * @param {number[]} dms - [degrees, minutes, seconds]
 * @param {string} ref - 'N'|'S'|'E'|'W'
 * @returns {number}
 */
export function convertDMSToDD(dms, ref) {
  const [deg, min, sec] = dms
  let dd = deg + min / 60 + sec / 3600
  if (ref === 'S' || ref === 'W') dd = -dd
  return dd
}

/**
 * 파일에서 GPS 좌표 추출
 * @param {File} file
 * @returns {Promise<{ lat:number, lon:number } | null>}
 */
export function extractGPS(file) {
  return new Promise((resolve) => {
    if (typeof window.EXIF === 'undefined') {
      console.warn('[exif] exif-js 로드 안됨')
      resolve(null)
      return
    }

    const reader = new FileReader()
    reader.onload = function (e) {
      // exif-js는 ArrayBuffer 기반으로 동작
      const arrayBuffer = e.target.result
      // 가상 img 태그에 src 없이 getData 호출하는 방식 대신
      // EXIF.readFromBinaryFile 사용 (exif-js 내부 API)
      const exifData = window.EXIF.readFromBinaryFile(arrayBuffer)

      if (!exifData) { resolve(null); return }

      const latArr = exifData.GPSLatitude
      const latRef = exifData.GPSLatitudeRef
      const lonArr = exifData.GPSLongitude
      const lonRef = exifData.GPSLongitudeRef

      if (!latArr || !lonArr || !latRef || !lonRef) {
        resolve(null)
        return
      }

      try {
        const lat = convertDMSToDD(latArr, latRef)
        const lon = convertDMSToDD(lonArr, lonRef)

        // 유효 범위 검증
        if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          resolve(null)
          return
        }

        resolve({ lat, lon })
      } catch {
        resolve(null)
      }
    }

    reader.onerror = () => resolve(null)
    reader.readAsArrayBuffer(file)
  })
}