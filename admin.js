/* ════════════════════════════════════════
   admin.js — หน้า Admin (admin.html)
   ════════════════════════════════════════ */

let members = [];

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
}

/* ─────────── RENDER STATS ─────────── */
function renderStats() {
  const paid   = members.filter(m => m.paid).length;
  const sumAmt = members.reduce((s, m) => s + (m.amount_paid || 0), 0);

  document.getElementById('adTotal').textContent = members.length;
  document.getElementById('adPaid').textContent  = paid;
  document.getElementById('adSum').textContent   = '฿' + sumAmt.toLocaleString();
}

/* ─────────── RENDER ADMIN LIST ─────────── */
function renderAdminList() {
  document.getElementById('adminList').innerHTML = members.map(m => `
    <div class="admin-row ${m.paid ? 'is-paid' : ''}" data-id="${m.id}">
      <div class="num-badge ${m.paid ? 'paid' : ''}">${m.number}</div>

      <div class="m-info">
        <div class="m-name">${esc(m.name)}</div>
        <div class="m-amt">${esc(m.student_id)}</div>

        <!-- จำนวนเงินที่โอนมา -->
        <div class="amount-row">
          <span class="amt-prefix">฿</span>
          <input
            class="amt-input"
            type="number"
            min="0"
            placeholder="ใส่จำนวนเงิน"
            value="${m.amount_paid > 0 ? m.amount_paid : ''}"
            onkeydown="if(event.key==='Enter') saveAmount(${m.id}, this.parentElement)"
          />
          <button class="btn-save-amt" onclick="saveAmount(${m.id}, this.parentElement)">
            บันทึก
          </button>
          <button class="btn-reset-amt" onclick="resetAmount(${m.id}, this.parentElement)"
                  title="รีเซ็ตจำนวนเงิน">
            ×
          </button>
        </div>

        ${m.paid && m.paid_at
          ? `<div class="m-time">ยืนยันเมื่อ ${fmtDate(m.paid_at)}</div>`
          : ''}
      </div>

      <span class="pill ${m.paid ? 'paid' : 'pending'}">
        ${m.paid ? '✓ โอนแล้ว' : 'รอโอน'}
      </span>
    </div>
  `).join('');
}

/* ─────────── SAVE AMOUNT ─────────── */
async function saveAmount(id, amtRow) {
  const input = amtRow.querySelector('.amt-input');
  const btn   = amtRow.querySelector('.btn-save-amt');
  const val   = parseInt(input.value) || 0;

  btn.disabled    = true;
  btn.textContent = '…';

  const { error } = await sb
    .from('members')
    .update({ amount_paid: val })
    .eq('id', id);

  if (error) {
    btn.disabled    = false;
    btn.textContent = 'บันทึก';
    toast('❌ บันทึกไม่สำเร็จ: ' + error.message);
    return;
  }

  /* อัปเดต local state */
  const idx = members.findIndex(m => m.id === id);
  if (idx !== -1) members[idx].amount_paid = val;

  /* อัปเดต stats เฉพาะ ไม่ต้อง re-render ทั้งหมด */
  renderStats();

  btn.disabled    = false;
  btn.textContent = '✓ บันทึกแล้ว';
  setTimeout(() => { btn.textContent = 'บันทึก'; }, 2000);
  toast(`✓ บันทึก ฿${val.toLocaleString()} เรียบร้อย`);
}

/* ─────────── RESET AMOUNT ─────────── */
async function resetAmount(id, amtRow) {
  const input = amtRow.querySelector('.amt-input');
  const btn   = amtRow.querySelector('.btn-reset-amt');

  btn.disabled = true;

  const { error } = await sb
    .from('members')
    .update({ amount_paid: 0 })
    .eq('id', id);

  btn.disabled = false;

  if (error) {
    toast('❌ รีเซ็ตไม่สำเร็จ: ' + error.message);
    return;
  }

  input.value = '';

  const idx = members.findIndex(m => m.id === id);
  if (idx !== -1) members[idx].amount_paid = 0;

  renderStats();
  toast('รีเซ็ตจำนวนเงินแล้ว');
}

/* ─────────── QR UPLOAD ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('qrInput');
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('❌ กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('❌ ไฟล์ใหญ่เกิน 2MB');
      return;
    }
    uploadQR(file);
    input.value = '';
  });
});

async function uploadQR(file) {
  const label = document.getElementById('uploadLabel');
  label.textContent       = 'กำลังอัปโหลด…';
  label.style.opacity     = '0.6';
  label.style.pointerEvents = 'none';

  const reader = new FileReader();
  reader.onload = async e => {
    const dataUrl = e.target.result;

    const { error } = await sb
      .from('settings')
      .upsert({ id: 1, qr_url: dataUrl });

    label.textContent       = '↑ เปลี่ยน QR Code';
    label.style.opacity     = '';
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
        const idx = members.findIndex(m => m.id === payload.new.id);
        if (idx !== -1) {
          const wasUnpaid = !members[idx].paid;
          members[idx] = { ...members[idx], ...payload.new };

          /* อัปเดตเฉพาะ row ที่เปลี่ยน เพื่อไม่ให้ input ถูก reset */
          updateRow(payload.new.id);
          renderStats();

          if (wasUnpaid && payload.new.paid) {
            toast(`🔔 ${members[idx].name} ยืนยันการโอนแล้ว`);
          }
        }
      }
    )
    .subscribe();
}

/* อัปเดตเฉพาะ row ที่เปลี่ยน (ไม่ reset input ที่กรอกค้างไว้) */
function updateRow(id) {
  const m   = members.find(x => x.id === id);
  const row = document.querySelector(`.admin-row[data-id="${id}"]`);
  if (!m || !row) return;

  row.className = `admin-row ${m.paid ? 'is-paid' : ''}`;

  const badge = row.querySelector('.num-badge');
  badge.className = `num-badge ${m.paid ? 'paid' : ''}`;

  const pill = row.querySelector('.pill');
  pill.className   = `pill ${m.paid ? 'paid' : 'pending'}`;
  pill.textContent = m.paid ? '✓ โอนแล้ว' : 'รอโอน';

  /* อัปเดตเวลาที่ยืนยัน */
  let timeEl = row.querySelector('.m-time');
  if (m.paid && m.paid_at) {
    if (!timeEl) {
      timeEl = document.createElement('div');
      timeEl.className = 'm-time';
      row.querySelector('.amount-row').insertAdjacentElement('afterend', timeEl);
    }
    timeEl.textContent = `ยืนยันเมื่อ ${fmtDate(m.paid_at)}`;
  } else if (timeEl) {
    timeEl.remove();
  }
}
