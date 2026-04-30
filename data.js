/**
 * data.js — จัดการข้อมูลทั้งหมดผ่าน Supabase
 */

const SUPABASE_URL = 'https://ejunahjyottlrrhvwfck.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqdW5haGp5b3R0bHJyaHZ3ZmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDQwOTMsImV4cCI6MjA5MzEyMDA5M30.z5HhHD1i760Q0tHnOLCgX2tYwvL8ujnTpl0HMWaQaRI';
const { createClient } = window.supabase || {};
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DB = {
  // ─── Keys for Session Storage ──────────────────────
  KEYS: {
    CURRENT: 'cl_current',
  },

  // ─── Helpers ─────────────────────────────────────────
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  generateInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  },

  // ─── Users ───────────────────────────────────────────
  async findUserByUsername(username) {
    const { data, error } = await supabase
      .from('cl_users')
      .select('data')
      .eq('username', username.toLowerCase())
      .single();
    if (error || !data) return null;
    return data.data;
  },

  async findUserById(id) {
    const { data, error } = await supabase
      .from('cl_users')
      .select('data')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return data.data;
  },

  async createUser({ username, email, password }) {
    const existingUser = await this.findUserByUsername(username);
    if (existingUser) {
      return { success: false, error: 'Username นี้ถูกใช้แล้ว' };
    }

    const { data: emailCheck } = await supabase
      .from('cl_users')
      .select('id')
      .filter('data->>email', 'eq', email.toLowerCase())
      .maybeSingle();

    if (emailCheck) {
      return { success: false, error: 'Email นี้ถูกใช้แล้ว' };
    }

    const id = this.generateId();
    const user = {
      id,
      username,
      email,
      password,
      role: username.toLowerCase() === 'admin' ? 'admin' : 'user',
      createdAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('cl_users').insert({
      id: id,
      username: username.toLowerCase(),
      data: user
    });

    if (error) return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างบัญชี' };
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

  // ─── Groups ──────────────────────────────────────────
  async getGroups() {
    const { data, error } = await supabase.from('cl_groups').select('data');
    if (error || !data) return [];
    return data.map(row => row.data);
  },

  async getGroupsForUser(userId) {
    const { data, error } = await supabase
      .from('cl_groups')
      .select('data')
      .contains('data', { members: [{ userId }] });

    if (error || !data) return [];
    return data.map(row => row.data);
  },

  async findGroupById(id) {
    const { data, error } = await supabase
      .from('cl_groups')
      .select('data')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return data.data;
  },

  async findGroupByCode(code) {
    const { data, error } = await supabase
      .from('cl_groups')
      .select('data')
      .eq('invite_code', code.toUpperCase())
      .single();
    if (error || !data) return null;
    return data.data;
  },

  async updateGroupData(group) {
    const { error } = await supabase
      .from('cl_groups')
      .update({ data: group })
      .eq('id', group.id);
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
      members: [
        { userId: currentUser.id, username: currentUser.username, role: 'owner', canEdit: true, joinedAt: new Date().toISOString() }
      ],
      categories: [],
    };

    const { error } = await supabase.from('cl_groups').insert({
      id: group.id,
      invite_code: group.inviteCode,
      data: group
    });

    if (error) return { success: false, error: 'ไม่สามารถสร้างกลุ่มได้' };
    return { success: true, group };
  },

  async joinGroup(code, currentUser) {
    const group = await this.findGroupByCode(code);
    if (!group) return { success: false, error: 'ไม่พบโค้ดนี้ กรุณาตรวจสอบอีกครั้ง' };

    if (group.members.some(m => m.userId === currentUser.id)) {
      return { success: false, error: 'คุณเป็นสมาชิกกลุ่มนี้อยู่แล้ว' };
    }
    group.members.push({
      userId: currentUser.id,
      username: currentUser.username,
      role: 'member',
      canEdit: false,
      joinedAt: new Date().toISOString(),
    });

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'ไม่สามารถเข้าร่วมกลุ่มได้' };
    return { success: true, group };
  },

  async leaveGroup(groupId, userId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    if (group.ownerId === userId) return { success: false, error: 'เจ้าของกลุ่มไม่สามารถออกได้ (ต้องลบกลุ่มแทน)' };

    group.members = group.members.filter(m => m.userId !== userId);

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  async deleteGroup(groupId, userId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    if (group.ownerId !== userId) return { success: false, error: 'เฉพาะเจ้าของเท่านั้นที่ลบได้' };

    const { error } = await supabase.from('cl_groups').delete().eq('id', groupId);
    if (error) return { success: false, error: 'เกิดข้อผิดพลาดในการลบกลุ่ม' };
    return { success: true };
  },

  // ─── Categories ──────────────────────────────────────
  async addCategory(groupId, userId, { name, color }) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    if (group.ownerId !== userId) return { success: false, error: 'เฉพาะเจ้าของเท่านั้นที่จัดการได้' };

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
    if (group.ownerId !== userId) return { success: false, error: 'เฉพาะเจ้าของเท่านั้นที่จัดการได้' };

    group.categories = group.categories.filter(c => c.id !== categoryId);

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  async renameCategory(groupId, userId, categoryId, newName) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    if (group.ownerId !== userId) return { success: false, error: 'เฉพาะเจ้าของเท่านั้นที่จัดการได้' };

    const cat = group.categories.find(c => c.id === categoryId);
    if (!cat) return { success: false, error: 'ไม่พบหมวดหมู่' };
    cat.name = newName;

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  // ─── Items ───────────────────────────────────────────
  async addItem(groupId, userId, categoryId, text) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };

    const canEdit = group.ownerId === userId || (group.members.find(m => m.userId === userId)?.canEdit);
    if (!canEdit) return { success: false, error: 'คุณไม่มีสิทธิ์เพิ่มรายการ' };

    const cat = group.categories.find(c => c.id === categoryId);
    if (!cat) return { success: false, error: 'ไม่พบหมวดหมู่' };

    const item = {
      id: this.generateId(),
      text,
      checked: false,
      checkedBy: null,
      checkedByName: null,
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

    const canEdit = group.ownerId === userId || (group.members.find(m => m.userId === userId)?.canEdit);
    if (!canEdit) return { success: false, error: 'คุณไม่มีสิทธิ์ลบรายการ' };

    const cat = group.categories.find(c => c.id === categoryId);
    if (!cat) return { success: false, error: 'ไม่พบหมวดหมู่' };
    cat.items = cat.items.filter(i => i.id !== itemId);

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  async toggleItem(groupId, userId, categoryId, itemId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    if (!group.members.some(m => m.userId === userId)) {
      return { success: false, error: 'คุณไม่ได้อยู่ในกลุ่มนี้' };
    }

    const canEdit = group.ownerId === userId || (group.members.find(m => m.userId === userId)?.canEdit);
    if (!canEdit) return { success: false, error: 'คุณไม่มีสิทธิ์แก้ไขรายการได้ (เป็นผู้ชม)' };

    const cat = group.categories.find(c => c.id === categoryId);
    if (!cat) return { success: false, error: 'ไม่พบหมวดหมู่' };
    const item = cat.items.find(i => i.id === itemId);
    if (!item) return { success: false, error: 'ไม่พบรายการ' };

    item.checked = !item.checked;
    item.checkedBy = item.checked ? userId : null;
    item.checkedByName = item.checked
      ? (group.members.find(m => m.userId === userId)?.username || '?')
      : null;

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true, item };
  },

  async resetChecklist(groupId, userId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };

    const canEdit = group.ownerId === userId || (group.members.find(m => m.userId === userId)?.canEdit);
    if (!canEdit) return { success: false, error: 'คุณไม่มีสิทธิ์รีเซ็ตรายการได้' };

    group.categories.forEach(c => {
      c.items.forEach(i => {
        i.checked = false;
        i.checkedBy = null;
        i.checkedByName = null;
      });
    });

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true };
  },

  async toggleMemberEdit(groupId, ownerId, targetUserId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    if (group.ownerId !== ownerId) return { success: false, error: 'เฉพาะเจ้าของเท่านั้นที่จัดการสิทธิ์ได้' };

    const member = group.members.find(m => m.userId === targetUserId);
    if (!member) return { success: false, error: 'ไม่พบสมาชิก' };
    if (member.role === 'owner') return { success: false, error: 'ไม่สามารถเปลี่ยนสิทธิ์เจ้าของได้' };

    member.canEdit = !member.canEdit;

    const success = await this.updateGroupData(group);
    if (!success) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true, canEdit: member.canEdit };
  },

  getGroupStats(group) {
    let total = 0, done = 0;
    group.categories.forEach(c => {
      total += c.items.length;
      done += c.items.filter(i => i.checked).length;
    });
    return { total, done };
  },

  async regenerateInviteCode(groupId, ownerId) {
    const group = await this.findGroupById(groupId);
    if (!group) return { success: false, error: 'ไม่พบกลุ่ม' };
    if (group.ownerId !== ownerId) return { success: false, error: 'เฉพาะเจ้าของ' };

    group.inviteCode = this.generateInviteCode();
    // Update both data JSON and the indexed column
    const { error } = await supabase
      .from('cl_groups')
      .update({ invite_code: group.inviteCode, data: group })
      .eq('id', groupId);

    if (error) return { success: false, error: 'เกิดข้อผิดพลาด' };
    return { success: true, code: group.inviteCode };
  }
};
