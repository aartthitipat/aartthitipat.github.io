/**
 * data.js — จัดการข้อมูลทั้งหมดผ่าน Supabase
 *
 * Data model ใหม่:
 *   Group.members = สมาชิกทั่วไป (ไม่รวมเจ้าของ)
 *   Member = { id, displayName, isOwner:false, joinedAt, progress:{[itemId]:bool} }
 *   Item = { id, text, createdAt }  ← ไม่มี checked state (อยู่ที่ member.progress แทน)
 */

const SUPABASE_URL = 'https://ejunahjyottlrrhvwfck.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqdW5haGp5b3R0bHJyaHZ3ZmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDQwOTMsImV4cCI6MjA5MzEyMDA5M30.z5HhHD1i760Q0tHnOLCgX2tYwvL8ujnTpl0HMWaQaRI';

let _sb;
try {
  const { createClient } = window.supabase;
  _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[DB] Supabase client initialized OK');
} catch (e) {
  console.error('[DB] Supabase init FAILED:', e);
  alert('ไม่สามารถเชื่อมต่อ Supabase ได้ — กรุณาตรวจสอบ internet');
}

const DB = {
  KEYS: { CURRENT: 'cl_current' },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  generateInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  },

  // ─── Users ───────────────────────────────────────────
  async findUserByUsername(username) {
    const { data, error } = await _sb
      .from('cl_users').select('data')
      .eq('username', username.toLowerCase()).maybeSingle();
    if (error || !data) return null;
    return data.data;
  },

  async findUserById(id) {
    const { data, error } = await _sb
      .from('cl_users').select('data')
      .eq('id', id).maybeSingle();
    if (error || !data) return null;
    return data.data;
  },

  async createUser({ username, email, password }) {
    const existingUser = await this.findUserByUsername(username);
    if (existingUser) return { success: false, error: 'Username นี้ถูกใช้แล้ว' };

    const { data: emailCheck } = await _sb
      .from('cl_users').select('id')
      .filter('data->>email', 'ilike', email.toLowerCase()).maybeSingle();
    if (emailCheck) return { success: false, error: 'Email นี้ถูกใช้แล้ว' };

    const id = this.generateId();
    const user = {
      id, username, email, password,
      role: username.toLowerCase() === 'admin' ? 'admin' : 'user',
      createdAt: new Date().toISOString(),
    };

    const { error } = await _sb.from('cl_users').insert({
      id, username: username.toLowerCase(), data: user
    });
    if (error) return { success: false, error: 'เกิดข้อผิดพลาด: ' + error.message };
    return { success: true, user };
  },

  // ─── Current User (Session) ──────────────────────────
  getCurrentUser() {
    return JSON.parse(localStorage.getItem(this.KEYS.CURRENT) || 'null');
  },

  setCurrentUser(user) {
    if (user) {
      const { password: _, ...safeUser } = user;
      localStorage.setItem(this.KEYS.CURRENT, JSON.stringify(safeUser));
    } else {
      localStorage.removeItem(this.KEYS.CURRENT);
    }
  },

  async login(username, password) {
    const user = await this.findUserByUsername(username);
    if (!user) return { success: false, error: 'ไม่พบ username นี้' };
    if (user.password !== password) return { success: false, error: 'รหัสผ่านไม่ถูกต้อง' };
    this.setCurrentUser(user);
    return { success: true, user };
  },

  logout() {
    localStorage.removeItem(this.KEYS.CURRENT);
  },

  // ─── Anonymous Member Session ────────────────────────
  getMemberSession(groupId) {
    return JSON.parse(localStorage.getItem(`cl_join_${groupId}`) || 'null');
  },

  setMemberSession(groupId, session) {
    localStorage.setItem(`cl_join_${groupId}`, JSON.stringify(session));
  },

  clearMemberSession(groupId) {
    localStorage.removeItem(`cl_join_${groupId}`);
  },

  // ─── Migration (old → new format) ───────────────────
  migrateGroupIfNeeded(group) {
    if (!group.members || group.members.length === 0) {
      // กลุ่มใหม่ (ไม่มีสมาชิกเลย) — ไม่ต้อง migrate
      return { group, migrated: false };
    }
    const first = group.members[0];
    // ถ้ามี userId แสดงว่าเป็น format เก่า
    if (!('userId' in first)) return { group, migrated: false };

    const migrated = {
      ...group,
      // เก็บ owner ไว้ด้วย (ใช้ userId ตรงๆ เป็น id ของ owner)
      members: group.members.map(m => ({
        id: m.role === 'owner' ? m.userId : ('anon_' + m.userId),
        displayName: m.username,
        isOwner: m.role === 'owner',
        joinedAt: m.joinedAt,
        progress: {},
      })),
      categories: group.categories.map(cat => ({
        ...cat,
        items: cat.items.map(item => ({
          id: item.id,
          text: item.text,
          createdAt: item.createdAt || new Date().toISOString(),
        })),
      })),
    };

    return { group: migrated, migrated: true };
  },

  // ─── Groups ──────────────────────────────────────────
  async getGroups() {
    const { data, error } = await _sb.from('cl_groups').select('data');
    if (error || !data) return [];
    return data.map(row => this.migrateGroupIfNeeded(row.data).group);
  },

  async getGroupsForUser(userId) {
    const { data, error } = await _sb.from('cl_groups').select('data');
    if (error || !data) return [];
    return data.map(row => this.migrateGroupIfNeeded(row.data).group)
      .filter(g => g.ownerId === userId);
  },

  async findGroupById(id) {
    const { data, error } = await _sb
      .from('cl_groups').select('data').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const { group, migrated } = this.migrateGroupIfNeeded(data.data);
    if (migrated) await this.updateGroupData(group);
    return group;
  },

  async findGroupByCode(code) {
    const { data, error } = await _sb
      .from('cl_groups').select('data')
      .eq('invite_code', code.toUpperCase()).maybeSingle();
    if (error || !data) return null;
    const { group, migrated } = this.migrateGroupIfNeeded(data.data);
    if (migrated) await this.updateGroupData(group);
    return group;
  },

  async updateGroupData(group) {
    const { error } = await _sb
      .from('cl_groups').update({ data: group }).eq('id', group.id);
    if (error) console.error('[DB] updateGroupData error:', error);
    return !error;
  },

  async createGroup({ name, description, emoji, currentUser }) {
    const group = {
      id: this.generateId(),
      name,
      description: description || '',
      emoji: emoji || '📋',
      inviteCode: this.generateInviteCode(),
      ownerId: currentUser.id,
      ownerName: currentUser.username,
      createdAt: new Date().toISOString(),
      members: [{
        id: currentUser.id,
        displayName: currentUser.username,
        isOwner: true,
        joinedAt: new Date().toISOString(),
        progress: {},
      }],
      categories: [],
    };

    const { error } = await _sb.from('cl_groups').insert({
      id: group.id,
      invite_code: group.inviteCode,
      data: group
    });

    if (error) {
      console.error('[DB] createGroup error:', error);
      return { success: false, error: 'ไม่สามารถสร้างกลุ่มได้' };
    }
    return { success: true, group };
  },

  // เข้าร่วมกลุ่มแบบไม่ต้องลงทะเบียน — ใส่แค่ชื่อ
  async joinGroupAnonymous(groupId, displayName) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };

    const memberId = 'anon_' + this.generateId();
    group.members.push({
      id: memberId,
      displayName: displayName.trim(),
      isOwner: false,
      joinedAt: new Date().toISOString(),
      progress: {},
    });

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'ไม่สามารถเข้าร่วมได้' };
    return { success: true, memberId, displayName: displayName.trim() };
  },

  async leaveGroup(groupId, memberId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    const member = group.members.find(m => m.id === memberId);
    if (!member) return { success: false, error: 'ไม่พบสมาชิก' };
    if (member.isOwner) return { success: false, error: 'เจ้าของไม่สามารถออกจากกลุ่มได้' };

    group.members = group.members.filter(m => m.id !== memberId);
    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  async removeMember(groupId, ownerId, memberId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    const isAdmin = await this.isAdminId(ownerId);
    if (group.ownerId !== ownerId && !isAdmin) return { success: false, error: 'เฉพาะเจ้าของเท่านั้น' };
    const target = group.members.find(m => m.id === memberId);
    if (target && target.isOwner) return { success: false, error: 'ไม่สามารถลบเจ้าของได้' };

    group.members = group.members.filter(m => m.id !== memberId);
    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  async deleteGroup(groupId, userId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    const isAdmin = await this.isAdminId(userId);
    if (group.ownerId !== userId && !isAdmin) return { success: false, error: 'เฉพาะเจ้าของเท่านั้นที่ลบได้' };

    const { error } = await _sb.from('cl_groups').delete().eq('id', groupId);
    if (error) return { success: false, error: 'เกิดข้อผิดพลาดในการลบกลุ่ม' };
    return { success: true };
  },

  // ─── Categories ──────────────────────────────────────
  async addCategory(groupId, userId, { name, color }) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    const isAdmin = await this.isAdminId(userId);
    if (group.ownerId !== userId && !isAdmin) return { success: false, error: 'เฉพาะเจ้าของเท่านั้น' };

    const category = {
      id: this.generateId(),
      name,
      color: color || '#f5a623',
      items: [],
      createdAt: new Date().toISOString(),
    };
    group.categories.push(category);

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true, category };
  },

  async deleteCategory(groupId, userId, categoryId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    const isAdmin = await this.isAdminId(userId);
    if (group.ownerId !== userId && !isAdmin) return { success: false, error: 'เฉพาะเจ้าของเท่านั้น' };

    // ลบ progress ของทุกสมาชิกสำหรับ items ในหมวดนี้
    const cat = group.categories.find(c => c.id === categoryId);
    if (cat) {
      const itemIds = cat.items.map(i => i.id);
      group.members.forEach(m => {
        if (m.progress) itemIds.forEach(id => delete m.progress[id]);
      });
    }

    group.categories = group.categories.filter(c => c.id !== categoryId);
    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  // ─── Items ───────────────────────────────────────────
  async addItem(groupId, userId, categoryId, text) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    const isAdmin = await this.isAdminId(userId);
    if (group.ownerId !== userId && !isAdmin) return { success: false, error: 'เฉพาะเจ้าของเท่านั้น' };

    const cat = group.categories.find(c => c.id === categoryId);
    if (!cat) return { success: false, error: 'ไม่พบหมวดหมู่' };

    const item = {
      id: this.generateId(),
      text,
      createdAt: new Date().toISOString(),
    };
    cat.items.push(item);

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true, item };
  },

  async deleteItem(groupId, userId, categoryId, itemId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    const isAdmin = await this.isAdminId(userId);
    if (group.ownerId !== userId && !isAdmin) return { success: false, error: 'เฉพาะเจ้าของเท่านั้น' };

    const cat = group.categories.find(c => c.id === categoryId);
    if (!cat) return { success: false, error: 'ไม่พบหมวดหมู่' };

    // ลบ progress ของทุกสมาชิกสำหรับ item นี้
    group.members.forEach(m => {
      if (m.progress) delete m.progress[itemId];
    });

    cat.items = cat.items.filter(i => i.id !== itemId);
    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  // toggle item ของสมาชิกคนเดียว (ไม่กระทบคนอื่น)
  async toggleItem(groupId, memberId, itemId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };

    const member = group.members.find(m => m.id === memberId);
    if (!member) return { success: false, error: 'ไม่พบสมาชิก' };

    if (!member.progress) member.progress = {};
    member.progress[itemId] = !member.progress[itemId];

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true, checked: member.progress[itemId] };
  },

  async resetMemberProgress(groupId, memberId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };

    const member = group.members.find(m => m.id === memberId);
    if (!member) return { success: false, error: 'ไม่พบสมาชิก' };

    member.progress = {};
    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  // สถิติของสมาชิกคนเดียว
  getMemberStats(group, memberId) {
    const member = group.members.find(m => m.id === memberId);
    const progress = member?.progress || {};
    let total = 0, done = 0;
    group.categories.forEach(cat => {
      cat.items.forEach(item => {
        total++;
        if (progress[item.id]) done++;
      });
    });
    return { total, done };
  },

  // สถิติ template (จำนวน items ทั้งหมด + จำนวนสมาชิก)
  getGroupStats(group) {
    let total = 0;
    group.categories.forEach(c => { total += c.items.length; });
    return { total, memberCount: group.members.length };
  },

  async isAdminId(userId) {
    const user = await this.findUserById(userId);
    return user && (user.role === 'admin' || user.username.toLowerCase() === 'admin');
  },

  async regenerateInviteCode(groupId, ownerId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    const isAdmin = await this.isAdminId(ownerId);
    if (group.ownerId !== ownerId && !isAdmin) return { success: false, error: 'เฉพาะเจ้าของ' };

    group.inviteCode = this.generateInviteCode();
    const { error } = await _sb
      .from('cl_groups')
      .update({ invite_code: group.inviteCode, data: group })
      .eq('id', groupId);

    if (error) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true, code: group.inviteCode };
  },
};
