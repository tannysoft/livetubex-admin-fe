import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2'
import * as https from 'https'

admin.initializeApp()

setGlobalOptions({ region: 'asia-southeast1' })

interface LineProfile {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
}

function fetchLineProfile(accessToken: string): Promise<LineProfile> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      path: '/v2/profile',
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode === 200) {
            resolve(parsed as LineProfile)
          } else {
            // LINE API คืน error เช่น token หมดอายุ
            reject(new HttpsError(
              'unauthenticated',
              `LINE API returned ${res.statusCode}: ${parsed.message ?? data}`
            ))
          }
        } catch {
          reject(new HttpsError('internal', `Failed to parse LINE response: ${data}`))
        }
      })
    })

    req.on('error', (err: Error) => {
      reject(new HttpsError('internal', `Network error calling LINE API: ${err.message}`))
    })

    req.setTimeout(10000, () => {
      req.destroy()
      reject(new HttpsError('deadline-exceeded', 'LINE API request timed out'))
    })

    req.end()
  })
}

export const lineAuth = onCall(
  {
    // CORS: อนุญาต Firebase Hosting domain
    cors: [
      'https://livetubex-admin.web.app',
      'https://livetubex-admin.firebaseapp.com',
      /localhost/,
    ],
  },
  async (request) => {
    // ── 1. Validate input ──────────────────────────────────────────────────
    const { accessToken } = (request.data ?? {}) as { accessToken?: string }

    if (!accessToken || typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw new HttpsError('invalid-argument', 'accessToken is required and must be a non-empty string')
    }

    // ── 2. ยืนยัน LINE Access Token ────────────────────────────────────────
    let lineProfile: LineProfile
    try {
      lineProfile = await fetchLineProfile(accessToken.trim())
    } catch (err) {
      // re-throw HttpsError ที่สร้างใน fetchLineProfile
      if (err instanceof HttpsError) throw err
      throw new HttpsError('unauthenticated', 'Failed to verify LINE access token')
    }

    if (!lineProfile.userId) {
      throw new HttpsError('unauthenticated', 'LINE profile did not return userId')
    }

    // ── 3. ออก Firebase Custom Token ──────────────────────────────────────
    // NOTE: Service Account ต้องมี role "Service Account Token Creator"
    // ไปเพิ่มที่ https://console.cloud.google.com/iam-admin/iam
    let firebaseToken: string
    try {
      firebaseToken = await admin.auth().createCustomToken(lineProfile.userId, {
        lineUser: true,
        displayName: lineProfile.displayName,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // ช่วย debug: ถ้า error เกี่ยวกับ IAM จะขึ้น PERMISSION_DENIED
      if (msg.includes('PERMISSION_DENIED') || msg.includes('iam.serviceAccounts.signBlob')) {
        throw new HttpsError(
          'permission-denied',
          'Service account is missing "Service Account Token Creator" role. ' +
          'Go to https://console.cloud.google.com/iam-admin/iam and add the role.'
        )
      }
      throw new HttpsError('internal', `createCustomToken failed: ${msg}`)
    }

    return {
      firebaseToken,
      lineUserId: lineProfile.userId,
      displayName: lineProfile.displayName,
      pictureUrl: lineProfile.pictureUrl ?? '',
    }
  }
)
