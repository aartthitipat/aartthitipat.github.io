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
