import { Document, Page, View, Image } from '@react-pdf/renderer'
import { Text } from './PdfText'
import LogoSvg from './LogoSvg'
import { styles } from './styles'
import { bahtText, calcTotals } from '../calc'
import type {
  CompanySettings, CustomerSnapshot, DocumentItem, Quotation, Invoice, TaxInvoice,
} from '../../types'

interface BaseDocument {
  docNumber: string
  customerSnapshot: CustomerSnapshot
  issueDate: string
  items: DocumentItem[]
  subtotal: number
  discountTotal: number
  vatRate: number
  vatAmount: number
  grandTotal: number
  whtRate?: number
  whtAmount?: number
  netPayable?: number
  notes?: string
}

type DocType = 'quotation' | 'invoice' | 'taxInvoice'

interface Props {
  type: DocType
  doc: Quotation | Invoice | TaxInvoice
  company: CompanySettings
  isVoid?: boolean
}

const titleByType: Record<DocType, { th: string; en: string }> = {
  quotation:  { th: 'ใบเสนอราคา',   en: 'QUOTATION' },
  invoice:    { th: 'ใบแจ้งหนี้',    en: 'INVOICE' },
  taxInvoice: { th: 'ใบกำกับภาษี',  en: 'TAX INVOICE' },
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

export default function DocumentPdf({ type, doc, company, isVoid }: Props) {
  const title = titleByType[type]
  const totals = calcTotals({
    items: doc.items,
    discountTotal: doc.discountTotal,
    vatRate: doc.vatRate,
    whtRate: doc.whtRate,
  })

  const quotation = type === 'quotation' ? (doc as Quotation) : null
  const invoice = type === 'invoice' ? (doc as Invoice) : null

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isVoid && <Text style={styles.voidWatermark}>VOID</Text>}

        {/* ─── Header ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <View style={{ marginBottom: 6 }}>
              <LogoSvg width={140} />
            </View>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.nameEn ? <Text style={styles.companyInfo}>{company.nameEn}</Text> : null}
            <Text style={styles.companyInfo}>เลขประจำตัวผู้เสียภาษี: {company.taxId} ({company.branch})</Text>
            <Text style={styles.companyInfo}>{company.address}</Text>
            {company.phone ? <Text style={styles.companyInfo}>โทร. {company.phone}{company.email ? `  อีเมล: ${company.email}` : ''}</Text> : null}
          </View>

          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>{title.th}</Text>
            <Text style={styles.docTitleSecondary}>{title.en} (ต้นฉบับ)</Text>
            <Text style={styles.docMeta}>
              <Text style={styles.docMetaLabel}>เลขที่: </Text>{doc.docNumber}
            </Text>
            <Text style={styles.docMeta}>
              <Text style={styles.docMetaLabel}>วันที่: </Text>{formatThaiDate(doc.issueDate)}
            </Text>
            {quotation?.validUntil && (
              <Text style={styles.docMeta}>
                <Text style={styles.docMetaLabel}>ใช้ได้ถึง: </Text>{formatThaiDate(quotation.validUntil)}
              </Text>
            )}
            {invoice?.dueDate && (
              <Text style={styles.docMeta}>
                <Text style={styles.docMetaLabel}>ครบกำหนด: </Text>{formatThaiDate(invoice.dueDate)}
              </Text>
            )}
          </View>
        </View>

        {/* ─── Customer ───────────────────────────────────────────── */}
        <View style={styles.customerBlock}>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerLabel}>ลูกค้า</Text>
            <Text style={styles.customerName}>{doc.customerSnapshot.name}</Text>
            <Text style={styles.customerLine}>{doc.customerSnapshot.address}</Text>
            {doc.customerSnapshot.contactPerson ? (
              <Text style={styles.customerLine}>ผู้ติดต่อ: {doc.customerSnapshot.contactPerson}</Text>
            ) : null}
          </View>
          {doc.customerSnapshot.taxId ? (
            <View style={{ width: 200 }}>
              <Text style={styles.customerLabel}>เลขประจำตัวผู้เสียภาษี</Text>
              <Text style={styles.customerLine}>{doc.customerSnapshot.taxId}</Text>
              {doc.customerSnapshot.branch ? (
                <Text style={styles.customerLine}>{doc.customerSnapshot.branch}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ─── Items table ─────────────────────────────────────────── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colNo]}>#</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>รายการ</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>จำนวน</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>ราคา/หน่วย</Text>
            <Text style={[styles.tableHeaderCell, styles.colDiscount]}>ส่วนลด</Text>
            <Text style={[styles.tableHeaderCell, styles.colAmount]}>จำนวนเงิน</Text>
          </View>
          {doc.items.map((item, idx) => (
            <View key={idx} style={[styles.tableRow, idx === doc.items.length - 1 ? styles.tableRowLast : {}]}>
              <Text style={[styles.tableCell, styles.colNo]}>{idx + 1}</Text>
              <Text style={[styles.tableCell, styles.colDesc]}>{item.description}</Text>
              <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.tableCell, styles.colPrice]}>{formatMoney(item.unitPrice)}</Text>
              <Text style={[styles.tableCell, styles.colDiscount]}>{item.discount ? formatMoney(item.discount) : '-'}</Text>
              <Text style={[styles.tableCell, styles.colAmount]}>{formatMoney(item.amount)}</Text>
            </View>
          ))}
        </View>

        {/* ─── Totals + Notes ──────────────────────────────────────── */}
        <View style={styles.totalsWrapper}>
          <View style={styles.totalsLeft}>
            {doc.notes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>หมายเหตุ</Text>
                <Text style={styles.notesText}>{doc.notes}</Text>
              </View>
            ) : null}

            {/* Bank accounts — show only on invoice */}
            {type === 'invoice' && company.bankAccounts && company.bankAccounts.length > 0 ? (
              <View style={styles.bankBox}>
                <Text style={styles.bankTitle}>ชำระเงินโดยการโอนเข้าบัญชี:</Text>
                {company.bankAccounts.map((b, i) => (
                  <View key={i} style={{ marginBottom: 4 }}>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>ธนาคาร:</Text>
                      <Text style={styles.bankValue}>{b.bankName} {b.branch ? `(${b.branch})` : ''}</Text>
                    </View>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>เลขบัญชี:</Text>
                      <Text style={styles.bankValue}>{b.accountNo}</Text>
                    </View>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>ชื่อบัญชี:</Text>
                      <Text style={styles.bankValue}>{b.accountName}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>ยอดรวม</Text>
              <Text style={styles.totalValue}>{formatMoney(totals.subtotal)}</Text>
            </View>
            {totals.discountTotal > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>ส่วนลดท้ายเอกสาร</Text>
                <Text style={styles.totalValue}>- {formatMoney(totals.discountTotal)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>ยอดก่อน VAT</Text>
              <Text style={styles.totalValue}>{formatMoney(totals.baseBeforeVat)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>VAT {totals.vatRate}%</Text>
              <Text style={styles.totalValue}>{formatMoney(totals.vatAmount)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>รวมทั้งสิ้น</Text>
              <Text style={styles.grandTotalValue}>{formatMoney(totals.grandTotal)}</Text>
            </View>
            {totals.whtAmount && totals.whtAmount > 0 ? (
              <>
                <View style={[styles.totalRow, { marginTop: 4 }]}>
                  <Text style={styles.totalLabel}>หัก ณ ที่จ่าย {totals.whtRate}%</Text>
                  <Text style={[styles.totalValue, { color: '#dc2626' }]}>- {formatMoney(totals.whtAmount)}</Text>
                </View>
                <View style={styles.netPayableRow}>
                  <Text style={styles.netPayableLabel}>ยอดที่ต้องชำระสุทธิ</Text>
                  <Text style={styles.netPayableValue}>{formatMoney(totals.netPayable ?? 0)}</Text>
                </View>
              </>
            ) : null}

            {/* Bahttext */}
            <Text style={{ fontSize: 8, color: '#666', marginTop: 8, fontStyle: 'italic' }}>
              ({bahtText(totals.netPayable ?? totals.grandTotal)})
            </Text>
          </View>
        </View>

        {/* ─── Footer / signatures ────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>ผู้รับเอกสาร / ผู้ตรวจสอบ</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>__________ / __________ / __________</Text>
            <Text style={styles.signatureLabel}>วันที่</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>ผู้มีอำนาจลงนาม</Text>
            {company.signaturePath ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.signatureImage} src={company.signaturePath} />
            ) : null}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>({company.name})</Text>
            <Text style={styles.signatureLabel}>__________ / __________ / __________</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
