import { Document, Page, View, Image } from '@react-pdf/renderer'
import { Text } from './PdfText'
import LogoSvg from './LogoSvg'
import { styles } from './styles'
import { bahtText } from '../calc'
import type { CompanySettings, PaymentMethod, Receipt } from '../../types'

interface Props {
  receipt: Receipt
  company: CompanySettings
  invoiceDocNumber?: string
  taxInvoiceDocNumber?: string
}

const methodLabel: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  cheque: 'เช็ค',
  credit_card: 'บัตรเครดิต',
  other: 'อื่นๆ',
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

export default function ReceiptPdf({ receipt, company, invoiceDocNumber, taxInvoiceDocNumber }: Props) {
  const isVoid = receipt.status === 'void'
  const netReceived = receipt.amount - (receipt.whtAmount ?? 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isVoid && <Text style={styles.voidWatermark}>VOID</Text>}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <View style={{ marginBottom: 6 }}>
              <LogoSvg width={140} />
            </View>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.nameEn ? <Text style={styles.companyInfo}>{company.nameEn}</Text> : null}
            <Text style={styles.companyInfo}>เลขประจำตัวผู้เสียภาษี: {company.taxId} ({company.branch})</Text>
            <Text style={styles.companyInfo}>{company.address}</Text>
            {company.phone ? <Text style={styles.companyInfo}>โทร. {company.phone}</Text> : null}
          </View>

          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>ใบเสร็จรับเงิน</Text>
            <Text style={styles.docTitleSecondary}>RECEIPT (ต้นฉบับ)</Text>
            <Text style={styles.docMeta}>
              <Text style={styles.docMetaLabel}>เลขที่: </Text>{receipt.docNumber}
            </Text>
            <Text style={styles.docMeta}>
              <Text style={styles.docMetaLabel}>วันที่: </Text>{formatThaiDate(receipt.issueDate)}
            </Text>
            {invoiceDocNumber && (
              <Text style={styles.docMeta}>
                <Text style={styles.docMetaLabel}>อ้างอิงใบแจ้งหนี้: </Text>{invoiceDocNumber}
              </Text>
            )}
            {taxInvoiceDocNumber && (
              <Text style={styles.docMeta}>
                <Text style={styles.docMetaLabel}>อ้างอิงใบกำกับภาษี: </Text>{taxInvoiceDocNumber}
              </Text>
            )}
          </View>
        </View>

        {/* Customer */}
        <View style={styles.customerBlock}>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerLabel}>ได้รับเงินจาก</Text>
            <Text style={styles.customerName}>{receipt.customerSnapshot.name}</Text>
            <Text style={styles.customerLine}>{receipt.customerSnapshot.address}</Text>
          </View>
          {receipt.customerSnapshot.taxId ? (
            <View style={{ width: 200 }}>
              <Text style={styles.customerLabel}>เลขประจำตัวผู้เสียภาษี</Text>
              <Text style={styles.customerLine}>{receipt.customerSnapshot.taxId}</Text>
              {receipt.customerSnapshot.branch ? (
                <Text style={styles.customerLine}>{receipt.customerSnapshot.branch}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Amount big box */}
        <View style={styles.amountBigBox}>
          <Text style={styles.amountBigLabel}>จำนวนเงินที่ได้รับสุทธิ</Text>
          <Text style={styles.amountBigValue}>฿ {formatMoney(netReceived)}</Text>
          <Text style={styles.amountText}>({bahtText(netReceived)})</Text>
        </View>

        {/* Detail grid */}
        <View style={styles.detailGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>วิธีรับชำระ</Text>
            <Text style={styles.detailValue}>{methodLabel[receipt.paymentMethod] ?? receipt.paymentMethod}</Text>
          </View>
          {receipt.paymentRef && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>เลขอ้างอิง</Text>
              <Text style={styles.detailValue}>{receipt.paymentRef}</Text>
            </View>
          )}
          {receipt.bankAccountReceived && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>บัญชีที่รับเงิน</Text>
              <Text style={styles.detailValue}>{receipt.bankAccountReceived}</Text>
            </View>
          )}
        </View>

        {/* Amount breakdown */}
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>จำนวนที่รับ (gross)</Text>
            <Text style={styles.totalValue}>{formatMoney(receipt.amount)}</Text>
          </View>
          {receipt.whtAmount && receipt.whtAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#dc2626' }]}>
                หัก ณ ที่จ่าย{receipt.whtCertReceived ? ' (มี 50 ทวิ)' : ''}
              </Text>
              <Text style={[styles.totalValue, { color: '#dc2626' }]}>- {formatMoney(receipt.whtAmount)}</Text>
            </View>
          ) : null}
          <View style={styles.netPayableRow}>
            <Text style={styles.netPayableLabel}>เงินสุทธิที่รับเข้าบัญชี</Text>
            <Text style={styles.netPayableValue}>{formatMoney(netReceived)}</Text>
          </View>
        </View>

        {receipt.notes ? (
          <View style={[styles.notesBox, { marginTop: 12 }]}>
            <Text style={styles.notesLabel}>หมายเหตุ</Text>
            <Text style={styles.notesText}>{receipt.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>ผู้รับเงิน / ผู้ตรวจสอบ</Text>
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
