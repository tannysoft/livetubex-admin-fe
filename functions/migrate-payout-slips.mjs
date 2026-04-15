/**
 * migrate-payout-slips.mjs
 *
 * ย้ายไฟล์ payoutSlips จาก path เดิม payoutSlips/{lineUserId}/...
 * ไปที่ path ใหม่ payoutSlips/{freelancerId}/...
 * และอัปเดต payoutSlipPath ใน Firestore payments
 *
 * วิธีรัน:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/service-account.json node migrate-payout-slips.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=~/service-account.json node migrate-payout-slips.mjs --delete
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { readFileSync } from 'fs'
import { homedir } from 'os'

const DRY_RUN  = !process.argv.includes('--delete')
const BUCKET   = 'livetubex-admin.firebasestorage.app'

// ── Init ─────────────────────────────────────────────────────────────────────
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ?? `${homedir()}/service-account.json`
const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount), storageBucket: BUCKET })
}

const db     = getFirestore()
const bucket = getStorage().bucket()

// ── Helper ────────────────────────────────────────────────────────────────────
async function copyFile(srcPath, dstPath) {
  const src = bucket.file(srcPath)
  const dst = bucket.file(dstPath)
  await src.copy(dst)
  console.log(`  copy: ${srcPath} → ${dstPath}`)
}

async function deleteFile(filePath) {
  await bucket.file(filePath).delete()
  console.log(`  delete: ${filePath}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== migrate-payout-slips (${DRY_RUN ? 'DRY RUN' : 'LIVE --delete'}) ===\n`)

  // 1. โหลด freelancers ทั้งหมด → map lineUserId → doc
  const freelancerSnap = await db.collection('freelancers').get()
  const byLineId = new Map() // lineUserId → { id, lineUserId }
  for (const doc of freelancerSnap.docs) {
    const d = doc.data()
    if (d.lineUserId) {
      byLineId.set(d.lineUserId, { id: doc.id, lineUserId: d.lineUserId })
    }
  }
  console.log(`freelancers loaded: ${byLineId.size}`)

  // 2. โหลด payments ที่มี payoutSlipPath
  const paymentSnap = await db.collection('payments')
    .where('payoutSlipPath', '!=', '')
    .get()
  console.log(`payments with payoutSlipPath: ${paymentSnap.size}\n`)

  let migratedCount = 0
  let alreadyNewCount = 0
  let errorCount = 0

  for (const payDoc of paymentSnap.docs) {
    const payment = payDoc.data()
    const oldPath = payment.payoutSlipPath
    if (!oldPath) continue

    // path รูปแบบ: payoutSlips/{folderId}/{filename}
    const parts = oldPath.split('/')
    if (parts.length < 3 || parts[0] !== 'payoutSlips') {
      console.log(`[SKIP] unexpected path: ${oldPath}`)
      continue
    }

    const folderId = parts[1]
    const fileName = parts.slice(2).join('/')

    // ตรวจว่า folderId เป็น lineUserId (เก่า) หรือ freelancerId (ใหม่) แล้ว
    if (byLineId.has(folderId)) {
      // เก่า: folderId คือ lineUserId
      const freelancer = byLineId.get(folderId)
      const newPath = `payoutSlips/${freelancer.id}/${fileName}`

      console.log(`[MIGRATE] payment ${payDoc.id}`)
      console.log(`  old: ${oldPath}`)
      console.log(`  new: ${newPath}`)

      if (!DRY_RUN) {
        try {
          // copy ไฟล์
          await copyFile(oldPath, newPath)
          // อัปเดต Firestore
          await payDoc.ref.update({ payoutSlipPath: newPath })
          console.log(`  firestore: updated payoutSlipPath`)
          // ลบไฟล์เก่า
          await deleteFile(oldPath)
          migratedCount++
        } catch (err) {
          console.error(`  ERROR: ${err.message}`)
          errorCount++
        }
      } else {
        migratedCount++
      }
    } else {
      // folderId ไม่ใช่ lineUserId → น่าจะเป็น freelancerId แล้ว (ใหม่)
      console.log(`[SKIP already new] payment ${payDoc.id}: ${oldPath}`)
      alreadyNewCount++
    }

    console.log()
  }

  console.log('=== Summary ===')
  console.log(`  to migrate:   ${migratedCount}`)
  console.log(`  already new:  ${alreadyNewCount}`)
  console.log(`  errors:       ${errorCount}`)
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — ไม่มีการเปลี่ยนแปลงจริง')
    console.log('รันอีกครั้งด้วย --delete เพื่อ migrate จริง')
  } else {
    console.log('\n✅ Done')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
