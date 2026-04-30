/**
 * auth.js — ฟังก์ชันช่วยด้านการยืนยันตัวตน
 * 
 * ให้ include ทั้ง data.js และ auth.js ในทุกหน้าที่ต้องการ login
 */

const Auth = {
  /**
   * บังคับ login — ถ้ายังไม่ได้ login จะ redirect ไปหน้า index
   * เรียกใช้ใน <script> ของทุกหน้าที่ต้องการ authentication
   */
  requireLogin() {
    const user = DB.getCurrentUser();
    if (!user) {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  },

  /**
   * ตรวจสอบว่าเป็นแอดมินหรือไม่
   */
  isAdmin(user) {
    return user && (user.role === 'admin' || user.username.toLowerCase() === 'admin');
  },

  /**
   * ถ้า login แล้ว ไม่ต้องการให้กลับมาหน้า auth — redirect ไป dashboard
   */
  redirectIfLoggedIn() {
    const user = DB.getCurrentUser();
    if (user) {
      window.location.href = 'dashboard.html';
    }
  },

  /**
   * Logout และ redirect ไปหน้า login
   */
  logout() {
    DB.logout();
    window.location.href = 'index.html';
  },

  /**
   * แสดง navbar ที่มีชื่อผู้ใช้และปุ่ม logout
   * เรียกใช้หลัง DOM โหลดเสร็จ
   */
  renderNavbar(user) {
    const nav = document.getElementById('navbar');
    if (!nav || !user) return;
    const initial = user.username.charAt(0).toUpperCase();
    nav.innerHTML = `
      <a href="dashboard.html" class="navbar__brand">
        <div class="navbar__brand-icon">✅</div>
        CheckGroup
      </a>
      <div class="navbar__right">
        <div class="navbar__user">
          <div class="navbar__avatar">${initial}</div>
          <span style="display:none" class="username-display">${user.username}</span>
        </div>
        <button class="btn btn--ghost btn--sm" onclick="Auth.logout()">
          ออกจากระบบ
        </button>
      </div>
    `;
  },

  /**
   * แสดง Toast notification
   */
  showToast(message, type = '') {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast toast--${type}`;
    // เพิ่มไอคอน
    const icons = { success: '✅', error: '❌', '': 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    requestAnimationFrame(() => { toast.classList.add('show'); });
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
  },
};
