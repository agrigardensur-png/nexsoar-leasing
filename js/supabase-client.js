import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

/* ── CONFIGURACIÓN ── */
export const SUPABASE_URL = 'https://rqrzurpsvqglgtfbhxsw.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_g-6JXdSTsY8Qo9oMFHJZyw_SkdkNtxR'
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
export const EDGE_URL = SUPABASE_URL + '/functions/v1/admin-users'

/* ── ESTADO LOCAL (caché) ── */
export let S = { groups: [], machines: [], customers: [], maintenances: [], rentals: [], pagares: [] }
export let ME = null
export let currentProfile = null
export let _modalClose = null

export function setME(user) { ME = user }
export function setCurrentProfile(prof) { currentProfile = prof }
export function setModalClose(fn) { _modalClose = fn }

/* ── HELPERS DE FORMATO ── */
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const fmtMoney = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtDate = d => {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
export const addMonths = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10) }

/* ── MAPPERS DB → Caché ── */
export const mapGroup = r => ({ id: r.id, name: r.name, description: r.description || '' })
export const mapMachine = r => ({
  id: r.id, name: r.name, groupId: r.group_id || null,
  brand: r.brand || '', model: r.model || '', serial: r.serial || '',
  purchaseCost: Number(r.purchase_cost) || 0, salePrice: Number(r.sale_price) || 0,
  purchaseDate: r.purchase_date || '',
  dailyPrice: Number(r.daily_price) || 0, weeklyPrice: Number(r.weekly_price) || 0, monthlyPrice: Number(r.monthly_price) || 0,
  status: r.status || 'disponible', rentalCount: r.rental_count || 0
})
export const mapCustomer = r => ({
  id: r.id, name: r.name, phone: r.phone || '', email: r.email || '',
  address: r.address || '', idNumber: r.id_number || '',
  ineDoc: r.ine_doc_path ? { id: 'ine_' + r.id, name: r.ine_doc_name || 'INE', path: r.ine_doc_path } : null,
  addressDoc: r.address_doc_path ? { id: 'addr_' + r.id, name: r.address_doc_name || 'Comprobante', path: r.address_doc_path } : null,
})
export const mapMaint = r => ({
  id: r.id, machineId: r.machine_id, date: r.date,
  type: r.type || 'preventivo', cost: Number(r.cost) || 0, description: r.description || ''
})
export const mapRental = r => ({
  id: r.id, machineId: r.machine_id, customerId: r.customer_id,
  rentalType: r.rental_type, qty: r.qty,
  unitPrice: Number(r.unit_price) || 0, totalCharged: Number(r.total_charged) || 0,
  amountPaid: Number(r.amount_paid != null ? r.amount_paid : (r.amountPaid != null ? r.amountPaid : (r.status === 'devuelta' ? r.total_charged : 0))) || 0,
  startDate: r.start_date, expectedReturn: r.expected_return, actualReturn: r.actual_return || null,
  status: r.status || 'activa', deposit: Number(r.deposit) || 0, pagareId: r.pagare_id || null,
  signatureData: r.signature_data || r.signatureData || null
})
export const mapPagare = r => ({
  id: r.id, folio: r.folio, rentalId: r.rental_id,
  machineId: r.machine_id, customerId: r.customer_id,
  machineValue: Number(r.machine_value) || 0, rentalType: r.rental_type,
  unitPrice: Number(r.unit_price) || 0, qty: r.qty,
  totalCharged: Number(r.total_charged) || 0,
  issueDate: r.issue_date, expectedReturn: r.expected_return, deposit: Number(r.deposit) || 0,
  signatureData: r.signature_data || r.signatureData || null
})
