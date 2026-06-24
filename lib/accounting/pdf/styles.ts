import { StyleSheet } from '@react-pdf/renderer'

export const BRAND_RED = '#f73727'
export const TEXT = '#1a1a1a'
export const MUTED = '#666666'
export const BORDER = '#d4d4d4'
export const BG_GRAY = '#f5f5f5'

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Sarabun',
    fontSize: 9,
    color: TEXT,
    padding: 30,
    paddingBottom: 60,
  },

  // ─── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  companyBlock: { flex: 1 },
  companyName: { fontSize: 13, fontWeight: 'bold', color: BRAND_RED, marginBottom: 2 },
  companyInfo: { fontSize: 8, lineHeight: 1.4, color: MUTED },

  docTitleBlock: { alignItems: 'flex-end', width: 200 },
  docTitle: { fontSize: 18, fontWeight: 'bold', color: TEXT, marginBottom: 4 },
  docTitleSecondary: { fontSize: 9, color: MUTED, marginBottom: 6 },
  docMeta: { fontSize: 9, color: TEXT, marginBottom: 2 },
  docMetaLabel: { color: MUTED },

  // ─── Customer ──────────────────────────────────────────────────────
  customerBlock: {
    backgroundColor: BG_GRAY,
    padding: 10,
    borderRadius: 4,
    marginBottom: 14,
    flexDirection: 'row',
  },
  customerLabel: { fontSize: 8, color: MUTED, marginBottom: 3, textTransform: 'uppercase' },
  customerName: { fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  customerLine: { fontSize: 9, color: TEXT, lineHeight: 1.4 },

  // ─── Items table ───────────────────────────────────────────────────
  table: { marginBottom: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 4 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BG_GRAY,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableHeaderCell: { fontSize: 8, fontWeight: 'bold', color: MUTED, textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableCell: { fontSize: 9, color: TEXT },

  colNo: { width: 20, textAlign: 'center' },
  colDesc: { flex: 1, paddingRight: 6 },
  colQty: { width: 50, textAlign: 'right' },
  colPrice: { width: 70, textAlign: 'right' },
  colDiscount: { width: 60, textAlign: 'right' },
  colAmount: { width: 80, textAlign: 'right' },

  // ─── Totals ────────────────────────────────────────────────────────
  totalsWrapper: { flexDirection: 'row', marginTop: 4, marginBottom: 12 },
  totalsLeft: { flex: 1, paddingRight: 12 },
  totalsBox: { width: 260, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totalLabel: { fontSize: 9, color: MUTED },
  totalValue: { fontSize: 9, color: TEXT },
  totalDivider: { borderTopWidth: 0.5, borderTopColor: BORDER, marginVertical: 3 },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: BORDER },
  grandTotalLabel: { fontSize: 11, fontWeight: 'bold', color: TEXT },
  grandTotalValue: { fontSize: 12, fontWeight: 'bold', color: BRAND_RED },
  netPayableRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  netPayableLabel: { fontSize: 10, fontWeight: 'bold', color: TEXT },
  netPayableValue: { fontSize: 11, fontWeight: 'bold', color: '#15803d' },

  // ─── Notes ─────────────────────────────────────────────────────────
  notesBox: {
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
    minHeight: 36,
  },
  notesLabel: { fontSize: 8, color: MUTED, marginBottom: 3, textTransform: 'uppercase' },
  notesText: { fontSize: 9, color: TEXT, lineHeight: 1.4 },

  // ─── Bank accounts ─────────────────────────────────────────────────
  bankBox: { marginBottom: 10 },
  bankTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  bankRow: { flexDirection: 'row', marginBottom: 2 },
  bankLabel: { fontSize: 8.5, color: MUTED, width: 60 },
  bankValue: { fontSize: 8.5, color: TEXT },

  // ─── Footer / signature ────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: { width: 180, alignItems: 'center' },
  signatureLine: { borderBottomWidth: 0.5, borderBottomColor: '#000', width: '100%', height: 1, marginTop: 28, marginBottom: 4 },
  signatureLabel: { fontSize: 8, color: MUTED },
  signatureName: { fontSize: 8.5, color: TEXT, marginTop: 2 },
  signatureImage: { width: 80, height: 40, marginTop: 8 },

  // ─── Watermark ─────────────────────────────────────────────────────
  voidWatermark: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 90,
    color: 'rgba(220, 38, 38, 0.15)',
    fontWeight: 'bold',
    transform: 'rotate(-25deg)',
  },

  // ─── Receipt-specific ──────────────────────────────────────────────
  amountBigBox: {
    borderWidth: 1.5,
    borderColor: BRAND_RED,
    borderRadius: 6,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  amountBigLabel: { fontSize: 9, color: MUTED, marginBottom: 4 },
  amountBigValue: { fontSize: 22, fontWeight: 'bold', color: BRAND_RED },
  amountText: { fontSize: 10, color: TEXT, marginTop: 6, fontStyle: 'italic' },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  detailItem: { width: '50%', marginBottom: 8 },
  detailLabel: { fontSize: 8, color: MUTED, marginBottom: 1 },
  detailValue: { fontSize: 10, color: TEXT },

  // ─── Generic helpers ───────────────────────────────────────────────
  flexRow: { flexDirection: 'row' },
  textBold: { fontWeight: 'bold' },
  textRight: { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
})
