/* ════════════════════════════════════════
   app.js — หน้าหลัก (index.html)
   ════════════════════════════════════════ */

let members   = [];
let activeMid = null;
let qrImageUrl = null;   // cache QR จาก settings

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

  /* โหลดพร้อมกัน */
  const [membersRes, settingsRes] = await Promise.all([
    sb.from('members').select('*').order('number', { ascending: true }),
    sb.from('settings').select('qr_url').eq('id', 1).single()
  ]);

  if (membersRes.error) {
    document.getElementById('loadWrap').innerHTML = `
      <p style="color:var(--red);font-weight:700">⚠ โหลดข้อมูลไม่ได้</p>
      <p style="font-size:12px;color:var(--muted);margin-top:8px">${esc(membersRes.error.message)}</p>
      <p style="font-size:12px;color:var(--muted);margin-top:4px">
        กรุณาตรวจสอบ SUPABASE_URL และ SUPABASE_KEY ใน config.js
      </p>`;
    return;
  }

  members    = membersRes.data || [];
  qrImageUrl = settingsRes.data?.qr_url || null;

  renderMembers();
  document.getElementById('loadWrap').style.display      = 'none';
  document.getElementById('memberContent').style.display = 'block';
}

/* ─────────── RENDER รายชื่อ ─────────── */
function renderMembers() {
  const paid = members.filter(m => m.paid).length;

  document.getElementById('stTotal').textContent = members.length;
  document.getElementById('stPaid').textContent  = paid;
  document.getElementById('stLeft').textContent  = members.length - paid;

  document.getElementById('memberList').innerHTML = members.map(m => `
    <div class="member-row" onclick="openModal(${m.id})">
      <div class="num-badge ${m.paid ? 'paid' : ''}">${m.number}</div>
      <div class="m-info">
        <div class="m-name">${esc(m.name)}</div>
        <div class="m-amt">${esc(m.student_id)}</div>
      </div>
      <span class="pill ${m.paid ? 'paid' : 'pending'}">
        ${m.paid ? '✓ โอนแล้ว' : 'รอโอน'}
      </span>
    </div>
  `).join('');
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

  /* แสดง QR Image */
  const img = document.getElementById('qrImg');
  if (qrImageUrl) {
    img.src   = qrImageUrl;
    img.style.display = 'block';
    document.getElementById('qrNoImg').style.display = 'none';
  } else {
    img.src   = '';
    img.style.display = 'none';
    document.getElementById('qrNoImg').style.display = 'flex';
  }

  setModalAction(m.paid, m.amount_paid);
  document.getElementById('qrOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('qrOverlay').classList.remove('show');
  activeMid = null;
}

function setModalAction(isPaid, amountPaid) {
  const el = document.getElementById('modalAction');
  if (isPaid) {
    el.innerHTML = `<div class="paid-box">✓ ยืนยันการโอนเรียบร้อยแล้ว</div>`;
  } else {
    el.innerHTML = `
      <div class="modal-amt-row">
        <span class="modal-amt-prefix">฿</span>
        <input class="modal-amt-input" id="modalAmtInput"
               type="number" min="0" placeholder="จำนวนเงินที่โอน" />
      </div>
      <button class="btn-primary" style="width:100%;margin-top:10px" id="payBtn">
        ✓ ยืนยันว่าโอนแล้ว
      </button>`;
    document.getElementById('modalAmtInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmPayment();
    });
    document.getElementById('payBtn').addEventListener('click', confirmPayment);
  }
}

/* ─────────── CONFIRM PAYMENT ─────────── */
async function confirmPayment() {
  const btn      = document.getElementById('payBtn');
  const amtInput = document.getElementById('modalAmtInput');
  const amtPaid  = parseInt(amtInput?.value) || 0;

  btn.disabled    = true;
  btn.textContent = 'กำลังบันทึก…';

  const now = new Date().toISOString();
  const { error } = await sb
    .from('members')
    .update({ paid: true, paid_at: now, amount_paid: amtPaid })
    .eq('id', activeMid);

  if (error) {
    btn.disabled    = false;
    btn.textContent = '✓ ยืนยันว่าโอนแล้ว';
    toast('❌ เกิดข้อผิดพลาด กรุณาลองใหม่');
    return;
  }

  const idx = members.findIndex(m => Number(m.id) === Number(activeMid));
  if (idx !== -1) { members[idx].paid = true; members[idx].paid_at = now; members[idx].amount_paid = amtPaid; }

  renderMembers();
  setModalAction(true);
  toast('✓ บันทึกการโอนเงินเรียบร้อย');
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
          if (Number(activeMid) === Number(payload.new.id) && payload.new.paid) setModalAction(true);
        }
      }
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'settings' },
      payload => {
        if (payload.new?.qr_url) {
          qrImageUrl = payload.new.qr_url;
          /* ถ้า modal เปิดอยู่ อัปเดต QR ทันที */
          if (document.getElementById('qrOverlay').classList.contains('show')) {
            const img = document.getElementById('qrImg');
            img.src = qrImageUrl;
            img.style.display = 'block';
            document.getElementById('qrNoImg').style.display = 'none';
          }
        }
      }
    )
    .subscribe();
}
