/* ════════════════════════════════════════
   app.js — หน้าหลัก (index.html)
   ════════════════════════════════════════ */

let members   = [];
let activeMid = null;

/* ─────────── INIT ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  loadAll();
  setupModal();
  setupRealtime();
});

/* ─────────── LOAD DATA ─────────── */
async function loadAll() {
  document.getElementById('loadWrap').style.display      = 'block';
  document.getElementById('memberContent').style.display = 'none';

  const membersRes = await sb.from('members').select('*').order('number', { ascending: true });

  if (membersRes.error) {
    document.getElementById('loadWrap').innerHTML = `
      <p style="color:var(--red);font-weight:700">⚠ โหลดข้อมูลไม่ได้</p>
      <p style="font-size:12px;color:var(--muted);margin-top:8px">${esc(membersRes.error.message)}</p>
      <p style="font-size:12px;color:var(--muted);margin-top:4px">
        กรุณาตรวจสอบ SUPABASE_URL และ SUPABASE_KEY ใน config.js
      </p>`;
    return;
  }

  members = membersRes.data || [];

  renderMembers();
  document.getElementById('loadWrap').style.display      = 'none';
  document.getElementById('memberContent').style.display = 'block';
}

/* ─────────── RENDER รายชื่อ ─────────── */
function renderMembers() {
  const curWeek = currentMondayISO();

  let paidThisWeek   = 0;
  let totalCollected = 0;

  members.forEach(m => {
    const s = getMemberWeekStatus(m);
    if (s.isCurrentPaid) paidThisWeek++;
    totalCollected += s.amtPaid;
  });

  document.getElementById('stTotal').textContent = members.length;
  document.getElementById('stPaid').textContent  = paidThisWeek;
  document.getElementById('stLeft').textContent  = members.length - paidThisWeek;
  document.getElementById('stSum').textContent   = '฿' + totalCollected.toLocaleString();

  const weeks = getAllWeekISOs();
  document.getElementById('weekLabel').textContent =
    `สัปดาห์ที่ ${weeks.length}  ·  ${fmtWeekDate(curWeek)}`;

  document.getElementById('memberList').innerHTML = members.map(m => {
    const s = getMemberWeekStatus(m);
    return `
      <div class="member-row" onclick="openModal(${m.id})">
        <div class="num-badge ${s.isCurrentPaid ? 'paid' : ''}">${m.number}</div>
        <div class="m-info">
          <div class="m-name">${esc(m.name)}</div>
          <div class="m-amt">${esc(m.student_id)}</div>
          <div class="m-week-stat">
            จ่ายแล้ว ${s.weeksPaid}/${s.weeks.length} สัปดาห์
            ${s.weeksOwed > 0
              ? `<span class="owe-badge">ค้าง ฿${s.amtOwed}</span>`
              : ''}
          </div>
        </div>
        <span class="pill ${s.isCurrentPaid ? 'paid' : 'pending'}">
          ${s.isCurrentPaid ? '✓ จ่ายแล้ว' : 'รอจ่าย'}
        </span>
      </div>`;
  }).join('');
}

/* ─────────── QR MODAL ─────────── */
function setupModal() {
  document.getElementById('modalX').addEventListener('click', closeModal);
  document.getElementById('qrOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('qrOverlay')) closeModal();
  });
}

function openModal(id) {
  const m = members.find(x => Number(x.id) === Number(id));
  if (!m) return;
  activeMid = id;

  document.getElementById('mNum').textContent  = m.number;
  document.getElementById('mName').textContent = m.name;
  document.getElementById('mAmt').textContent  = m.student_id;

  refreshModal(id);
  document.getElementById('qrOverlay').classList.add('show');
}

function refreshModal(id) {
  const m = members.find(x => Number(x.id) === Number(id));
  if (!m) return;
  const s = getMemberWeekStatus(m);

  /* QR — always show PromptPay, amount = what they owe (min 20) */
  const qrAmt = s.amtOwed > 0 ? s.amtOwed : AMOUNT_PER_WEEK;
  const img   = document.getElementById('qrImg');
  img.src = `https://promptpay.io/${PROMPTPAY_PHONE}/${qrAmt}`;
  img.style.display = 'block';
  document.getElementById('qrNoImg').style.display = 'none';

  /* Hint text */
  document.getElementById('mHint').textContent = s.amtOwed > 0
    ? `สแกน QR โอน ฿${s.amtOwed}${s.weeksOwed > 1 ? ` (${s.weeksOwed} สัปดาห์)` : ''}`
    : 'สแกน QR เพื่อโอนเงิน';

  document.getElementById('qrScanned').style.display = s.isCurrentPaid ? 'flex' : 'none';
  renderWeekList(s);
  renderModalAction(s);
}

function closeModal() {
  document.getElementById('qrOverlay').classList.remove('show');
  activeMid = null;
}

/* ─────────── WEEK TICK LIST IN MODAL ─────────── */
function renderWeekList(s) {
  const curWeek = currentMondayISO();
  document.getElementById('weekList').innerHTML = s.weeks.map((w, i) => {
    const paid  = i < s.weeksPaid;
    const isCur = w === curWeek;
    return `
      <div class="week-item ${paid ? 'paid' : 'unpaid'}">
        <span class="week-num">ส.${i + 1}${isCur ? ' ★' : ''}</span>
        <span class="week-date">${fmtWeekDate(w)}</span>
        <span class="week-status ${paid ? 'paid' : 'unpaid'}">
          ${paid ? `✓ ฿${AMOUNT_PER_WEEK}` : `ค้าง ฿${AMOUNT_PER_WEEK}`}
        </span>
      </div>`;
  }).join('');
}

/* ─────────── MODAL ACTION ─────────── */
function renderModalAction(s) {
  const el = document.getElementById('modalAction');
  if (s.isCurrentPaid) {
    el.innerHTML = `
      <div class="paid-box">
        ✓ ชำระครบแล้ว ${s.weeksPaid}/${s.weeks.length} สัปดาห์
      </div>`;
  } else {
    const defaultAmt = s.weeksOwed * AMOUNT_PER_WEEK;
    el.innerHTML = `
      <div class="pay-week-hint">
        ค้าง ${s.weeksOwed} สัปดาห์ · ฿${s.amtOwed}
      </div>
      <div class="modal-amt-row">
        <span class="modal-amt-prefix">฿</span>
        <input class="modal-amt-input" id="modalAmtInput"
               type="number" min="20" step="20" value="${defaultAmt}" />
      </div>
      <button class="btn-primary" style="width:100%;margin-top:10px" id="payBtn">
        📱 ยืนยันโอนผ่าน QR
      </button>
      <button class="btn-cash" id="cashBtn">
        💵 จ่ายเป็นเงินสด
      </button>`;
    document.getElementById('payBtn').addEventListener('click',  confirmPayment);
    document.getElementById('cashBtn').addEventListener('click', confirmPayment);
    document.getElementById('modalAmtInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmPayment();
    });
  }
}

/* ─────────── CONFIRM PAYMENT ─────────── */
async function confirmPayment() {
  const btn      = document.getElementById('payBtn');
  const cashBtn  = document.getElementById('cashBtn');
  const amtInput = document.getElementById('modalAmtInput');
  const amtAdded = parseInt(amtInput?.value) || AMOUNT_PER_WEEK;

  if (btn)     { btn.disabled = true;     btn.textContent = 'กำลังบันทึก…'; }
  if (cashBtn) { cashBtn.disabled = true; }

  const member     = members.find(m => Number(m.id) === Number(activeMid));
  const currentAmt = Number(member?.amount_paid) || 0;
  const newTotal   = currentAmt + amtAdded;
  const weeks      = getAllWeekISOs();
  const weeksPaid  = Math.floor(newTotal / AMOUNT_PER_WEEK);
  const isPaid     = weeksPaid >= weeks.length;
  const now        = new Date().toISOString();

  const { error } = await sb
    .from('members')
    .update({ amount_paid: newTotal, paid: isPaid, paid_at: now })
    .eq('id', activeMid);

  if (error) {
    if (btn)     { btn.disabled = false;     btn.textContent = '📱 ยืนยันโอนผ่าน QR'; }
    if (cashBtn) { cashBtn.disabled = false; }
    toast('❌ เกิดข้อผิดพลาด กรุณาลองใหม่');
    return;
  }

  const idx = members.findIndex(m => Number(m.id) === Number(activeMid));
  if (idx !== -1) {
    members[idx].amount_paid = newTotal;
    members[idx].paid        = isPaid;
    members[idx].paid_at     = now;
  }

  renderMembers();
  refreshModal(activeMid);
  toast(`✓ บันทึก ฿${amtAdded} (รวม ${weeksPaid} สัปดาห์)`);
}

/* ─────────── REALTIME ─────────── */
function setupRealtime() {
  sb.channel('index:members')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'members' },
      payload => {
        const idx = members.findIndex(m => Number(m.id) === Number(payload.new.id));
        if (idx !== -1) {
          members[idx] = { ...members[idx], ...payload.new };
          renderMembers();
          if (activeMid && Number(activeMid) === Number(payload.new.id)) {
            refreshModal(activeMid);
          }
        }
      }
    )
    .subscribe();
}
