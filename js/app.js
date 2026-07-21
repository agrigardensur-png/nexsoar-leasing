import {
  sb, SUPABASE_URL, EDGE_URL, S, ME, currentProfile, _modalClose,
  setME, setCurrentProfile, setModalClose,
  todayISO, fmtMoney, fmtDate, daysBetween, addDays, addMonths,
  mapGroup, mapMachine, mapCustomer, mapMaint, mapRental, mapPagare,
  setLocalPaid, setLocalSig, getLocalPaid, getLocalSig
} from './supabase-client.js'

/* ── NOMBRE DEL ARRENDADOR CONSTANTE ── */
const DEFAULT_ARRENDADOR_NAME = 'Daniel Alejandro Ramirez Gonzalez'

/* ── LOADING ── */
const showLoading = (msg = 'Procesando…') => {
  const el = document.getElementById('loadingMsg')
  if (el) el.textContent = msg
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) overlay.classList.add('show')
}
const hideLoading = () => {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) overlay.classList.remove('show')
}

/* ── TOAST ── */
function toast(msg) {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(window._tt)
  window._tt = setTimeout(() => t.classList.remove('show'), 3200)
}

/* ── MODAL ── */
function openModal(html, onClose) {
  const modalBody = document.getElementById('modalBody')
  const modalOverlay = document.getElementById('modalOverlay')
  if (modalBody) modalBody.innerHTML = html
  if (modalOverlay) modalOverlay.classList.add('active')
  setModalClose(onClose || null)
}
function closeModal() {
  const modalOverlay = document.getElementById('modalOverlay')
  const modalBody = document.getElementById('modalBody')
  if (modalOverlay) modalOverlay.classList.remove('active')
  if (modalBody) modalBody.innerHTML = ''
  if (_modalClose) _modalClose()
  setModalClose(null)
}
const overlayEl = document.getElementById('modalOverlay')
if (overlayEl) {
  overlayEl.addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal() })
}

/* ── DROPDOWN ACTION MENUS ── */
window.toggleDropdown = (btn, event) => {
  if (event) event.stopPropagation()
  const parent = btn.closest('.dropdown-actions')
  const isActive = parent.classList.contains('active')
  document.querySelectorAll('.dropdown-actions.active').forEach(d => d.classList.remove('active'))
  if (!isActive) parent.classList.add('active')
}
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-actions')) {
    document.querySelectorAll('.dropdown-actions.active').forEach(d => d.classList.remove('active'))
  }
})

/* ── EXPORTAR A CSV ── */
window.exportCSV = (filename, headers, rows) => {
  let csvContent = '\uFEFF' + headers.join(',') + '\n'
  rows.forEach(row => {
    const line = row.map(field => {
      let val = field == null ? '' : String(field)
      val = val.replace(/"/g, '""')
      return `"${val}"`
    }).join(',')
    csvContent += line + '\n'
  })
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}_${todayISO()}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  toast(`Exportado a CSV: ${filename}`)
}

window.exportInventarioCSV = () => {
  const headers = ['ID', 'Nombre', 'Grupo', 'Marca', 'Modelo', 'Serie', 'Costo Adquisicion', 'Precio Comercial', 'Precio Dia', 'Precio Semana', 'Precio Mes', 'Veces Rentada', 'Estatus']
  const rows = S.machines.map(m => [
    m.id, m.name, groupName(m.groupId), m.brand, m.model, m.serial,
    m.purchaseCost, m.salePrice, m.dailyPrice, m.weeklyPrice, m.monthlyPrice, m.rentalCount, m.status
  ])
  window.exportCSV('Inventario_Maquinaria', headers, rows)
}

window.exportClientesCSV = () => {
  const headers = ['ID', 'Nombre', 'Telefono', 'Correo', 'Direccion', 'RFC_ID', 'Tiene INE', 'Tiene Comprobante']
  const rows = S.customers.map(c => [
    c.id, c.name, c.phone, c.email, c.address, c.idNumber,
    c.ineDoc ? 'SI' : 'NO', c.addressDoc ? 'SI' : 'NO'
  ])
  window.exportCSV('Catalogo_Clientes', headers, rows)
}

window.exportRentasCSV = () => {
  const headers = ['ID', 'Maquina', 'Cliente', 'Modalidad', 'Cantidad', 'Precio Unitario', 'Total Cobrado', 'Abonado', 'Saldo Pendiente', 'Fecha Inicio', 'Devolución Esperada', 'Devolución Real', 'Estatus', 'Deposito']
  const rows = S.rentals.map(r => {
    const paid = r.amountPaid || (r.status === 'devuelta' ? r.totalCharged : 0)
    const balance = Math.max(0, (r.totalCharged || 0) - paid)
    return [
      r.id, machineName(r.machineId), customerName(r.customerId), r.rentalType, r.qty,
      r.unitPrice, r.totalCharged, paid, balance, r.startDate, r.expectedReturn, r.actualReturn || '', r.status, r.deposit
    ]
  })
  window.exportCSV('Bitacora_Rentas', headers, rows)
}

/* ── ENVÍO DIRECTO POR WHATSAPP ── */
window.openWhatsAppRental = rentalId => {
  const r = S.rentals.find(x => x.id === rentalId)
  if (!r) return
  const c = S.customers.find(x => x.id === r.customerId)
  const m = S.machines.find(x => x.id === r.machineId)
  if (!c || !c.phone) {
    toast('El cliente no tiene teléfono registrado')
    return
  }
  let cleanPhone = c.phone.replace(/\D/g, '')
  if (cleanPhone.length === 10) cleanPhone = '521' + cleanPhone
  else if (cleanPhone.length === 12 && cleanPhone.startsWith('52')) cleanPhone = '521' + cleanPhone.slice(2)

  const paid = r.amountPaid || (r.status === 'devuelta' ? r.totalCharged : 0)
  const balance = Math.max(0, (r.totalCharged || 0) - paid)

  const msg = `Hola *${c.name}*, te saludamos de *NexSoar System Leasing*.
📌 *Detalles de tu Renta:*
• Equipo: *${m ? m.name : 'Maquinaria'}*
• Devolución esperada: *${fmtDate(r.expectedReturn)}*
• Total cobrado: *${fmtMoney(r.totalCharged)}*
• Abonado: *${fmtMoney(paid)}*
• Saldo Pendiente: *${fmtMoney(balance)}*

Agradecemos tu preferencia. Ante cualquier duda o extensión de renta, quedamos a tus órdenes.`

  const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
  window.open(waUrl, '_blank')
}

/* ── CARGA INICIAL ── */
async function fetchAll() {
  showLoading('Cargando datos…')
  try {
    const [g, m, c, mt, r, p] = await Promise.all([
      sb.from('groups').select('*').order('created_at'),
      sb.from('machines').select('*').order('created_at'),
      sb.from('customers').select('*').order('created_at'),
      sb.from('maintenances').select('*').order('date', { ascending: false }),
      sb.from('rentals').select('*').order('start_date', { ascending: false }),
      sb.from('pagares').select('*').order('folio'),
    ])
    S.groups       = (g.data || []).map(mapGroup)
    S.machines     = (m.data || []).map(mapMachine)
    S.customers    = (c.data || []).map(mapCustomer)
    S.maintenances = (mt.data || []).map(mapMaint)
    S.rentals      = (r.data || []).map(mapRental)
    S.pagares      = (p.data || []).map(mapPagare)
  } catch (e) {
    toast('Error cargando datos: ' + (e.message || e))
  } finally {
    hideLoading()
  }
}

/* ── AUTH HANDLERS ── */
window.toggleEye = (inputId, btn) => {
  const inp = document.getElementById(inputId)
  if (!inp) return
  const show = inp.type === 'password'
  inp.type = show ? 'text' : 'password'
  btn.innerHTML = show
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
}
window.showForgotPassword = () => {
  document.getElementById('loginFormView').style.display = 'none'
  document.getElementById('forgotView').style.display = 'block'
  document.getElementById('resetView').style.display = 'none'
  document.getElementById('forgotMsg').textContent = ''
}
window.showLoginForm = () => {
  document.getElementById('loginFormView').style.display = 'block'
  document.getElementById('forgotView').style.display = 'none'
  document.getElementById('resetView').style.display = 'none'
  document.getElementById('authError').textContent = ''
}
window.submitAuth = async () => {
  const email = document.getElementById('authEmail').value.trim()
  const password = document.getElementById('authPassword').value
  const errEl = document.getElementById('authError')
  errEl.textContent = ''
  if (!email || !password) { errEl.textContent = 'Llena todos los campos'; return }
  const btn = document.getElementById('authSubmitBtn')
  btn.disabled = true; btn.textContent = 'Iniciando…'
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) errEl.textContent = xlateErr(error.message)
  } catch (e) { errEl.textContent = 'Error de conexión.' }
  finally { btn.disabled = false; btn.textContent = 'Iniciar sesión' }
}
window.sendReset = async () => {
  const email = document.getElementById('forgotEmail').value.trim()
  const msgEl = document.getElementById('forgotMsg')
  msgEl.style.color = 'var(--red)'; msgEl.textContent = ''
  if (!email) { msgEl.textContent = 'Ingresa tu correo'; return }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href })
  if (error) { msgEl.textContent = xlateErr(error.message) }
  else {
    msgEl.style.color = 'var(--teal-deep)'
    msgEl.textContent = '✓ Enlace enviado. Revisa tu correo (y la carpeta de spam).'
  }
}
window.updatePassword = async () => {
  const p1 = document.getElementById('newPassword').value
  const p2 = document.getElementById('newPasswordConfirm').value
  const msgEl = document.getElementById('resetMsg')
  msgEl.style.color = 'var(--red)'; msgEl.textContent = ''
  if (p1.length < 8) { msgEl.textContent = 'Mínimo 8 caracteres'; return }
  if (p1 !== p2) { msgEl.textContent = 'Las contraseñas no coinciden'; return }
  const { error } = await sb.auth.updateUser({ password: p1 })
  if (error) { msgEl.textContent = xlateErr(error.message) }
  else {
    msgEl.style.color = 'var(--teal-deep)'
    msgEl.textContent = '✓ Contraseña actualizada. Iniciando sesión…'
  }
}
function xlateErr(m) {
  if (m.includes('Invalid login')) return 'Correo o contraseña incorrectos'
  if (m.includes('already registered')) return 'Este correo ya tiene cuenta.'
  if (m.includes('Email not confirmed')) return 'Confirma tu correo primero (revisa tu bandeja)'
  if (m.includes('Password')) return 'Contraseña muy corta (mínimo 6 caracteres)'
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.'
  return m
}
window.doLogout = async () => { await sb.auth.signOut() }

/* ── MANEJO DE SESIÓN DE SUPABASE ── */
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    document.getElementById('loginScreen').style.display = 'flex'
    document.getElementById('appRoot').style.display = 'none'
    document.getElementById('loginFormView').style.display = 'none'
    document.getElementById('forgotView').style.display = 'none'
    document.getElementById('resetView').style.display = 'block'
    return
  }
  if (session?.user) {
    setME(session.user)
    const { data: prof } = await sb.from('profiles').select('*').eq('id', ME.id).single()
    setCurrentProfile(prof || { role: 'user', full_name: DEFAULT_ARRENDADOR_NAME, email: ME.email })
    document.getElementById('loginScreen').style.display = 'none'
    document.getElementById('appRoot').style.display = 'block'
    document.getElementById('userInfo').textContent = currentProfile.full_name || ME.email
    document.getElementById('todayLabel').textContent = 'Hoy: ' + new Date().toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    buildNav()
    await fetchAll()
    showView('dashboard')
  } else {
    setME(null)
    setCurrentProfile(null)
    S.groups = []; S.machines = []; S.customers = []; S.maintenances = []; S.rentals = []; S.pagares = []
    document.getElementById('loginScreen').style.display = 'flex'
    document.getElementById('appRoot').style.display = 'none'
    showLoginForm()
  }
})

/* ── HELPERS DE BÚSQUEDA ── */
const machineName = id => { const m = S.machines.find(x => x.id === id); return m ? m.name + (m.model ? ' (' + m.model + ')' : '') : '—' }
const groupName = id => { const g = S.groups.find(x => x.id === id); return g ? g.name : '— Sin grupo —' }
const customerName = id => { const c = S.customers.find(x => x.id === id); return c ? c.name : '—' }
const statusBadge = s => {
  const map = { disponible: ['ok', 'Disponible'], rentada: ['warn', 'Rentada'], mantenimiento: ['danger', 'En mantenimiento'] }
  const [cls, lbl] = map[s] || ['muted', s]
  return `<span class="badge ${cls}">${lbl}</span>`
}

/* ── RENTABILIDAD Y ALERTAS ── */
function machineFinancials(mId) {
  const m = S.machines.find(x => x.id === mId)
  const income = S.rentals.filter(r => r.machineId === mId).reduce((s, r) => s + (r.totalCharged || 0), 0)
  const maintCost = S.maintenances.filter(x => x.machineId === mId).reduce((s, x) => s + (Number(x.cost) || 0), 0)
  const purchaseCost = m ? Number(m.purchaseCost) || 0 : 0
  const totalCost = purchaseCost + maintCost
  const netProfit = income - totalCost
  const recovered = totalCost > 0 ? Math.min(100, (income / totalCost) * 100) : (income > 0 ? 100 : 0)
  return { income, maintCost, purchaseCost, totalCost, netProfit, recovered, isProfitable: netProfit > 0 }
}
const overdueRentals = () => { const t = todayISO(); return S.rentals.filter(r => r.status === 'activa' && r.expectedReturn < t) }
const dueSoonRentals = (days = 2) => { const t = todayISO(), l = addDays(t, days); return S.rentals.filter(r => r.status === 'activa' && r.expectedReturn >= t && r.expectedReturn <= l) }

/* ═══════════════════════════════════
   GRUPOS DE MAQUINARIA
═══════════════════════════════════ */
function renderGrupos() {
  const el = document.getElementById('view-grupos')
  el.innerHTML = `
    <div class="toolbar"><h2 style="margin:0;">Grupos de maquinaria</h2>
      <button class="btn" onclick="openGroupForm()">+ Nuevo grupo</button></div>
    <div class="grid cols-3">
      ${S.groups.map(g => {
        const n = S.machines.filter(m => m.groupId === g.id).length
        return `<div class="card">
          <div class="flex-between"><h3 style="margin:0;">${g.name}</h3>
            <div class="pill-row">
              <button class="btn small secondary" onclick="openGroupForm('${g.id}')">Editar</button>
              <button class="btn small danger" onclick="deleteGroup('${g.id}')">Eliminar</button>
            </div></div>
          <p class="small muted">${g.description || 'Sin descripción'}</p>
          <span class="badge muted">${n} máquina${n === 1 ? '' : 's'}</span></div>`
      }).join('') || '<div class="empty" style="grid-column:1/-1;">No hay grupos.</div>'}
    </div>`
}
window.openGroupForm = id => {
  const g = id ? S.groups.find(x => x.id === id) : null
  openModal(`<h2>${g ? 'Editar grupo' : 'Nuevo grupo'}</h2>
    <div class="form-grid">
      <label>Nombre<input id="g_name" value="${g ? g.name : ''}"></label>
      <label>Descripción<input id="g_desc" value="${g ? g.description || '' : ''}"></label>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveGroup(${g ? `'${g.id}'` : 'null'})">Guardar</button>
    </div>`)
}
window.saveGroup = async id => {
  const name = document.getElementById('g_name').value.trim()
  if (!name) { toast('Falta el nombre'); return }
  const description = document.getElementById('g_desc').value.trim()
  showLoading('Guardando…')
  try {
    if (id) {
      const { error } = await sb.from('groups').update({ name, description }).eq('id', id)
      if (error) throw error
      Object.assign(S.groups.find(x => x.id === id), { name, description })
      toast('Grupo actualizado')
    } else {
      const { data, error } = await sb.from('groups').insert({ user_id: ME.id, name, description }).select().single()
      if (error) throw error
      S.groups.push(mapGroup(data)); toast('Grupo creado')
    }
    closeModal(); renderGrupos()
  } catch (e) { toast('Error: ' + (e.message || e)) } finally { hideLoading() }
}
window.deleteGroup = async id => {
  if (S.machines.some(m => m.groupId === id)) { toast('Hay máquinas en este grupo.'); return }
  if (!confirm('¿Eliminar este grupo?')) return
  showLoading('Eliminando…')
  try {
    const { error } = await sb.from('groups').delete().eq('id', id)
    if (error) throw error
    S.groups = S.groups.filter(x => x.id !== id); renderGrupos(); toast('Grupo eliminado')
  } catch (e) { toast('Error: ' + (e.message || e)) } finally { hideLoading() }
}

/* ═══════════════════════════════════
   INVENTARIO DE MAQUINARIA
═══════════════════════════════════ */
function renderInventario() {
  const el = document.getElementById('view-inventario')
  el.innerHTML = `
    <div class="toolbar">
      <h2 style="margin:0;">Inventario de maquinaria</h2>
      <div class="pill-row">
        <button class="btn secondary" onclick="exportInventarioCSV()">📥 Exportar CSV</button>
        <button class="btn" onclick="openMachineForm()">+ Dar de alta máquina</button>
      </div>
    </div>
    <div class="card">
      ${S.machines.length === 0 ? '<div class="empty">No hay máquinas registradas.</div>' : `
      <div class="table-scroll">
        <table><thead><tr>
          <th>Máquina</th><th>Grupo</th><th>Costo / Precio</th>
          <th>Renta día / semana / mes</th><th>Veces rentada</th><th>Estatus</th><th>Acciones</th>
        </tr></thead><tbody>
          ${S.machines.map(m => `<tr>
            <td><strong>${m.name}</strong><div class="small muted">${m.brand} ${m.model} · Serie: ${m.serial || '—'}</div></td>
            <td>${groupName(m.groupId)}</td>
            <td>Costo: <strong>${fmtMoney(m.purchaseCost)}</strong><br>Precio: <strong>${fmtMoney(m.salePrice)}</strong><div class="small muted">${fmtDate(m.purchaseDate)}</div></td>
            <td>${fmtMoney(m.dailyPrice)} / ${fmtMoney(m.weeklyPrice)} / ${fmtMoney(m.monthlyPrice)}</td>
            <td>${m.rentalCount || 0}</td>
            <td>${statusBadge(m.status)}</td>
            <td>
              <div class="dropdown-actions">
                <button class="btn-dots" onclick="toggleDropdown(this, event)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item" onclick="openMachineForm('${m.id}')">✏️ Editar máquina</button>
                  <button class="dropdown-item danger-item" onclick="deleteMachine('${m.id}')">🗑️ Eliminar máquina</button>
                </div>
              </div>
            </td>
          </tr>`).join('')}
        </tbody></table>
      </div>`}
    </div>`
}
window.openMachineForm = id => {
  const m = id ? S.machines.find(x => x.id === id) : null
  const opts = S.groups.map(g => `<option value="${g.id}" ${m && m.groupId === g.id ? 'selected' : ''}>${g.name}</option>`).join('')
  openModal(`<h2>${m ? 'Editar máquina' : 'Alta de máquina'}</h2>
    <div class="form-grid">
      <label>Nombre<input id="f_name" value="${m ? m.name : ''}"></label>
      <label>Grupo<select id="f_group"><option value="">— Sin grupo —</option>${opts}</select></label>
      <label>Marca<input id="f_brand" value="${m ? m.brand : ''}"></label>
      <label>Modelo<input id="f_model" value="${m ? m.model : ''}"></label>
      <label>Número de serie<input id="f_serial" value="${m ? m.serial : ''}"></label>
      <label>Costo de adquisición<input id="f_cost" type="number" min="0" step="0.01" value="${m ? m.purchaseCost : ''}"></label>
      <label>Precio / valor comercial (pagaré)<input id="f_price" type="number" min="0" step="0.01" value="${m ? m.salePrice : ''}"></label>
      <label>Fecha de adquisición<input id="f_pdate" type="date" value="${m ? m.purchaseDate : todayISO()}"></label>
      <label>Estatus<select id="f_status">
        <option value="disponible" ${m && m.status === 'disponible' ? 'selected' : ''}>Disponible</option>
        <option value="rentada" ${m && m.status === 'rentada' ? 'selected' : ''}>Rentada</option>
        <option value="mantenimiento" ${m && m.status === 'mantenimiento' ? 'selected' : ''}>En mantenimiento</option>
      </select></label>
      <label>Precio por día<input id="f_daily" type="number" min="0" step="0.01" value="${m ? m.dailyPrice : ''}"></label>
      <label>Precio por semana<input id="f_weekly" type="number" min="0" step="0.01" value="${m ? m.weeklyPrice : ''}"></label>
      <label>Precio por mes<input id="f_monthly" type="number" min="0" step="0.01" value="${m ? m.monthlyPrice : ''}"></label>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveMachine(${m ? `'${m.id}'` : 'null'})">Guardar</button>
    </div>`)
  if (m) document.getElementById('f_group').value = m.groupId || ''
}
window.saveMachine = async id => {
  const name = document.getElementById('f_name').value.trim()
  if (!name) { toast('Falta el nombre'); return }
  const row = {
    name, group_id: document.getElementById('f_group').value || null,
    brand: document.getElementById('f_brand').value.trim(),
    model: document.getElementById('f_model').value.trim(),
    serial: document.getElementById('f_serial').value.trim(),
    purchase_cost: Number(document.getElementById('f_cost').value) || 0,
    sale_price: Number(document.getElementById('f_price').value) || 0,
    purchase_date: document.getElementById('f_pdate').value || todayISO(),
    status: document.getElementById('f_status').value,
    daily_price: Number(document.getElementById('f_daily').value) || 0,
    weekly_price: Number(document.getElementById('f_weekly').value) || 0,
    monthly_price: Number(document.getElementById('f_monthly').value) || 0,
  }
  showLoading('Guardando…')
  try {
    if (id) {
      const { error } = await sb.from('machines').update(row).eq('id', id)
      if (error) throw error
      const existing = S.machines.find(x => x.id === id)
      Object.assign(existing, mapMachine({ ...row, id, rental_count: existing.rentalCount }))
      toast('Máquina actualizada')
    } else {
      const { data, error } = await sb.from('machines').insert({ ...row, user_id: ME.id, rental_count: 0 }).select().single()
      if (error) throw error
      S.machines.push(mapMachine(data)); toast('Máquina dada de alta')
    }
    closeModal(); renderInventario()
  } catch (e) { toast('Error: ' + (e.message || e)) } finally { hideLoading() }
}
window.deleteMachine = async id => {
  const m = S.machines.find(x => x.id === id)
  if (!m) return
  const machRentals = S.rentals.filter(r => r.machineId === id)
  let confirmMsg = `¿Eliminar la máquina ${m.name}?`
  if (machRentals.length > 0) {
    confirmMsg = `La máquina ${m.name} tiene ${machRentals.length} renta(s) asociada(s). ¿Eliminar la máquina y todo su historial de rentas/pagarés?`
  }
  if (!confirm(confirmMsg)) return

  showLoading('Eliminando máquina…')
  try {
    if (machRentals.length > 0) {
      const rentalIds = machRentals.map(r => r.id)
      await sb.from('pagares').delete().in('rental_id', rentalIds)
      await sb.from('rentals').delete().eq('machine_id', id)
      S.pagares = S.pagares.filter(p => !rentalIds.includes(p.rentalId))
      S.rentals = S.rentals.filter(r => r.machineId !== id)
    }
    await sb.from('maintenances').delete().eq('machine_id', id)
    S.maintenances = S.maintenances.filter(x => x.machineId !== id)

    const { error } = await sb.from('machines').delete().eq('id', id)
    if (error) throw error
    S.machines = S.machines.filter(x => x.id !== id)
    renderInventario()
    toast('Máquina eliminada')
  } catch (e) { toast('Error: ' + (e.message || e)) } finally { hideLoading() }
}

/* ═══════════════════════════════════
   MANTENIMIENTOS
═══════════════════════════════════ */
function renderMantenimientos() {
  const el = document.getElementById('view-mantenimientos')
  const sorted = [...S.maintenances].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  el.innerHTML = `
    <div class="toolbar"><h2 style="margin:0;">Mantenimientos</h2>
      <button class="btn" onclick="openMaintenanceForm()">+ Programar / registrar</button></div>
    <div class="section-note">Cada mantenimiento suma su costo a la inversión total de la máquina (visible en Reportes).</div>
    <div class="card">
      ${sorted.length === 0 ? '<div class="empty">No hay mantenimientos registrados.</div>' : `
      <div class="table-scroll">
        <table><thead><tr><th>Máquina</th><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Costo</th><th>Estatus</th><th></th></tr></thead><tbody>
          ${sorted.map(x => {
            const isFuture = x.date > todayISO()
            return `<tr>
              <td>${machineName(x.machineId)}</td><td>${fmtDate(x.date)}</td>
              <td>${x.type === 'preventivo' ? 'Preventivo' : 'Correctivo'}</td>
              <td>${x.description || '—'}</td><td>${fmtMoney(x.cost)}</td>
              <td>${isFuture ? '<span class="badge warn">Programado</span>' : '<span class="badge ok">Realizado</span>'}</td>
              <td><button class="btn small danger" onclick="deleteMaintenance('${x.id}')">Eliminar</button></td>
            </tr>`
          }).join('')}
        </tbody></table>
      </div>`}
    </div>`
}
window.openMaintenanceForm = () => {
  if (S.machines.length === 0) { toast('Primero da de alta una máquina'); return }
  openModal(`<h2>Programar / registrar mantenimiento</h2>
    <div class="form-grid">
      <label>Máquina<select id="mt_mach">${S.machines.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select></label>
      <label>Fecha<input id="mt_date" type="date" value="${todayISO()}"></label>
      <label>Tipo<select id="mt_type"><option value="preventivo">Preventivo</option><option value="correctivo">Correctivo</option></select></label>
      <label>Costo<input id="mt_cost" type="number" min="0" step="0.01" placeholder="0.00"></label>
      <label style="grid-column:1/-1;">Descripción<textarea id="mt_desc" placeholder="Trabajo realizado…"></textarea></label>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveMaintenance()">Guardar</button>
    </div>`)
}
window.saveMaintenance = async () => {
  const machine_id = document.getElementById('mt_mach').value
  const date = document.getElementById('mt_date').value || todayISO()
  const type = document.getElementById('mt_type').value
  const cost = Number(document.getElementById('mt_cost').value) || 0
  const description = document.getElementById('mt_desc').value.trim()
  showLoading('Guardando…')
  try {
    const { data, error } = await sb.from('maintenances').insert({ user_id: ME.id, machine_id, date, type, cost, description }).select().single()
    if (error) throw error
    S.maintenances.push(mapMaint(data)); closeModal(); renderMantenimientos(); toast('Mantenimiento guardado')
  } catch (e) { toast('Error: ' + (e.message || e)) } finally { hideLoading() }
}
window.deleteMaintenance = async id => {
  if (!confirm('¿Eliminar este registro?')) return
  showLoading('Eliminando…')
  try {
    const { error } = await sb.from('maintenances').delete().eq('id', id)
    if (error) throw error
    S.maintenances = S.maintenances.filter(x => x.id !== id); renderMantenimientos(); toast('Eliminado')
  } catch (e) { toast('Error: ' + (e.message || e)) } finally { hideLoading() }
}

/* ═══════════════════════════════════
   CLIENTES Y DOCUMENTOS
═══════════════════════════════════ */
function renderClientes() {
  const el = document.getElementById('view-clientes')
  el.innerHTML = `
    <div class="toolbar">
      <h2 style="margin:0;">Clientes</h2>
      <div class="pill-row">
        <button class="btn secondary" onclick="exportClientesCSV()">📥 Exportar CSV</button>
        <button class="btn" onclick="openCustomerForm()">+ Nuevo cliente</button>
      </div>
    </div>
    <div class="card">
      ${S.customers.length === 0 ? '<div class="empty">No hay clientes registrados.</div>' : `
      <div class="table-scroll">
        <table><thead><tr>
          <th>Cliente</th><th>Teléfono</th><th>Correo</th><th>Dirección</th><th>RFC / ID</th><th>Documentos</th><th>Rentas</th><th>Acciones</th>
        </tr></thead><tbody>
          ${S.customers.map(c => {
            const n = S.rentals.filter(r => r.customerId === c.id).length
            return `<tr>
              <td><strong>${c.name}</strong></td><td>${c.phone || '—'}</td><td>${c.email || '—'}</td>
              <td>${c.address || '—'}</td><td>${c.idNumber || '—'}</td>
              <td>${docsCell(c)}</td><td>${n}</td>
              <td>
                <div class="dropdown-actions">
                  <button class="btn-dots" onclick="toggleDropdown(this, event)">⋮</button>
                  <div class="dropdown-menu">
                    <button class="dropdown-item" onclick="openCustomerForm('${c.id}')">✏️ Editar cliente</button>
                    <button class="dropdown-item danger-item" onclick="deleteCustomer('${c.id}')">🗑️ Eliminar cliente</button>
                  </div>
                </div>
              </td>
            </tr>`
          }).join('')}
        </tbody></table>
      </div>`}
    </div>`
}
function docsCell(c) {
  const ine = c.ineDoc ? `<span class="badge ok" style="cursor:pointer;" onclick="viewDoc('${c.ineDoc.path}')">📄 INE</span>` : '<span class="badge muted">INE: falta</span>'
  const addr = c.addressDoc ? `<span class="badge ok" style="cursor:pointer;" onclick="viewDoc('${c.addressDoc.path}')">📄 Comprobante</span>` : '<span class="badge muted">Comprobante: falta</span>'
  return `<div class="pill-row">${ine}${addr}</div>`
}
window.viewDoc = async path => {
  showLoading('Abriendo documento…')
  try {
    const { data, error } = await sb.storage.from('customer-docs').createSignedUrl(path, 3600)
    if (error) throw error
    window.open(data.signedUrl, '_blank')
  } catch (e) { toast('No se pudo abrir: ' + (e.message || e)) } finally { hideLoading() }
}
window.openCustomerForm = id => {
  const c = id ? S.customers.find(x => x.id === id) : null
  openModal(`<h2>${c ? 'Editar cliente' : 'Nuevo cliente'}</h2>
    <div class="form-grid">
      <label>Nombre completo / razón social<input id="c_name" value="${c ? c.name : ''}"></label>
      <label>Teléfono<input id="c_phone" value="${c ? c.phone || '' : ''}"></label>
      <label>Correo<input id="c_email" value="${c ? c.email || '' : ''}"></label>
      <label>RFC / Identificación<input id="c_idnum" value="${c ? c.idNumber || '' : ''}"></label>
      <label style="grid-column:1/-1;">Dirección completa<input id="c_addr" value="${c ? c.address || '' : ''}"></label>
    </div>
    <h3 style="margin-top:18px;">Documentos del cliente</h3>
    <div class="section-note">Adjunta foto o PDF de la INE y del comprobante de domicilio. Se guardan cifrados en la nube (máx. 5 MB c/u).</div>
    <div class="form-grid">
      <div class="field-block"><span class="field-label">INE (identificación oficial)</span>
        <div class="dropzone${c && c.ineDoc ? ' has-file' : ''}" id="z_ine">
          <input id="f_ine" type="file" accept="image/*,.pdf">
          <div class="dz-icon">📎</div><div class="dz-text">Arrastra o <span class="dz-browse">elige</span></div>
          <div class="dz-filename" id="l_ine">${c && c.ineDoc ? '📄 ' + c.ineDoc.name : 'Sin archivo todavía'}</div>
        </div>
      </div>
      <div class="field-block"><span class="field-label">Comprobante de domicilio</span>
        <div class="dropzone${c && c.addressDoc ? ' has-file' : ''}" id="z_addr">
          <input id="f_addr" type="file" accept="image/*,.pdf">
          <div class="dz-icon">📎</div><div class="dz-text">Arrastra o <span class="dz-browse">elige</span></div>
          <div class="dz-filename" id="l_addr">${c && c.addressDoc ? '📄 ' + c.addressDoc.name : 'Sin archivo todavía'}</div>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" id="c_save" onclick="saveCustomer(${c ? `'${c.id}'` : 'null'})">Guardar</button>
    </div>`)
  setupDZ('z_ine', 'f_ine', 'l_ine')
  setupDZ('z_addr', 'f_addr', 'l_addr')
}
function setupDZ(zId, iId, lId) {
  const zone = document.getElementById(zId), inp = document.getElementById(iId), lbl = document.getElementById(lId)
  if (!zone || !inp) return
  const show = f => { if (!f) return; zone.classList.add('has-file'); if (lbl) lbl.textContent = '📄 ' + f.name }
  inp.addEventListener('change', () => show(inp.files?.[0]))
  ;['dragenter', 'dragover'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); zone.classList.add('drag') }))
  ;['dragleave', 'dragend'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); zone.classList.remove('drag') }))
  zone.addEventListener('drop', ev => {
    ev.preventDefault(); ev.stopPropagation(); zone.classList.remove('drag')
    const f = ev.dataTransfer?.files?.[0]; if (!f) return
    if (!/^image\//.test(f.type) && !/pdf/i.test(f.type)) { toast('Solo imágenes o PDF'); return }
    try { const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files } catch (_) { }
    show(f)
  })
}

/* ── GUARDAR CLIENTE Y SUBIR DOCUMENTOS ── */
window.saveCustomer = async id => {
  const name = document.getElementById('c_name').value.trim()
  if (!name) { toast('Falta el nombre'); return }
  const ineFile = document.getElementById('f_ine').files?.[0]
  const addrFile = document.getElementById('f_addr').files?.[0]
  const saveBtn = document.getElementById('c_save')
  saveBtn.disabled = true; saveBtn.textContent = 'Guardando…'; showLoading('Guardando cliente…')
  try {
    const dbRow = {
      name,
      phone: document.getElementById('c_phone').value.trim(),
      email: document.getElementById('c_email').value.trim(),
      id_number: document.getElementById('c_idnum').value.trim(),
      address: document.getElementById('c_addr').value.trim(),
    }

    let customerRecord = null
    if (id) {
      const { data, error } = await sb.from('customers').update(dbRow).eq('id', id).select().single()
      if (error) throw error
      customerRecord = data
    } else {
      const { data, error } = await sb.from('customers').insert({ ...dbRow, user_id: ME.id }).select().single()
      if (error) throw error
      customerRecord = data
    }

    const cId = customerRecord.id
    const docUpdates = {}

    async function uploadDoc(file, slot) {
      const rawExt = file.name.split('.').pop() || 'bin'
      const ext = rawExt.toLowerCase()
      const path = `${ME.id}/${cId}/${slot}_${Date.now()}.${ext}`
      const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg')
      const { error } = await sb.storage.from('customer-docs').upload(path, file, { upsert: true, contentType })
      if (error) throw new Error(error.message || 'Error al subir a Supabase Storage')
      return { name: file.name, path }
    }

    if (ineFile) {
      try {
        const r = await uploadDoc(ineFile, 'ine')
        docUpdates.ine_doc_name = r.name
        docUpdates.ine_doc_path = r.path
      } catch (err) {
        console.error('Error subiendo INE:', err)
        toast('Advertencia: No se pudo subir el archivo de INE: ' + (err.message || err))
      }
    }
    if (addrFile) {
      try {
        const r = await uploadDoc(addrFile, 'address')
        docUpdates.address_doc_name = r.name
        docUpdates.address_doc_path = r.path
      } catch (err) {
        console.error('Error subiendo comprobante:', err)
        toast('Advertencia: No se pudo subir el comprobante de domicilio: ' + (err.message || err))
      }
    }

    if (Object.keys(docUpdates).length > 0) {
      const { data: updatedData, error: updateErr } = await sb.from('customers').update(docUpdates).eq('id', cId).select().single()
      if (!updateErr && updatedData) {
        customerRecord = updatedData
      }
    }

    const mapped = mapCustomer(customerRecord)
    if (id) {
      const idx = S.customers.findIndex(x => x.id === id)
      if (idx !== -1) S.customers[idx] = mapped
      toast('Cliente actualizado')
    } else {
      S.customers.push(mapped)
      toast('Cliente registrado con éxito')
    }

    closeModal()
    renderClientes()
  } catch (e) {
    toast('Error: ' + (e.message || e))
    console.error('SaveCustomer Error:', e)
  } finally {
    hideLoading()
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar' }
  }
}
window.deleteCustomer = async id => {
  const c = S.customers.find(x => x.id === id)
  if (!c) return
  const custRentals = S.rentals.filter(r => r.customerId === id)
  let confirmMsg = `¿Eliminar al cliente ${c.name}?`
  if (custRentals.length > 0) {
    confirmMsg = `El cliente ${c.name} tiene ${custRentals.length} renta(s) registrada(s). ¿Eliminar el cliente y todas sus rentas/pagarés asociados?`
  }
  if (!confirm(confirmMsg)) return

  showLoading('Eliminando cliente…')
  try {
    if (custRentals.length > 0) {
      const rentalIds = custRentals.map(r => r.id)
      await sb.from('pagares').delete().in('rental_id', rentalIds)
      await sb.from('rentals').delete().eq('customer_id', id)
      S.pagares = S.pagares.filter(p => !rentalIds.includes(p.rentalId))
      S.rentals = S.rentals.filter(r => r.customerId !== id)
    }
    const { error } = await sb.from('customers').delete().eq('id', id)
    if (error) throw error
    S.customers = S.customers.filter(x => x.id !== id)
    renderClientes()
    toast('Cliente eliminado')
  } catch (e) { toast('Error: ' + (e.message || e)) } finally { hideLoading() }
}

/* ═══════════════════════════════════
   RENTAS Y PAGARÉS
═══════════════════════════════════ */
function renderRentas() {
  const el = document.getElementById('view-rentas')
  const sorted = [...S.rentals].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
  el.innerHTML = `
    <div class="toolbar">
      <h2 style="margin:0;">Bitácora de rentas</h2>
      <div class="pill-row">
        <button class="btn secondary" onclick="exportRentasCSV()">📥 Exportar CSV</button>
        <button class="btn" onclick="openRentalForm()">+ Nueva renta (genera pagaré)</button>
      </div>
    </div>
    <div class="card">
      ${sorted.length === 0 ? '<div class="empty">No se ha registrado ninguna renta.</div>' : `
      <div class="table-scroll">
        <table><thead><tr>
          <th>Máquina</th><th>Cliente</th><th>Modalidad</th><th>Inicio / Dev. esperada</th>
          <th>Total</th><th>Abonado</th><th>Saldo Pendiente</th><th>Estatus</th><th>Acciones</th>
        </tr></thead><tbody>
          ${sorted.map(r => {
            const paid = r.amountPaid || (r.status === 'devuelta' ? r.totalCharged : 0)
            const balance = Math.max(0, (r.totalCharged || 0) - paid)
            const badge = r.status === 'devuelta' ? '<span class="badge muted">Devuelta</span>' :
              r.expectedReturn < todayISO() ? '<span class="badge danger">Atrasada</span>' : '<span class="badge ok">Activa</span>'
            return `<tr>
              <td><strong>${machineName(r.machineId)}</strong></td>
              <td>${customerName(r.customerId)}</td>
              <td>${rtLabel(r.rentalType)} × ${r.qty}</td>
              <td>${fmtDate(r.startDate)}<br><span class="small muted">Dev: ${fmtDate(r.expectedReturn)}</span></td>
              <td><strong>${fmtMoney(r.totalCharged)}</strong></td>
              <td style="color:var(--teal-deep);font-weight:700;">${fmtMoney(paid)}</td>
              <td><strong style="color:${balance > 0 ? 'var(--red)' : 'var(--teal-deep)'}">${fmtMoney(balance)}</strong></td>
              <td>${badge}</td>
              <td>
                <div class="dropdown-actions">
                  <button class="btn-dots" onclick="toggleDropdown(this, event)">⋮</button>
                  <div class="dropdown-menu">
                    ${r.pagareId ? `<button class="dropdown-item" onclick="viewPagare('${r.pagareId}')">📄 Ver Pagaré</button>` : ''}
                    <button class="dropdown-item wa-item" onclick="openWhatsAppRental('${r.id}')">📲 Enviar WhatsApp</button>
                    <button class="dropdown-item" onclick="openPaymentModal('${r.id}')">💳 Registrar Abono / Pago</button>
                    ${r.status === 'activa' ? `<button class="dropdown-item" onclick="markReturned('${r.id}')">🔄 Marcar devuelta</button>` : ''}
                    <button class="dropdown-item danger-item" onclick="deleteRental('${r.id}')">🗑️ Eliminar renta</button>
                  </div>
                </div>
              </td>
            </tr>`
          }).join('')}
        </tbody></table>
      </div>`}
    </div>`
}

const rtLabel = t => ({ dia: 'Diaria', semana: 'Semanal', mes: 'Mensual' })[t] || t
const unitPrice = (m, t) => t === 'dia' ? m.dailyPrice : t === 'semana' ? m.weeklyPrice : m.monthlyPrice
const retDate = (s, t, q) => t === 'dia' ? addDays(s, q) : t === 'semana' ? addDays(s, q * 7) : addMonths(s, q)

let _hasDrawnSig = false

window.openRentalForm = () => {
  const avail = S.machines.filter(m => m.status === 'disponible')
  if (!avail.length) { toast('No hay máquinas disponibles'); return }
  if (!S.customers.length) { toast('Primero registra un cliente'); return }
  _hasDrawnSig = false
  openModal(`<h2>Nueva renta y pagaré</h2>
    <div class="form-grid">
      <label>Máquina disponible<select id="r_mach" onchange="previewRental()">${avail.map(m => `<option value="${m.id}">${m.name} — ${m.model}</option>`).join('')}</select></label>
      <label>Cliente<select id="r_cust">${S.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></label>
      <label>Modalidad<select id="r_type" onchange="previewRental()"><option value="dia">Diaria</option><option value="semana">Semanal</option><option value="mes">Mensual</option></select></label>
      <label>Cantidad<input id="r_qty" type="number" min="1" step="1" value="1" onchange="previewRental()"></label>
      <label>Fecha de inicio<input id="r_start" type="date" value="${todayISO()}" onchange="previewRental()"></label>
      <label>Devolución esperada<input id="r_ret" type="date" value="${addDays(todayISO(), 1)}" readonly></label>
      <label style="grid-column:1/-1;">Depósito en garantía (opcional)<input id="r_dep" type="number" min="0" step="0.01" placeholder="0.00"></label>
    </div>
    <div class="card" style="margin-top:14px;background:linear-gradient(120deg,var(--teal-soft),#f3fbf9);border:none;">
      <div id="r_prev" class="small"></div>
    </div>
    <h3 style="margin-top:18px;">Firma Digital Táctil del Cliente</h3>
    <div class="sig-pad-wrap">
      <canvas id="sigCanvas" class="sig-canvas" width="620" height="130"></canvas>
      <div class="flex-between" style="margin-top:8px;">
        <span class="small muted">Traza la firma con el dedo, stylus o mouse</span>
        <button type="button" class="btn small secondary" onclick="clearSignature()">Limpiar firma</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveRental()">Generar renta y pagaré</button>
    </div>`)

  window.previewRental()
  setTimeout(initSigCanvas, 100)
}

function initSigCanvas() {
  const canvas = document.getElementById('sigCanvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.strokeStyle = '#102a4c'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  let isDrawing = false
  let lastX = 0, lastY = 0

  function getPos(e) {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  function startDraw(e) {
    e.preventDefault()
    isDrawing = true
    _hasDrawnSig = true
    const pos = getPos(e)
    lastX = pos.x; lastY = pos.y
  }

  function draw(e) {
    if (!isDrawing) return
    e.preventDefault()
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastX, lastY)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastX = pos.x; lastY = pos.y
  }

  function stopDraw(e) {
    isDrawing = false
  }

  canvas.addEventListener('mousedown', startDraw)
  canvas.addEventListener('mousemove', draw)
  canvas.addEventListener('mouseup', stopDraw)
  canvas.addEventListener('mouseleave', stopDraw)

  canvas.addEventListener('touchstart', startDraw, { passive: false })
  canvas.addEventListener('touchmove', draw, { passive: false })
  canvas.addEventListener('touchend', stopDraw)
}

window.clearSignature = () => {
  const canvas = document.getElementById('sigCanvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  _hasDrawnSig = false
}

window.previewRental = () => {
  const mId = document.getElementById('r_mach')?.value; if (!mId) return
  const m = S.machines.find(x => x.id === mId), type = document.getElementById('r_type').value
  const qty = Math.max(1, Number(document.getElementById('r_qty').value) || 1)
  const start = document.getElementById('r_start').value || todayISO()
  const unit = unitPrice(m, type), total = unit * qty, ret = retDate(start, type, qty)
  document.getElementById('r_ret').value = ret
  const ul = { dia: 'día', semana: 'semana', mes: 'mes' }[type]
  document.getElementById('r_prev').innerHTML = `<strong>Resumen:</strong> ${qty} ${ul}${qty > 1 ? 's' : ''} × ${fmtMoney(unit)} = <strong>${fmtMoney(total)}</strong> · Devolución: <strong>${fmtDate(ret)}</strong> · Valor máquina (pagaré): <strong>${fmtMoney(m.salePrice)}</strong>`
}

window.saveRental = async () => {
  const machineId = document.getElementById('r_mach').value
  const customerId = document.getElementById('r_cust').value
  const type = document.getElementById('r_type').value
  const qty = Math.max(1, Number(document.getElementById('r_qty').value) || 1)
  const start = document.getElementById('r_start').value || todayISO()
  const expectedReturn = document.getElementById('r_ret').value
  const deposit = Number(document.getElementById('r_dep').value) || 0
  const machine = S.machines.find(m => m.id === machineId)
  const unit = unitPrice(machine, type), total = unit * qty

  let signatureData = null
  if (_hasDrawnSig) {
    const canvas = document.getElementById('sigCanvas')
    if (canvas) signatureData = canvas.toDataURL('image/png')
  }

  showLoading('Generando renta y pagaré…')
  try {
    const { data: fData } = await sb.from('pagares').select('folio').order('folio', { ascending: false }).limit(1).maybeSingle()
    const folio = (fData?.folio || 0) + 1

    const rentalRow = {
      user_id: ME.id, machine_id: machineId, customer_id: customerId,
      rental_type: type, qty, unit_price: unit, total_charged: total,
      start_date: start, expected_return: expectedReturn,
      status: 'activa', deposit
    }

    const { data: rent, error: re } = await sb.from('rentals').insert(rentalRow).select().single()
    if (re) throw re

    const pagareRow = {
      user_id: ME.id, folio, rental_id: rent.id,
      machine_id: machineId, customer_id: customerId, machine_value: machine.salePrice,
      rental_type: type, unit_price: unit, qty, total_charged: total,
      issue_date: start, expected_return: expectedReturn, deposit
    }

    const { data: pg, error: pe } = await sb.from('pagares').insert(pagareRow).select().single()
    if (pe) throw pe

    await sb.from('rentals').update({ pagare_id: pg.id }).eq('id', rent.id)
    await sb.from('machines').update({ status: 'rentada', rental_count: (machine.rentalCount || 0) + 1 }).eq('id', machineId)
    rent.pagare_id = pg.id

    if (signatureData) {
      setLocalSig(rent.id, signatureData)
    }

    const rentMapped = mapRental(rent)
    const pgMapped = mapPagare(pg)

    S.rentals.push(rentMapped)
    S.pagares.push(pgMapped)
    machine.status = 'rentada'; machine.rentalCount = (machine.rentalCount || 0) + 1
    closeModal(); toast('Renta registrada — Folio #' + folio)
    renderRentas(); viewPagare(pg.id)
  } catch (e) { toast('Error: ' + (e.message || e)); console.error(e) } finally { hideLoading() }
}

/* ── ABONOS Y REGISTRO DE PAGOS ── */
window.openPaymentModal = rentalId => {
  const r = S.rentals.find(x => x.id === rentalId)
  if (!r) return
  const paid = r.amountPaid || (r.status === 'devuelta' ? r.totalCharged : 0)
  const balance = Math.max(0, (r.totalCharged || 0) - paid)

  openModal(`<h2>Registrar Abono / Pago</h2>
    <p class="small muted">Máquina: <strong>${machineName(r.machineId)}</strong> · Cliente: <strong>${customerName(r.customerId)}</strong></p>
    <div class="card" style="margin-bottom:14px;background:#f8fafc;">
      <div class="flex-between"><span>Total Renta:</span><strong>${fmtMoney(r.totalCharged)}</strong></div>
      <div class="flex-between" style="color:var(--teal-deep);"><span>Abonado Previo:</span><strong>${fmtMoney(paid)}</strong></div>
      <div class="flex-between" style="color:${balance > 0 ? 'var(--red)' : 'var(--teal-deep)'};font-size:1.05rem;"><span>Saldo Actual:</span><strong>${fmtMoney(balance)}</strong></div>
    </div>
    <div class="form-grid">
      <label>Monto a Abonar ($)<input id="p_amount" type="number" min="0.01" step="0.01" value="${balance}"></label>
      <label>Fecha de Pago<input id="p_date" type="date" value="${todayISO()}"></label>
      <label>Método de Pago
        <select id="p_method">
          <option value="Efectivo">Efectivo</option>
          <option value="Transferencia">Transferencia bancaria</option>
          <option value="Tarjeta">Tarjeta de Crédito / Débito</option>
        </select>
      </label>
      <label>Notas / Referencia<input id="p_notes" type="text" placeholder="Ej. Folio de transferencia #1234"></label>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn green" onclick="savePayment('${rentalId}')">Guardar Abono y Generar Recibo</button>
    </div>`)
}

window.savePayment = async rentalId => {
  const r = S.rentals.find(x => x.id === rentalId)
  if (!r) return
  const amount = Number(document.getElementById('p_amount').value) || 0
  const date = document.getElementById('p_date').value || todayISO()
  const method = document.getElementById('p_method').value
  const notes = document.getElementById('p_notes').value.trim()

  if (amount <= 0) { toast('Ingresa un monto válido'); return }

  const currentPaid = r.amountPaid || 0
  const newPaid = currentPaid + amount

  showLoading('Registrando abono…')
  try {
    try {
      await sb.from('rentals').update({ amount_paid: newPaid }).eq('id', rentalId)
    } catch (e) {
      console.warn("Columna amount_paid no disponible en el servidor Supabase.", e)
    }
    
    setLocalPaid(rentalId, newPaid)
    r.amountPaid = newPaid
    
    closeModal()
    toast(`Abono de ${fmtMoney(amount)} registrado con éxito`)
    renderRentas()
    viewRecibo(rentalId, amount, date, method, notes)
  } catch (e) { toast('Error registrando abono: ' + (e.message || e)) } finally { hideLoading() }
}

window.viewRecibo = (rentalId, amount, date, method, notes) => {
  const r = S.rentals.find(x => x.id === rentalId)
  if (!r) return
  const m = S.machines.find(x => x.id === r.machineId)
  const c = S.customers.find(x => x.id === r.customerId)
  const total = r.totalCharged || 0
  const totalPaid = r.amountPaid || amount
  const balance = Math.max(0, total - totalPaid)
  const arrendadorNombre = DEFAULT_ARRENDADOR_NAME

  openModal(`
    <div class="recibo-doc" id="reciboDoc">
      <div class="letterhead">
        <img src="Logo.jpg" alt="NexSoar" onerror="this.style.display='none'">
        <div><div class="lh-name">NexSoar System Leasing</div><div class="lh-tag">Recibo Oficial de Pago</div></div>
      </div>
      <h3>Recibo de Pago — Renta de Maquinaria</h3>
      <p><strong>Fecha de pago:</strong> ${fmtDate(date)} &nbsp;|&nbsp; <strong>Método:</strong> ${method}</p>
      <p>Recibimos de <strong>${c ? c.name : '—'}</strong> la cantidad de <strong>${fmtMoney(amount)}</strong> por concepto de abono/pago de arrendamiento del equipo <strong>${m ? m.name : '—'}</strong>.</p>
      <table style="margin:14px 0;">
        <tr><td class="muted" style="width:45%;">Total de la Renta</td><td style="text-align:right;"><strong>${fmtMoney(total)}</strong></td></tr>
        <tr><td class="muted">Abono Recibido Hoy</td><td style="text-align:right;color:var(--teal-deep);"><strong>${fmtMoney(amount)}</strong></td></tr>
        <tr><td class="muted">Total Acumulado Pagado</td><td style="text-align:right;"><strong>${fmtMoney(totalPaid)}</strong></td></tr>
        <tr><td class="muted"><strong>Saldo Restante Pendiente</strong></td><td style="text-align:right;"><strong style="color:${balance > 0 ? 'var(--red)' : 'var(--teal-deep)'}">${fmtMoney(balance)}</strong></td></tr>
      </table>
      ${notes ? `<p class="small muted">Notas / Referencia: ${notes}</p>` : ''}
      <div class="sig">
        <div><strong>${c ? c.name : '—'}</strong><br><span class="small muted">Firma del cliente</span></div>
        <div><strong>${arrendadorNombre}</strong><br><span class="small muted">Firma de conformidad</span></div>
      </div>
    </div>
    <div class="modal-actions no-print">
      <button class="btn secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button>
    </div>`)
}

window.markReturned = id => {
  const r = S.rentals.find(x => x.id === id); if (!r) return
  openModal(`<h2>Registrar devolución</h2>
    <p class="small muted">Máquina: <strong>${machineName(r.machineId)}</strong> · Cliente: <strong>${customerName(r.customerId)}</strong></p>
    <div class="form-grid">
      <label>Fecha de devolución<input id="ret_date" type="date" value="${todayISO()}"></label>
      <label>Estado de la máquina<select id="ret_cond">
        <option value="buen_estado">Buen estado — vuelve a disponible</option>
        <option value="requiere_mantenimiento">Requiere mantenimiento</option>
      </select></label>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="confirmReturn('${id}')">Confirmar devolución</button>
    </div>`)
}

window.confirmReturn = async id => {
  const r = S.rentals.find(x => x.id === id)
  const date = document.getElementById('ret_date').value || todayISO()
  const cond = document.getElementById('ret_cond').value
  const newStatus = cond === 'requiere_mantenimiento' ? 'mantenimiento' : 'disponible'
  showLoading('Registrando…')
  try {
    const { error: re } = await sb.from('rentals').update({ actual_return: date, status: 'devuelta' }).eq('id', id)
    if (re) throw re
    const { error: me } = await sb.from('machines').update({ status: newStatus }).eq('id', r.machineId)
    if (me) throw me
    r.actualReturn = date; r.status = 'devuelta'
    setLocalPaid(id, r.totalCharged)
    r.amountPaid = r.totalCharged
    S.machines.find(m => m.id === r.machineId).status = newStatus
    closeModal(); toast('Devolución registrada'); renderRentas()
  } catch (e) { toast('Error: ' + (e.message || e)) } finally { hideLoading() }
}

window.deleteRental = async id => {
  const r = S.rentals.find(x => x.id === id)
  if (!r) return
  if (!confirm(`¿Eliminar la renta de ${machineName(r.machineId)} (${customerName(r.customerId)}) y su pagaré asociado?`)) return
  showLoading('Eliminando renta…')
  try {
    if (r.pagareId) {
      await sb.from('pagares').delete().eq('id', r.pagareId)
      S.pagares = S.pagares.filter(p => p.id !== r.pagareId)
    } else {
      await sb.from('pagares').delete().eq('rental_id', id)
      S.pagares = S.pagares.filter(p => p.rentalId !== id)
    }

    const { error } = await sb.from('rentals').delete().eq('id', id)
    if (error) throw error

    const machine = S.machines.find(m => m.id === r.machineId)
    if (machine && r.status === 'activa') {
      const newCount = Math.max(0, (machine.rentalCount || 1) - 1)
      await sb.from('machines').update({ status: 'disponible', rental_count: newCount }).eq('id', machine.id)
      machine.status = 'disponible'
      machine.rentalCount = newCount
    }

    localStorage.removeItem('nexsoar_paid_' + id)
    localStorage.removeItem('nexsoar_sig_' + id)

    S.rentals = S.rentals.filter(x => x.id !== id)
    toast('Registro de renta eliminado')
    renderRentas()
  } catch (e) {
    toast('Error al eliminar: ' + (e.message || e))
    console.error(e)
  } finally {
    hideLoading()
  }
}

/* ── PAGARÉ CON NOMBRE DEL ARRENDADOR, FIRMA DIGITAL Y IMPRESIÓN COMPLETA ── */
window.viewPagare = id => {
  const p = S.pagares.find(x => x.id === id); if (!p) { toast('Pagaré no encontrado'); return }
  const m = S.machines.find(x => x.id === p.machineId)
  const c = S.customers.find(x => x.id === p.customerId)
  const r = S.rentals.find(x => x.id === p.rentalId)
  const ul = { dia: 'día', semana: 'semana', mes: 'mes' }[p.rentalType]
  const rlbl = p.rentalType === 'dia' ? 'diaria' : p.rentalType === 'semana' ? 'semanal' : 'mensual'
  const arrendadorNombre = DEFAULT_ARRENDADOR_NAME
  const sigData = p.signatureData || (r ? r.signatureData : null) || getLocalSig(p.rentalId || p.id)

  openModal(`
    <div class="pagare-doc" id="pagareDoc">
      <div class="letterhead">
        <img src="Logo.jpg" alt="NexSoar" onerror="this.style.display='none'">
        <div><div class="lh-name">NexSoar System Leasing</div><div class="lh-tag">Renta de maquinaria</div></div>
      </div>
      <h3>Pagaré — Renta de Maquinaria</h3>
      <p><strong>Folio:</strong> PG-${String(p.folio).padStart(5, '0')} &nbsp;|&nbsp; <strong>Fecha de emisión:</strong> ${fmtDate(p.issueDate)}</p>
      <p>Por este pagaré, yo <strong>${c ? c.name : '—'}</strong>${c && c.idNumber ? ' (RFC/ID: ' + c.idNumber + ')' : ''}, con domicilio en <strong>${c ? (c.address || '____________________') : '____________________'}</strong>, me obligo incondicionalmente a pagar a la orden del arrendador <strong>${arrendadorNombre}</strong> la cantidad de <strong>${fmtMoney(p.machineValue)}</strong> (valor comercial de la máquina), recibida en calidad de <strong>renta</strong>:</p>
      <table style="margin:14px 0;">
        <tr><td class="muted" style="width:40%;">Máquina</td><td><strong>${m ? m.name : '—'}</strong></td></tr>
        <tr><td class="muted">Marca / Modelo</td><td>${m ? (m.brand || '—') : '—'} / ${m ? (m.model || '—') : '—'}</td></tr>
        <tr><td class="muted">Número de serie</td><td>${m ? (m.serial || '—') : '—'}</td></tr>
        <tr><td class="muted">Valor de la máquina</td><td><strong>${fmtMoney(p.machineValue)}</strong></td></tr>
      </table>
      <p>El cumplimiento se realizará mediante el pago de una <strong>renta ${rlbl}</strong> de <strong>${fmtMoney(p.unitPrice)}</strong> por ${ul}, durante <strong>${p.qty} ${ul}${p.qty > 1 ? 's' : ''}</strong>, lo que asciende a un total de <strong>${fmtMoney(p.totalCharged)}</strong>.</p>
      <p>Periodo: del <strong>${fmtDate(p.issueDate)}</strong> al <strong>${fmtDate(p.expectedReturn)}</strong>.${p.deposit > 0 ? ' Depósito en garantía: <strong>' + fmtMoney(p.deposit) + '</strong>.' : ''}</p>
      <p>En caso de no devolverse la máquina en la fecha pactada, esta obligación se hará exigible por el valor total señalado, conforme a la legislación aplicable en materia de títulos de crédito.</p>
      <div class="sig">
        <div>
          ${sigData ? `<img src="${sigData}" alt="Firma Cliente" style="max-height:55px;display:block;margin:0 auto 4px;">` : ''}
          <strong>${c ? c.name : '—'}</strong><br><span class="small muted">Firma del cliente / arrendatario</span>
        </div>
        <div>
          <strong>${arrendadorNombre}</strong><br><span class="small muted">Firma del arrendador</span>
        </div>
      </div>
    </div>
    <div class="section-note no-print" style="margin-top:14px;">Plantilla generada automáticamente para NexSoar System Leasing. Se recomienda revisión legal antes de uso formal.</div>
    <div class="modal-actions no-print">
      <button class="btn secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button>
    </div>`)
}

/* ── ALERTAS DE DEVOLUCIÓN ── */
function renderAlertas() {
  const el = document.getElementById('view-alertas')
  const over = overdueRentals(), soon = dueSoonRentals(3)
  el.innerHTML = `
    <h2>Alertas de devolución</h2>
    <div class="grid cols-2">
      <div class="card"><h3>🔴 Atrasadas</h3>
        ${over.length === 0 ? '<div class="empty">Sin devoluciones atrasadas.</div>' : `
        <div class="table-scroll">
          <table><thead><tr><th>Máquina</th><th>Cliente</th><th>Debió devolverse</th><th>Atraso</th><th></th></tr></thead><tbody>
            ${over.map(r => `<tr>
              <td>${machineName(r.machineId)}</td><td>${customerName(r.customerId)}</td>
              <td>${fmtDate(r.expectedReturn)}</td>
              <td><span class="badge danger">${daysBetween(r.expectedReturn, todayISO())} días</span></td>
              <td><button class="btn small" onclick="markReturned('${r.id}')">Marcar devuelta</button></td>
            </tr>`).join('')}
          </tbody></table>
        </div>`}
      </div>
      <div class="card"><h3>🟡 Por vencer — próximos 3 días</h3>
        ${soon.length === 0 ? '<div class="empty">Sin vencimientos próximos.</div>' : `
        <div class="table-scroll">
          <table><thead><tr><th>Máquina</th><th>Cliente</th><th>Fecha de devolución</th></tr></thead><tbody>
            ${soon.map(r => `<tr>
              <td>${machineName(r.machineId)}</td><td>${customerName(r.customerId)}</td>
              <td><span class="badge warn">${fmtDate(r.expectedReturn)}</span></td>
            </tr>`).join('')}
          </tbody></table>
        </div>`}
      </div>
    </div>
    <div class="section-note" style="margin-top:16px;">Calculadas automáticamente. Hoy: ${fmtDate(todayISO())}.</div>`
}

/* ── DASHBOARD ── */
function renderDashboard() {
  const el = document.getElementById('view-dashboard')
  const total = S.machines.length
  const disp = S.machines.filter(m => m.status === 'disponible').length
  const rent = S.machines.filter(m => m.status === 'rentada').length
  const mant = S.machines.filter(m => m.status === 'mantenimiento').length
  const over = overdueRentals(), soon = dueSoonRentals()
  const month = todayISO().slice(0, 7)
  const incomeMonth = S.rentals.filter(r => r.startDate?.slice(0, 7) === month).reduce((s, r) => s + (r.totalCharged || 0), 0)
  const profitable = S.machines.filter(m => machineFinancials(m.id).isProfitable).length
  el.innerHTML = `
    <div class="grid cols-4">
      <div class="card stat"><div class="num">${total}</div><div class="label">Máquinas en inventario</div></div>
      <div class="card stat"><div class="num">${disp}</div><div class="label">Disponibles ahora</div></div>
      <div class="card stat"><div class="num">${rent}</div><div class="label">Actualmente rentadas</div></div>
      <div class="card stat ${over.length ? 'alert' : ''}"><div class="num">${over.length}</div><div class="label">Devoluciones atrasadas</div></div>
    </div>
    <div class="grid cols-3" style="margin-top:16px;">
      <div class="card stat"><div class="num">${fmtMoney(incomeMonth)}</div><div class="label">Ingresos por renta — este mes</div></div>
      <div class="card stat"><div class="num">${profitable}/${total || 0}</div><div class="label">Máquinas con ganancia neta</div></div>
      <div class="card stat"><div class="num">${mant}</div><div class="label">En mantenimiento</div></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card"><h3>⏰ Atención inmediata</h3>
        ${over.length === 0 && soon.length === 0 ? '<div class="empty">Sin devoluciones próximas ni atrasadas. Todo en orden.</div>' : ''}
        ${over.map(r => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border);">
          <div><div><strong>${machineName(r.machineId)}</strong> — ${customerName(r.customerId)}</div>
          <div class="small muted">Debió devolverse ${fmtDate(r.expectedReturn)} (hace ${daysBetween(r.expectedReturn, todayISO())} días)</div></div>
          <span class="badge danger">Atrasada</span></div>`).join('')}
        ${soon.map(r => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border);">
          <div><div><strong>${machineName(r.machineId)}</strong> — ${customerName(r.customerId)}</div>
          <div class="small muted">Vence: ${fmtDate(r.expectedReturn)}</div></div>
          <span class="badge warn">Por vencer</span></div>`).join('')}
        ${(over.length || soon.length) ? `<div style="margin-top:10px;"><a class="link" onclick="showView('alertas')">Ver todas las alertas →</a></div>` : ''}
      </div>
      <div class="card"><h3>🏆 Más rentadas</h3>
        ${S.machines.length === 0 ? '<div class="empty">Aún no hay máquinas.</div>' : topTable()}
      </div>
    </div>`
}
function topTable() {
  const s = [...S.machines].sort((a, b) => (b.rentalCount || 0) - (a.rentalCount || 0)).slice(0, 6)
  return `<div class="table-scroll"><table><thead><tr><th>Máquina</th><th>Veces rentada</th><th>Estatus</th></tr></thead><tbody>
    ${s.map(m => `<tr><td>${m.name}</td><td>${m.rentalCount || 0}</td><td>${statusBadge(m.status)}</td></tr>`).join('')}
  </tbody></table></div>`
}

/* ── REPORTES DE RENTABILIDAD ── */
function renderReportes() {
  const el = document.getElementById('view-reportes')
  if (!S.machines.length) {
    el.innerHTML = '<h2>Reportes de rentabilidad</h2><div class="card"><div class="empty">Da de alta máquinas y registra rentas para ver reportes.</div></div>'
    return
  }
  el.innerHTML = `
    <h2>Reportes de rentabilidad por máquina</h2>
    <div class="section-note">Ganancia neta = ingresos − (costo de compra + mantenimientos). Al llegar al 100% la máquina ya recuperó su inversión.</div>
    <div class="grid cols-2">
      ${S.machines.map(m => {
        const f = machineFinancials(m.id)
        return `<div class="card">
          <div class="flex-between"><h3 style="margin:0;">${m.name}</h3>${statusBadge(m.status)}</div>
          <p class="small muted">${m.brand} ${m.model} · Rentada ${m.rentalCount || 0} veces</p>
          <table>
            <tr><td class="muted">Costo de adquisición</td><td style="text-align:right;">${fmtMoney(f.purchaseCost)}</td></tr>
            <tr><td class="muted">Costo de mantenimientos</td><td style="text-align:right;">${fmtMoney(f.maintCost)}</td></tr>
            <tr><td class="muted"><strong>Inversión total</strong></td><td style="text-align:right;"><strong>${fmtMoney(f.totalCost)}</strong></td></tr>
            <tr><td class="muted">Ingresos acumulados</td><td style="text-align:right;">${fmtMoney(f.income)}</td></tr>
            <tr><td class="muted"><strong>Ganancia / pérdida neta</strong></td>
              <td style="text-align:right;"><strong style="color:${f.netProfit >= 0 ? 'var(--teal-deep)' : 'var(--red)'}">${fmtMoney(f.netProfit)}</strong></td></tr>
          </table>
          <div style="margin:10px 0 4px;">
            <div class="flex-between small muted"><span>Recuperación de inversión</span><span>${f.recovered.toFixed(0)}%</span></div>
            <div class="progress-bar"><div style="width:${f.recovered}%;background:${f.isProfitable ? 'linear-gradient(90deg,var(--teal),var(--teal-deep))' : 'linear-gradient(90deg,var(--amber),var(--accent-deep))'}"></div></div>
          </div>
          ${f.isProfitable ? '<span class="badge ok">✔ Genera ganancia neta</span>' : `<span class="badge warn">Recuperando — faltan ${fmtMoney(Math.max(0, f.totalCost - f.income))}</span>`}
        </div>`
      }).join('')}
    </div>`
}

/* ── GESTIÓN DE USUARIOS ── */
async function renderUsuarios() {
  if (currentProfile?.role !== 'admin') {
    document.getElementById('view-usuarios').innerHTML = '<div class="empty">Acceso restringido.</div>'
    return
  }
  const el = document.getElementById('view-usuarios')
  el.innerHTML = '<div class="empty">Cargando usuarios…</div>'
  const { data: profiles, error } = await sb.from('profiles').select('*').order('created_at')
  if (error) { el.innerHTML = `<div class="empty">Error: ${error.message}</div>`; return }
  el.innerHTML = `
    <div class="toolbar"><h2 style="margin:0;">Gestión de usuarios</h2>
      <button class="btn" onclick="openCreateUserModal()">+ Nuevo usuario</button></div>
    <div class="card">
      ${profiles.length === 0 ? '<div class="empty">Sin usuarios.</div>' : `
      <div class="table-scroll">
        <table><thead><tr>
          <th>Nombre</th><th>Correo</th><th>Rol</th><th>Creado</th><th></th>
        </tr></thead><tbody>
          ${profiles.map(p => `<tr>
            <td><strong>${p.full_name || '—'}</strong></td>
            <td>${p.email}</td>
            <td>
              <select onchange="updateUserRole('${p.id}',this.value)" style="font-size:.8rem;padding:5px 8px;border-radius:7px;">
                <option value="user"  ${p.role === 'user' ? 'selected' : ''}>Usuario</option>
                <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </td>
            <td class="small muted">${p.created_at ? new Date(p.created_at).toLocaleDateString('es-MX') : '—'}</td>
            <td>${p.id === ME.id ? '<span class="badge ok">Tú</span>' : `<button class="btn small danger" onclick="deleteUser('${p.id}','${(p.email || '').replace(/'/g, "\\'")}')">Eliminar</button>`}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>`}
    </div>
    <div class="section-note" style="margin-top:14px;">Solo los administradores pueden ver y gestionar usuarios.</div>`
}
window.openCreateUserModal = () => {
  openModal(`<h2>Nuevo usuario</h2>
    <div class="form-grid">
      <label>Nombre completo<input id="nu_name" type="text" placeholder="Nombre Apellido"></label>
      <label>Correo electrónico<input id="nu_email" type="email" placeholder="correo@ejemplo.com"></label>
      <label>Contraseña<input id="nu_pass" type="password" placeholder="Mínimo 8 caracteres"></label>
      <label>Rol
        <select id="nu_role">
          <option value="user">Usuario</option>
          <option value="admin">Administrador</option>
        </select>
      </label>
    </div>
    <div id="nu_err" style="color:var(--red);font-size:.82rem;margin-top:8px;"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn gold" onclick="createUser()">Crear usuario</button>
    </div>`)
}
window.createUser = async () => {
  const name = document.getElementById('nu_name').value.trim()
  const email = document.getElementById('nu_email').value.trim()
  const pass = document.getElementById('nu_pass').value
  const role = document.getElementById('nu_role').value
  const errEl = document.getElementById('nu_err')
  errEl.textContent = ''
  if (!email || !pass) { errEl.textContent = 'Correo y contraseña son obligatorios'; return }
  if (pass.length < 8) { errEl.textContent = 'Contraseña mínimo 8 caracteres'; return }
  showLoading('Creando usuario…')
  try {
    const { data: { session } } = await sb.auth.getSession()
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'create', email, password: pass, fullName: name, role })
    })
    const json = await res.json()
    if (!res.ok || json.error) throw new Error(json.error || 'Error desconocido')
    toast('Usuario creado: ' + email)
    closeModal()
    renderUsuarios()
  } catch (e) {
    hideLoading()
    if (document.getElementById('nu_err')) document.getElementById('nu_err').textContent = e.message
    else toast('Error: ' + e.message)
  } finally { hideLoading() }
}
window.updateUserRole = async (userId, newRole) => {
  const { error } = await sb.from('profiles').update({ role: newRole }).eq('id', userId)
  if (error) toast('Error actualizando rol: ' + error.message)
  else toast('Rol actualizado')
}
window.deleteUser = async (userId, userEmail) => {
  if (!confirm(`¿Eliminar al usuario ${userEmail}? Esta acción es irreversible.`)) return
  showLoading('Eliminando usuario…')
  try {
    const { data: { session } } = await sb.auth.getSession()
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'delete', userId })
    })
    const json = await res.json()
    if (!res.ok || json.error) throw new Error(json.error || 'Error desconocido')
    toast('Usuario eliminado')
    renderUsuarios()
  } catch (e) { toast('Error: ' + e.message) } finally { hideLoading() }
}

/* ── NAVEGACIÓN Y PESTAÑAS ── */
const TABS = [
  { id: 'dashboard', label: 'Panel', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { id: 'inventario', label: 'Inventario', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'grupos', label: 'Grupos', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { id: 'mantenimientos', label: 'Mantenimiento', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'clientes', label: 'Clientes', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'rentas', label: 'Rentas', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'alertas', label: 'Alertas', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { id: 'reportes', label: 'Reportes', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'usuarios', label: 'Usuarios', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', adminOnly: true },
]
const renderFns = {
  dashboard: renderDashboard, inventario: renderInventario, grupos: renderGrupos,
  mantenimientos: renderMantenimientos, clientes: renderClientes, rentas: renderRentas,
  alertas: renderAlertas, reportes: renderReportes, usuarios: renderUsuarios
}
function buildNav() {
  const nav = document.getElementById('nav'); if (!nav) return; nav.innerHTML = ''
  const isAdmin = currentProfile?.role === 'admin'
  TABS.forEach(t => {
    if (t.adminOnly && !isAdmin) return
    const b = document.createElement('button')
    b.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><path d="${t.icon}"/></svg>${t.label}`
    b.dataset.tab = t.id
    b.onclick = () => showView(t.id); nav.appendChild(b)
  })
}
window.showView = id => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  const v = document.getElementById('view-' + id)
  if (v) v.classList.add('active')
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === id))
  if (renderFns[id]) renderFns[id]()
}
window.closeModal = closeModal

/* Inicialización */
async function supabase_init() {
  const { data: { session } } = await sb.auth.getSession()
  if (!session) {
    document.getElementById('loginScreen').style.display = 'flex'
    document.getElementById('appRoot').style.display = 'none'
  }
}
supabase_init()
