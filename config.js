/* ══════════════════════════════════════════════════════
   config.js — ตั้งค่า Supabase + ฟังก์ชันใช้ร่วมกัน
   ══════════════════════════════════════════════════════

   วิธีตั้งค่า:
   1. ไปที่ https://supabase.com แล้วสร้าง project ใหม่
   2. ไปที่ Settings → API
   3. Copy "Project URL"  → ใส่ใน SUPABASE_URL
   4. Copy "anon public"  → ใส่ใน SUPABASE_KEY
   ══════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://spfejbjlgsgxmkwbzrhx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZmVqYmpsZ3NneG1rd2J6cmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjk2MzIsImV4cCI6MjA5NDg0NTYzMn0.S3wJ6v_XmaXMZVOZXHv6mnC64r8jE_7-eFHXnk7_a0Q';  // eyJhbGciOi...
/* ── Supabase client ── */
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── Weekly payment config ── */
const WEEK_START       = '2026-05-25'; // วันจันทร์แรกที่เริ่มเก็บเงิน
const AMOUNT_PER_WEEK  = 20;
const PROMPTPAY_PHONE  = '0950979168'; // เบอร์ PromptPay

/* ── Week helpers (ใช้ร่วมกันทั้งสองหน้า) ── */
function _toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function currentMondayISO() {
  const now  = new Date();
  const day  = now.getDay();              // 0=Sun 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(now);
  mon.setDate(mon.getDate() + diff);
  return _toISO(mon);
}

function getAllWeekISOs() {
  const weeks   = [];
  const current = currentMondayISO();
  let cursor = WEEK_START;
  while (cursor <= current) {
    weeks.push(cursor);
    const d = new Date(cursor + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    cursor = _toISO(d);
  }
  return weeks;
}

function fmtWeekDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

/* member = object from members table (has .amount_paid) */
function getMemberWeekStatus(member) {
  const weeks     = getAllWeekISOs();
  const amtPaid   = Number(member.amount_paid) || 0;
  const weeksPaid = Math.floor(amtPaid / AMOUNT_PER_WEEK);
  const weeksOwed = Math.max(0, weeks.length - weeksPaid);
  return {
    weeks,
    weeksPaid,
    weeksOwed,
    isCurrentPaid : weeksPaid >= weeks.length,
    amtOwed       : weeksOwed * AMOUNT_PER_WEEK,
    amtPaid,
  };
}

/* ══════════════════════════════════════════════════════
   ฟังก์ชันใช้ร่วมกัน (ทั้ง index.html และ admin.html)
   ══════════════════════════════════════════════════════ */

/* Theme toggle + localStorage persist */
function setupTheme() {
  const btn   = document.getElementById('themeBtn');
  const saved = localStorage.getItem('theme') || 'light';

  document.documentElement.setAttribute('data-theme', saved);
  btn.textContent = saved === 'dark' ? '☀️ Light' : '🌙 Dark';

  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    btn.textContent = next === 'dark' ? '☀️ Light' : '🌙 Dark';
    localStorage.setItem('theme', next);
  });
}

/* Toast notification */
let _toastTimer;
function toast(msg) {
  const wrap = document.getElementById('toastWrap');
  document.getElementById('toastMsg').textContent = msg;
  wrap.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => wrap.classList.remove('show'), 3200);
}

/* Escape HTML (ป้องกัน XSS) */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Format datetime เป็นภาษาไทย */
function fmtDate(iso) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
