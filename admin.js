/* ════════════════════════════════════════
   admin.js — หน้า Admin (admin.html)
   ════════════════════════════════════════ */

let members = [];
const recentlyUpdated = new Set();

/* ─────────── INIT ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupLogin();

  if (sessionStorage.getItem('adminAuth') === '1') {
    showDash();
  } else {
    showLogin();
  }
});

/* ─────────── VIEWS ─────────── */
function showLogin() {
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('dashSection').style.display  = 'none';
}

function showDash() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('dashSection').style.display  = 'block';
  loadAll();
  setupRealtime();
}

/* ─────────── LOGIN ─────────── */
function setupLogin() {
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('inPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('logoutBtn').addEventListener('click', doLogout);
}

function doLogin() {
  const u = document.getElementById('inUser').value.trim();
  const p = document.getElementById('inPass').value;

  if (u === 'admin' && p === '1234') {
    sessionStorage.setItem('adminAuth', '1');
    document.getElementById('loginErr').textContent = '';
    document.getElementById('inUser').value = '';
    document.getElementById('inPass').value = '';
    showDash();
  } else {
    document.getElementById('loginErr').textContent = '❌ Username หรือ Password ไม่ถูกต้อง';
  }
}

function doLogout() {
  sessionStorage.removeItem('adminAuth');
  showLogin();
}

/* ─────────── LOAD DATA ─────────── */
async function loadAll() {
  document.getElementById('adminList').innerHTML =
    '<div class="loading-wrap"><div class="spinner"></div>กำลังโหลด…</div>';

  const [membersRes, settingsRes] = await Promise.all([
    sb.from('members').select('*').order('number', { ascending: true }),
    sb.from('settings').select('qr_url').eq('id', 1).single()
  ]);

  if (membersRes.error) {
    document.getElementById('adminList').innerHTML = `
      <p style="color:var(--red);font-weight:700;text-align:center;padding:24px">
        ⚠ โหลดข้อมูลไม่ได้: ${esc(membersRes.error.message)}
      </p>`;
    return;
  }

  members = membersRes.data || [];
  renderAdminList();
  renderStats();
  renderQRPreview(settingsRes.data?.qr_url || null);
  loadExpenses();
}

/* ─────────── RENDER STATS ─────────── */
function renderStats() {
  let paidThisWeek   = 0;
  let totalCollected = 0;

  members.forEach(m => {
    const s = getMemberWeekStatus(m);
    if (s.isCurrentPaid) paidThisWeek++;
    totalCollected += s.amtPaid;
  });

  document.getElementById('adTotal').textContent = members.length;
  document.getElementById('adPaid').textContent  = paidThisWeek;
  document.getElementById('adSum').textContent   = '฿' + totalCollected.toLocaleString();
}

/* ─────────── RENDER ADMIN LIST ─────────── */
function renderAdminList() {
  const curWeek = currentMondayISO();

  document.getElementById('adminList').innerHTML = members.map(m => {
    const s = getMemberWeekStatus(m);

    /* Week tick rows */
    const weeksHTML = s.weeks.map((w, i) => {
      const paid  = i < s.weeksPaid;
      const isCur = w === curWeek;
      return `
        <div class="week-admin-item">
          <span class="week-admin-label ${isCur ? 'cur-week' : ''}">
            ส.${i + 1} ${fmtWeekDate(w)}${isCur ? ' ★' : ''}
          </span>
          <span class="week-tick ${paid ? 'paid' : 'unpaid'}">
            ${paid ? `✓ ฿${AMOUNT_PER_WEEK}` : `— ค้าง`}
          </span>
        </div>`;
    }).join('');

    return `
      <div class="admin-row ${s.isCurrentPaid ? 'is-paid' : ''}" data-id="${m.id}">
        <div class="num-badge ${s.weeksPaid > 0 ? 'paid' : ''}">${m.number}</div>

        <div class="m-info">
          <div class="m-name">${esc(m.name)}</div>
          <div class="m-amt">${esc(m.student_id)}</div>

          <!-- Week ticks -->
          <div class="week-admin-list">${weeksHTML}</div>

          <!-- Amount input -->
          <div class="amount-row">
            <span class="amt-prefix">฿</span>
            <input
              class="amt-input"
              id="amtInput-${m.id}"
              type="number"
              min="0"
              step="${AMOUNT_PER_WEEK}"
              value="${AMOUNT_PER_WEEK}"
              placeholder="${AMOUNT_PER_WEEK}"
              onkeydown="if(event.key==='Enter') saveAmount(${m.id})"
            />
            <button class="btn-save-amt" onclick="saveAmount(${m.id})">บันทึก</button>
            <button class="btn-reset-amt" onclick="resetPaid(${m.id})" title="รีเซ็ตสถานะ">↺</button>
          </div>

          ${m.paid_at
            ? `<div class="m-time">ชำระล่าสุด ${fmtDate(m.paid_at)}</div>`
            : ''}
        </div>

        <span class="pill ${s.isCurrentPaid ? 'paid' : 'pending'}">
          ${s.isCurrentPaid ? '✓ ' : ''}${s.weeksPaid}/${s.weeks.length} ส.
          ${s.amtOwed > 0
            ? `<br><span class="pill-owe">ค้าง ฿${s.amtOwed}</span>`
            : ''}
        </span>
      </div>`;
  }).join('');
}

/* ─────────── SAVE AMOUNT ─────────── */
async function saveAmount(id) {
  const input = document.getElementById(`amtInput-${id}`);
  const btn   = document.querySelector(`.admin-row[data-id="${id}"] .btn-save-amt`);
  const val   = parseInt(input.value);

  if (!val || val <= 0) {
    toast('⚠ กรุณาใส่จำนวนเงินก่อนกดบันทึก');
    return;
  }

  btn.disabled    = true;
  btn.textContent = '…';

  recentlyUpdated.add(Number(id));
  setTimeout(() => recentlyUpdated.delete(Number(id)), 5000);

  const member     = members.find(m => Number(m.id) === Number(id));
  const currentAmt = Number(member?.amount_paid) || 0;
  const newTotal   = currentAmt + val;
  const weeks      = getAllWeekISOs();
  const weeksPaid  = Math.floor(newTotal / AMOUNT_PER_WEEK);
  const isPaid     = weeksPaid >= weeks.length;
  const now        = new Date().toISOString();

  const { error } = await sb
    .from('members')
    .update({ amount_paid: newTotal, paid: isPaid, paid_at: now })
    .eq('id', id);

  btn.disabled    = false;
  btn.textContent = 'บันทึก';

  if (error) {
    toast('❌ บันทึกไม่สำเร็จ: ' + error.message);
    return;
  }

  const idx = members.findIndex(m => Number(m.id) === Number(id));
  if (idx !== -1) {
    members[idx].amount_paid = newTotal;
    members[idx].paid        = isPaid;
    members[idx].paid_at     = now;
  }

  input.value = AMOUNT_PER_WEEK; // reset to default
  renderAdminList();
  renderStats();
  toast(`✓ เพิ่ม ฿${val} → รวม ฿${newTotal} (${weeksPaid} สัปดาห์)`);
}

/* ─────────── RESET ONE MEMBER ─────────── */
async function resetPaid(id) {
  const row = document.querySelector(`.admin-row[data-id="${id}"]`);
  const btn = row?.querySelector('.btn-reset-amt');
  if (btn) btn.disabled = true;

  recentlyUpdated.add(Number(id));
  setTimeout(() => recentlyUpdated.delete(Number(id)), 5000);

  const { error } = await sb
    .from('members')
    .update({ paid: false, paid_at: null, amount_paid: 0 })
    .eq('id', id);

  if (btn) btn.disabled = false;

  if (error) {
    toast('❌ รีเซ็ตไม่สำเร็จ: ' + error.message);
    return;
  }

  const idx = members.findIndex(m => Number(m.id) === Number(id));
  if (idx !== -1) {
    members[idx].paid        = false;
    members[idx].paid_at     = null;
    members[idx].amount_paid = 0;
  }

  renderAdminList();
  renderStats();
  toast('↺ รีเซ็ตสถานะเป็นยังไม่ได้ชำระ');
}

/* ─────────── RESET ALL ─────────── */
async function resetAllAmounts() {
  if (!confirm('รีเซ็ตยอดเงินทั้งหมดจริงหรือ?\nข้อมูลการชำระเงินของทุกคนจะถูกล้างเป็น 0')) return;

  const btn = document.getElementById('resetAllBtn');
  btn.disabled    = true;
  btn.textContent = 'กำลังรีเซ็ต…';

  const { error } = await sb
    .from('members')
    .update({ paid: false, paid_at: null, amount_paid: 0 })
    .gt('id', 0);

  btn.disabled    = false;
  btn.textContent = '↺ รีเซ็ตยอดเงินทั้งหมด';

  if (error) { toast('❌ รีเซ็ตไม่สำเร็จ: ' + error.message); return; }

  members.forEach(m => { m.paid = false; m.paid_at = null; m.amount_paid = 0; });
  renderAdminList();
  renderStats();
  toast('↺ รีเซ็ตยอดเงินทั้งหมดเรียบร้อย');
}

/* ─────────── EXPENSES ─────────── */
let expenses = [];

async function loadExpenses() {
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    document.getElementById('expenseList').innerHTML =
      `<p style="font-size:12px;color:var(--red);text-align:center;padding:12px">
         ⚠ ยังไม่มีตาราง expenses — กรุณารัน SQL ใน Supabase ก่อน
       </p>`;
    return;
  }

  expenses = data || [];
  renderExpenses();
}

function renderExpenses() {
  const list     = document.getElementById('expenseList');
  const totalEl  = document.getElementById('expenseTotal');
  const totalVal = document.getElementById('expTotalVal');

  if (expenses.length === 0) {
    list.innerHTML = '<p style="font-size:13px;color:var(--muted);text-align:center;padding:16px 0">ยังไม่มีรายการ</p>';
    totalEl.style.display = 'none';
    return;
  }

  list.innerHTML = expenses.map(e => `
    <div class="expense-item">
      <div class="expense-item-info">
        <div class="expense-item-desc">${esc(e.description)}</div>
        <div class="expense-item-date">${fmtDate(e.created_at)}</div>
      </div>
      <div class="expense-item-right">
        <span class="expense-amt">฿${Number(e.amount).toLocaleString()}</span>
        <button class="btn-del-expense" onclick="deleteExpense(${e.id})" title="ลบ">✕</button>
      </div>
    </div>
  `).join('');

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  totalEl.style.display = 'flex';
  totalVal.textContent  = '฿' + total.toLocaleString();
}

async function addExpense() {
  const descInput = document.getElementById('expDesc');
  const amtInput  = document.getElementById('expAmt');
  const btn       = document.getElementById('addExpBtn');

  const desc = descInput.value.trim();
  const amt  = parseInt(amtInput.value);

  if (!desc)           { toast('⚠ กรุณาใส่ชื่อรายการ'); return; }
  if (!amt || amt <= 0) { toast('⚠ กรุณาใส่จำนวนเงิน'); return; }

  btn.disabled    = true;
  btn.textContent = '…';

  const { data, error } = await sb
    .from('expenses')
    .insert({ description: desc, amount: amt })
    .select()
    .single();

  btn.disabled    = false;
  btn.textContent = '+ เพิ่ม';

  if (error) { toast('❌ เพิ่มไม่สำเร็จ: ' + error.message); return; }

  expenses.unshift(data);
  descInput.value = '';
  amtInput.value  = '';
  renderExpenses();
  toast(`✓ บันทึก "${desc}" ฿${amt.toLocaleString()}`);
}

async function deleteExpense(id) {
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) { toast('❌ ลบไม่สำเร็จ: ' + error.message); return; }
  expenses = expenses.filter(e => e.id !== id);
  renderExpenses();
  toast('↺ ลบรายการเรียบร้อย');
}

/* ─────────── QR UPLOAD ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('expDesc').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('expAmt').focus();
  });
  document.getElementById('expAmt').addEventListener('keydown', e => {
    if (e.key === 'Enter') addExpense();
  });

  const input = document.getElementById('qrInput');
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('❌ กรุณาเลือกไฟล์รูปภาพเท่านั้น'); return; }
    if (file.size > 2 * 1024 * 1024)    { toast('❌ ไฟล์ใหญ่เกิน 2MB'); return; }
    uploadQR(file);
    input.value = '';
  });
});

async function uploadQR(file) {
  const label = document.getElementById('uploadLabel');
  label.textContent        = 'กำลังอัปโหลด…';
  label.style.opacity      = '0.6';
  label.style.pointerEvents = 'none';

  const reader = new FileReader();
  reader.onload = async e => {
    const dataUrl = e.target.result;
    const { error } = await sb.from('settings').upsert({ id: 1, qr_url: dataUrl });
    label.textContent        = '↑ เปลี่ยน QR Code';
    label.style.opacity      = '';
    label.style.pointerEvents = '';
    if (error) { toast('❌ อัปโหลดไม่สำเร็จ: ' + error.message); return; }
    renderQRPreview(dataUrl);
    toast('✓ อัปโหลด QR Code เรียบร้อย');
  };
  reader.readAsDataURL(file);
}

function renderQRPreview(url) {
  const img   = document.getElementById('qrPreview');
  const noQr  = document.getElementById('qrNone');
  const label = document.getElementById('uploadLabel');

  if (url) {
    img.src            = url;
    img.style.display  = 'block';
    noQr.style.display = 'none';
    label.textContent  = '↑ เปลี่ยน QR Code';
  } else {
    img.src            = '';
    img.style.display  = 'none';
    noQr.style.display = 'flex';
    label.textContent  = '↑ อัปโหลด QR Code';
  }
}

/* ─────────── REALTIME ─────────── */
let realtimeSetup = false;

function setupRealtime() {
  if (realtimeSetup) return;
  realtimeSetup = true;

  sb.channel('admin:members')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'members' },
      payload => {
        const mid = Number(payload.new.id);
        const idx = members.findIndex(m => Number(m.id) === mid);
        if (idx !== -1) {
          const wasUnpaid = !getMemberWeekStatus(members[idx]).isCurrentPaid;

          if (!recentlyUpdated.has(mid)) {
            members[idx] = { ...members[idx], ...payload.new };
          }

          renderAdminList();
          renderStats();

          if (wasUnpaid && getMemberWeekStatus(members[idx]).isCurrentPaid && !recentlyUpdated.has(mid)) {
            toast(`🔔 ${members[idx].name} ชำระเงินแล้ว`);
          }
        }
      }
    )
    .subscribe();
}
