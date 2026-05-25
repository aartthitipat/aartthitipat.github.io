/* ════════════════════════════════════════
   student.js — หน้านักเรียน (student.html)
   ════════════════════════════════════════ */

let currentMember = null;
let realtimeChannel = null;

/* ─────────── INIT ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();

  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('inStudentId').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('logoutBtn').addEventListener('click', doLogout);

  /* Auto-login if session saved */
  const savedId = sessionStorage.getItem('stuMemberId');
  if (savedId) loadAndShow(Number(savedId));
});

/* ─────────── LOGIN ─────────── */
async function doLogin() {
  const input = document.getElementById('inStudentId');
  const err   = document.getElementById('loginErr');
  const btn   = document.getElementById('loginBtn');
  const sid   = input.value.trim();

  if (!sid) { err.textContent = '⚠ กรุณาใส่รหัสนักเรียน'; return; }

  btn.disabled    = true;
  btn.textContent = 'กำลังตรวจสอบ…';
  err.textContent = '';

  const { data, error } = await sb
    .from('members')
    .select('*')
    .eq('student_id', sid)
    .maybeSingle();

  btn.disabled    = false;
  btn.textContent = 'เข้าสู่ระบบ';

  if (error || !data) {
    err.textContent = '❌ ไม่พบรหัสนักเรียนนี้ในระบบ';
    input.focus();
    return;
  }

  sessionStorage.setItem('stuMemberId', data.id);
  showDash(data);
}

async function loadAndShow(id) {
  const { data, error } = await sb
    .from('members').select('*').eq('id', id).maybeSingle();
  if (error || !data) { sessionStorage.removeItem('stuMemberId'); return; }
  showDash(data);
}

/* ─────────── LOGOUT ─────────── */
function doLogout() {
  sessionStorage.removeItem('stuMemberId');
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  currentMember = null;
  document.getElementById('dashSection').style.display  = 'none';
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('inStudentId').value  = '';
  document.getElementById('loginErr').textContent = '';
}

/* ─────────── SHOW DASHBOARD ─────────── */
function showDash(member) {
  currentMember = member;

  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('dashSection').style.display  = 'block';

  document.getElementById('sNum').textContent  = member.number;
  document.getElementById('sName').textContent = member.name;
  document.getElementById('sSid').textContent  = `รหัส ${member.student_id}`;

  render();
  setupRealtime();
}

/* ─────────── RENDER EVERYTHING ─────────── */
function render() {
  const s = getMemberWeekStatus(currentMember);
  renderStatus(s);
  renderWeeks(s);
  renderPay(s);
}

/* ── Status banner ── */
function renderStatus(s) {
  const el = document.getElementById('statusCard');
  if (s.isCurrentPaid) {
    el.className = 'stu-status-card paid';
    el.innerHTML = `
      <div class="stu-status-icon paid">✓</div>
      <div class="stu-status-body">
        <div class="stu-status-title">ชำระครบแล้ว</div>
        <div class="stu-status-sub">จ่ายแล้ว ${s.weeksPaid}/${s.weeks.length} สัปดาห์
          · รวม ฿${s.amtPaid.toLocaleString()}</div>
      </div>`;
  } else {
    el.className = 'stu-status-card unpaid';
    el.innerHTML = `
      <div class="stu-status-icon unpaid">!</div>
      <div class="stu-status-body">
        <div class="stu-status-title">มียอดค้างชำระ</div>
        <div class="stu-status-sub">ค้าง ${s.weeksOwed} สัปดาห์ · ฿${s.amtOwed}</div>
      </div>`;
  }
}

/* ── Week history ── */
function renderWeeks(s) {
  const curWeek = currentMondayISO();
  document.getElementById('weekList').innerHTML = s.weeks.length
    ? s.weeks.map((w, i) => {
        const paid  = i < s.weeksPaid;
        const isCur = w === curWeek;
        return `
          <div class="stu-week-item ${paid ? 'paid' : 'unpaid'}">
            <div class="stu-week-left">
              <div class="stu-week-check ${paid ? 'paid' : 'unpaid'}">
                ${paid ? '✓' : i + 1}
              </div>
              <div>
                <div class="stu-week-label">
                  สัปดาห์ที่ ${i + 1}
                  ${isCur ? '<span class="stu-cur-badge">สัปดาห์นี้</span>' : ''}
                </div>
                <div class="stu-week-date">${fmtWeekDate(w)}</div>
              </div>
            </div>
            <div class="stu-week-amt ${paid ? 'paid' : 'unpaid'}">
              ${paid
                ? `<span>✓</span> ฿${AMOUNT_PER_WEEK}`
                : `<span class="stu-owe-tag">ค้าง</span> ฿${AMOUNT_PER_WEEK}`}
            </div>
          </div>`;
      }).join('')
    : '<p style="color:var(--muted);font-size:13px;text-align:center;padding:16px 0">ยังไม่มีข้อมูลสัปดาห์</p>';
}

/* ── QR + Pay section ── */
function renderPay(s) {
  const el = document.getElementById('paySection');

  if (s.isCurrentPaid) {
    el.innerHTML = `
      <div class="stu-paid-banner">
        <span style="font-size:40px">🎉</span>
        <div style="font-size:16px;font-weight:800;color:var(--green)">ชำระครบทุกสัปดาห์แล้ว</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">ขอบคุณที่ชำระเงินตรงเวลา</div>
      </div>`;
    return;
  }

  const qrAmt = s.amtOwed;
  el.innerHTML = `
    <div class="stu-qr-card">
      <div class="sec-lbl" style="margin-bottom:4px;justify-content:center">สแกน QR เพื่อโอนเงิน</div>
      <div class="stu-qr-hint">โอน ฿${qrAmt}${s.weeksOwed > 1 ? ` · ${s.weeksOwed} สัปดาห์` : ''}</div>

      <div class="stu-qr-wrap">
        <img id="qrImg"
             src="https://promptpay.io/${PROMPTPAY_PHONE}/${qrAmt}"
             alt="PromptPay QR" />
      </div>

      <div class="stu-amt-row">
        <span class="modal-amt-prefix">฿</span>
        <input class="modal-amt-input" id="payInput"
               type="number" min="${AMOUNT_PER_WEEK}" step="${AMOUNT_PER_WEEK}"
               value="${qrAmt}" />
      </div>
      <p class="stu-amt-hint">เปลี่ยนจำนวนได้ถ้าต้องการจ่ายหลายสัปดาห์</p>

      <button class="btn-primary" style="width:100%;margin-top:10px" id="payBtn">
        📱 ยืนยันโอนผ่าน QR
      </button>
      <button class="btn-cash" id="cashBtn">
        💵 จ่ายเป็นเงินสด
      </button>
    </div>`;

  /* Live-update QR when amount changes */
  document.getElementById('payInput').addEventListener('input', () => {
    const amt = parseInt(document.getElementById('payInput').value) || AMOUNT_PER_WEEK;
    document.getElementById('qrImg').src =
      `https://promptpay.io/${PROMPTPAY_PHONE}/${amt}`;
  });

  document.getElementById('payBtn').addEventListener('click',  confirmPayment);
  document.getElementById('cashBtn').addEventListener('click', confirmPayment);
  document.getElementById('payInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmPayment();
  });
}

/* ─────────── CONFIRM PAYMENT ─────────── */
async function confirmPayment() {
  const btn     = document.getElementById('payBtn');
  const cashBtn = document.getElementById('cashBtn');
  const input   = document.getElementById('payInput');
  const added   = parseInt(input?.value) || AMOUNT_PER_WEEK;

  if (btn)     { btn.disabled = true;     btn.textContent = 'กำลังบันทึก…'; }
  if (cashBtn) { cashBtn.disabled = true; }

  const curAmt    = Number(currentMember.amount_paid) || 0;
  const newTotal  = curAmt + added;
  const weeks     = getAllWeekISOs();
  const weeksPaid = Math.floor(newTotal / AMOUNT_PER_WEEK);
  const isPaid    = weeksPaid >= weeks.length;
  const now       = new Date().toISOString();

  const { error } = await sb
    .from('members')
    .update({ amount_paid: newTotal, paid: isPaid, paid_at: now })
    .eq('id', currentMember.id);

  if (error) {
    if (btn)     { btn.disabled = false;     btn.textContent = '📱 ยืนยันโอนผ่าน QR'; }
    if (cashBtn) { cashBtn.disabled = false; }
    toast('❌ เกิดข้อผิดพลาด กรุณาลองใหม่');
    return;
  }

  currentMember = { ...currentMember, amount_paid: newTotal, paid: isPaid, paid_at: now };
  render();
  toast(`✓ บันทึก ฿${added} · รวม ${weeksPaid} สัปดาห์`);
}

/* ─────────── REALTIME ─────────── */
function setupRealtime() {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);

  realtimeChannel = sb.channel(`stu:${currentMember.id}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'members',
        filter: `id=eq.${currentMember.id}` },
      payload => {
        currentMember = { ...currentMember, ...payload.new };
        render();
      }
    )
    .subscribe();
}
