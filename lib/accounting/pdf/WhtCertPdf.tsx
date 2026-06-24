import { Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { styles, BRAND_RED, MUTED } from './styles'
import { bahtText, round2 } from '../calc'
import { INCOME_TYPES, deriveIncomeTypeCode } from '../wht-cert'
import type { CompanySettings, Expense } from '../../types'

interface Props {
  expense: Expense
  company: CompanySettings
  copies?: number          // กี่ฉบับใน 1 หน้า — default 2
}

function formatThaiDate(ymd: string): string {
  if (!ymd) return ''
  const d = new Date(ymd + 'T00:00:00')
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const COPY_LABELS = [
  'ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมแบบแสดงรายการ)',
  'ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)',
  'ฉบับที่ 3 (สำหรับผู้จ่ายเงิน เก็บไว้เป็นหลักฐาน)',
  'ฉบับที่ 4 (สำหรับผู้จ่ายเงิน เก็บไว้เป็นหลักฐาน)',
]

function Tick({ checked }: { checked: boolean }) {
  return (
    <View style={{
      width: 9, height: 9, borderWidth: 0.5, borderColor: '#000',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 4,
    }}>
      {checked && <Text style={{ fontSize: 8, lineHeight: 0.9 }}>✓</Text>}
    </View>
  )
}

function CertBlock({ expense, company, copyLabel }: { expense: Expense; company: CompanySettings; copyLabel: string }) {
  const selectedCode = deriveIncomeTypeCode(expense.categoryName)
  const gross = expense.amount
  const wht = expense.whtAmount ?? 0
  const whtRate = expense.whtRate ?? 0

  const docNumber = expense.code

  return (
    <View style={{
      borderWidth: 0.7, borderColor: '#000', padding: 10, marginBottom: 4,
    }}>
      {/* Top: copy label */}
      <Text style={{ fontSize: 7, color: MUTED, textAlign: 'right', marginBottom: 4 }}>{copyLabel}</Text>

      {/* Title */}
      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: 'bold' }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</Text>
        <Text style={{ fontSize: 8, color: MUTED }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</Text>
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>เล่มที่ ............... เลขที่ {docNumber}</Text>
      </View>

      {/* Payer */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        <Text style={{ fontSize: 8.5, fontWeight: 'bold', width: 75 }}>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย:</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9 }}>{company.name}</Text>
          <Text style={{ fontSize: 8, color: MUTED }}>{company.address}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontSize: 8 }}>เลขประจำตัวผู้เสียภาษีอากร: <Text style={{ fontWeight: 'bold' }}>{company.taxId}</Text></Text>
            <Text style={{ fontSize: 8 }}>({company.branch})</Text>
          </View>
        </View>
      </View>

      {/* Payee */}
      <View style={{ flexDirection: 'row', marginBottom: 4, paddingTop: 4, borderTopWidth: 0.3, borderTopColor: '#aaa' }}>
        <Text style={{ fontSize: 8.5, fontWeight: 'bold', width: 75 }}>ผู้ถูกหักภาษี ณ ที่จ่าย:</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9 }}>{expense.vendorSnapshot?.name ?? '(ไม่ระบุ)'}</Text>
          {expense.vendorSnapshot?.taxId && (
            <Text style={{ fontSize: 8 }}>
              เลขประจำตัวผู้เสียภาษีอากร: <Text style={{ fontWeight: 'bold' }}>{expense.vendorSnapshot.taxId}</Text>
            </Text>
          )}
        </View>
      </View>

      {/* Tax form type checkboxes */}
      <View style={{ flexDirection: 'row', marginBottom: 4, paddingTop: 4, borderTopWidth: 0.3, borderTopColor: '#aaa', alignItems: 'center' }}>
        <Text style={{ fontSize: 8, marginRight: 6 }}>แบบยื่นรายการภาษี:</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
          <Tick checked={expense.sourceType === 'freelancer_payment'} />
          <Text style={{ fontSize: 8 }}>ภงด.1 / ภงด.1ก / ภงด.2 / ภงด.3</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Tick checked={expense.sourceType !== 'freelancer_payment'} />
          <Text style={{ fontSize: 8 }}>ภงด.53</Text>
        </View>
      </View>

      {/* Income types table */}
      <View style={{ borderWidth: 0.4, borderColor: '#000', marginTop: 2 }}>
        <View style={{ flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: '#000', backgroundColor: '#f5f5f5' }}>
          <Text style={{ flex: 1, fontSize: 8, fontWeight: 'bold', padding: 3 }}>ประเภทเงินได้พึงประเมินที่จ่าย</Text>
          <Text style={{ width: 75, fontSize: 8, fontWeight: 'bold', padding: 3, textAlign: 'center', borderLeftWidth: 0.3, borderLeftColor: '#000' }}>วัน เดือน ปี ที่จ่าย</Text>
          <Text style={{ width: 80, fontSize: 8, fontWeight: 'bold', padding: 3, textAlign: 'center', borderLeftWidth: 0.3, borderLeftColor: '#000' }}>จำนวนเงินที่จ่าย</Text>
          <Text style={{ width: 60, fontSize: 8, fontWeight: 'bold', padding: 3, textAlign: 'center', borderLeftWidth: 0.3, borderLeftColor: '#000' }}>ภาษีที่หัก</Text>
        </View>

        {INCOME_TYPES.map((t, i) => {
          const isSelected = t.code === selectedCode
          return (
            <View key={t.code} style={{ flexDirection: 'row', borderBottomWidth: 0.2, borderBottomColor: '#bbb' }}>
              <View style={{ flex: 1, padding: 3, flexDirection: 'row', alignItems: 'center' }}>
                <Tick checked={isSelected} />
                <Text style={{ fontSize: 7.5 }}>{i + 1}. {t.label}</Text>
              </View>
              <Text style={{ width: 75, fontSize: 8, padding: 3, textAlign: 'center', borderLeftWidth: 0.3, borderLeftColor: '#000' }}>
                {isSelected ? formatThaiDate(expense.date) : ''}
              </Text>
              <Text style={{ width: 80, fontSize: 8, padding: 3, textAlign: 'right', borderLeftWidth: 0.3, borderLeftColor: '#000' }}>
                {isSelected ? formatMoney(gross) : ''}
              </Text>
              <Text style={{ width: 60, fontSize: 8, padding: 3, textAlign: 'right', borderLeftWidth: 0.3, borderLeftColor: '#000' }}>
                {isSelected ? formatMoney(wht) : ''}
              </Text>
            </View>
          )
        })}

        {/* Total row */}
        <View style={{ flexDirection: 'row', backgroundColor: '#f5f5f5' }}>
          <Text style={{ flex: 1, fontSize: 8, fontWeight: 'bold', padding: 3 }}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</Text>
          <Text style={{ width: 75, fontSize: 8, padding: 3, textAlign: 'center', borderLeftWidth: 0.3, borderLeftColor: '#000' }}></Text>
          <Text style={{ width: 80, fontSize: 8, fontWeight: 'bold', padding: 3, textAlign: 'right', borderLeftWidth: 0.3, borderLeftColor: '#000' }}>{formatMoney(gross)}</Text>
          <Text style={{ width: 60, fontSize: 8, fontWeight: 'bold', padding: 3, textAlign: 'right', borderLeftWidth: 0.3, borderLeftColor: '#000', color: BRAND_RED }}>{formatMoney(wht)}</Text>
        </View>
      </View>

      <Text style={{ fontSize: 7.5, marginTop: 3, fontStyle: 'italic' }}>
        จำนวนเงินภาษีที่หักนำส่ง (เป็นตัวอักษร): {bahtText(round2(wht))}
      </Text>

      {/* Withholding type */}
      <View style={{ flexDirection: 'row', marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 8, marginRight: 6 }}>ผู้จ่ายเงิน:</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
          <Tick checked />
          <Text style={{ fontSize: 8 }}>หักภาษี ณ ที่จ่าย</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
          <Tick checked={false} />
          <Text style={{ fontSize: 8 }}>ออกภาษีให้ตลอดไป</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Tick checked={false} />
          <Text style={{ fontSize: 8 }}>ออกภาษีให้ครั้งเดียว</Text>
        </View>
        <Text style={{ fontSize: 8, marginLeft: 'auto' }}>อัตราภาษี: <Text style={{ fontWeight: 'bold' }}>{whtRate}%</Text></Text>
      </View>

      {/* Signature */}
      <View style={{ flexDirection: 'row', marginTop: 10, justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 7.5, color: MUTED }}>
          ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
        </Text>
        <View style={{ alignItems: 'center', width: 200 }}>
          {company.signaturePath ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={{ width: 60, height: 28, marginBottom: -8 }} src={company.signaturePath} />
          ) : null}
          <Text style={{ fontSize: 8, borderTopWidth: 0.5, borderTopColor: '#000', paddingTop: 2, width: '100%', textAlign: 'center' }}>
            (ลายมือชื่อผู้จ่ายเงิน)
          </Text>
          <Text style={{ fontSize: 7.5, marginTop: 1 }}>วันที่ {formatThaiDate(expense.date)}</Text>
        </View>
      </View>
    </View>
  )
}

export default function WhtCertPdf({ expense, company, copies = 2 }: Props) {
  // 50 ทวิ ออกแบบหลายฉบับให้หนึ่งหน้า — A4 fits 2 copies
  return (
    <Document>
      <Page size="A4" style={{ ...styles.page, paddingTop: 20, paddingBottom: 20 }}>
        {Array.from({ length: Math.min(copies, COPY_LABELS.length) }).map((_, idx) => (
          <CertBlock key={idx} expense={expense} company={company} copyLabel={COPY_LABELS[idx]} />
        ))}
      </Page>
    </Document>
  )
}
