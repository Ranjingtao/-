/* ============================================================
   app.js — 时光记事本 核心逻辑
   数据存储在 localStorage
   ============================================================ */

const STORAGE_KEY = 'timeline_events';
const DIARY_KEY = 'timeline_diary';

// ==================== 数据层 ====================

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function loadDiary() {
  try {
    return JSON.parse(localStorage.getItem(DIARY_KEY)) || {};
  } catch { return {}; }
}

function saveDiary(diary) {
  localStorage.setItem(DIARY_KEY, JSON.stringify(diary));
}

/** 生成唯一 ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 格式化日期为中文 */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const week = ['日','一','二','三','四','五','六'][d.getDay()];
  return `${y}年${m}月${day}日 星期${week}`;
}

/** 计算从某天到今天的天数 */
function daysSince(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today - target;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** 计算从今天到某天的天数 */
function daysUntil(dateStr) {
  return -daysSince(dateStr);
}

// ==================== 全局状态 ====================

let events = loadEvents();
let diary = loadDiary();
let editingEventId = null;
let viewingEventId = null;
let pendingDeleteId = null;

// ==================== DOM 引用 ====================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  eventList: $('#event-list'),
  emptyState: $('#empty-state'),
  statTotal: $('#stat-total'),
  statLongest: $('#stat-longest'),
  statTotalDiary: $('#stat-total-diary'),
  // 弹窗：事件
  modalEvent: $('#modal-event'),
  modalEventTitle: $('#modal-event-title'),
  eventName: $('#event-name'),
  eventDate: $('#event-date'),
  eventType: $('#event-type'),
  eventNote: $('#event-note'),
  eventId: $('#event-id'),
  eventColorVal: $('#event-color-val'),
  btnSaveEvent: $('#btn-save-event'),
  btnDeleteEvent: $('#btn-delete-event'),
  btnCloseEvent: $('#btn-close-event'),
  btnCancelEvent: $('#btn-cancel-event'),
  // 弹窗：详情
  modalDetail: $('#modal-detail'),
  detailTitle: $('#detail-title'),
  detailBadge: $('#detail-badge'),
  detailDays: $('#detail-days'),
  detailUnit: $('#detail-unit'),
  detailSubtitle: $('#detail-subtitle'),
  diaryDate: $('#diary-date'),
  diaryContent: $('#diary-content'),
  diaryList: $('#diary-list'),
  btnCloseDetail: $('#btn-close-detail'),
  // 确认弹窗
  modalConfirm: $('#modal-confirm'),
  confirmMsg: $('#confirm-msg'),
};

// ==================== 渲染 ====================

function renderStats() {
  const total = events.length;
  let longest = 0;
  let largestDays = -Infinity;
  events.forEach(e => {
    const ds = e.type === 'until' ? daysUntil(e.date) : daysSince(e.date);
    if (ds > largestDays) { largestDays = ds; longest = ds; }
  });
  if (!isFinite(largestDays)) longest = 0;

  let totalDiary = 0;
  Object.values(diary).forEach(arr => { totalDiary += arr.length; });

  dom.statTotal.textContent = total;
  dom.statLongest.textContent = longest;
  dom.statTotalDiary.textContent = totalDiary;
}

function renderEventList() {
  // 排序：最近的排在前面（按距今/倒数天数升序）
  const sorted = [...events].sort((a, b) => {
    const da = a.type === 'until' ? daysUntil(a.date) : daysSince(a.date);
    const db = b.type === 'until' ? daysUntil(b.date) : daysSince(b.date);
    return da - db;
  });

  dom.eventList.innerHTML = sorted.map(e => {
    const ds = e.type === 'until' ? daysUntil(e.date) : daysSince(e.date);
    const absDays = Math.abs(ds);
    const label = e.type === 'until'
      ? (ds > 0 ? '还剩' : '已过')
      : '已经';
    const unitText = e.type === 'until'
      ? (ds > 0 ? '天' : '天')
      : '天';

    return `
      <div class="event-card" data-id="${e.id}" onclick="openDetail('${e.id}')">
        <div class="color-bar" style="background:${e.color || '#6366f1'}"></div>
        <div class="event-info">
          <div class="event-name">${escHtml(e.name)}</div>
          <div class="event-date-text">${formatDate(e.date)}</div>
          ${e.note ? `<div class="event-note">${escHtml(e.note)}</div>` : ''}
        </div>
        <div class="event-days">
          <div class="days-number" style="color:${e.color || '#6366f1'}">${absDays}</div>
          <div class="days-label">${label}${unitText}</div>
        </div>
        <button class="event-menu-btn" onclick="event.stopPropagation();editEvent('${e.id}')" title="编辑">⋯</button>
      </div>
    `;
  }).join('');

  dom.emptyState.style.display = events.length === 0 ? '' : 'none';
  dom.eventList.style.display = events.length === 0 ? 'none' : '';
}

function renderDiaryList() {
  if (!viewingEventId) { dom.diaryList.innerHTML = ''; return; }

  const entries = diary[viewingEventId] || [];

  // 新到旧排序
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  dom.diaryList.innerHTML = sorted.length === 0
    ? `<div class="diary-empty">还没有记录，在下方添加第一条吧 ✍️</div>`
    : sorted.map(entry => {
        const event = events.find(e => e.id === viewingEventId);
        const eventStart = event ? event.date : '';
        const dayNum = daysSince(eventStart) - daysSince(entry.date);
        const absDay = Math.abs(dayNum);
        return `
          <div class="diary-item">
            <div class="diary-item-header">
              <span class="diary-item-date">${formatDate(entry.date)}</span>
              <span class="diary-item-days">第 ${absDay} 天</span>
            </div>
            <div class="diary-item-content">${escHtml(entry.content)}</div>
            <button class="diary-item-delete" onclick="deleteDiaryEntry('${entry.id}')" title="删除">✕</button>
          </div>
        `;
      }).join('');
}

function renderAll() {
  renderStats();
  renderEventList();
}

// ==================== 事件操作 ====================

function openAddModal() {
  editingEventId = null;
  dom.modalEventTitle.textContent = '添加纪念日';
  dom.eventName.value = '';
  dom.eventDate.value = new Date().toISOString().slice(0, 10);
  dom.eventType.value = 'since';
  dom.eventNote.value = '';
  dom.eventId.value = '';
  dom.eventColorVal.value = '#6366f1';
  dom.btnDeleteEvent.style.display = 'none';

  // 重置颜色选择器
  $$('#color-picker .color-dot').forEach(d => d.classList.remove('active'));
  const first = $('#color-picker .color-dot[data-color="#6366f1"]');
  if (first) first.classList.add('active');

  openModal('modal-event');
  dom.eventName.focus();
}

function editEvent(id) {
  const event = events.find(e => e.id === id);
  if (!event) return;

  editingEventId = id;
  dom.modalEventTitle.textContent = '编辑纪念日';
  dom.eventName.value = event.name;
  dom.eventDate.value = event.date;
  dom.eventType.value = event.type;
  dom.eventNote.value = event.note || '';
  dom.eventId.value = id;
  dom.eventColorVal.value = event.color || '#6366f1';
  dom.btnDeleteEvent.style.display = '';

  // 同步颜色选择器
  $$('#color-picker .color-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.color === (event.color || '#6366f1'));
  });

  openModal('modal-event');
}

function saveEvent() {
  const name = dom.eventName.value.trim();
  const date = dom.eventDate.value;
  const type = dom.eventType.value;
  const note = dom.eventNote.value.trim();
  const color = dom.eventColorVal.value;

  if (!name) { dom.eventName.focus(); return; }
  if (!date) { dom.eventDate.focus(); return; }

  if (editingEventId) {
    const idx = events.findIndex(e => e.id === editingEventId);
    if (idx !== -1) {
      events[idx] = { ...events[idx], name, date, type, note, color };
    }
  } else {
    events.push({ id: uid(), name, date, type, note, color });
  }

  saveEvents(events);
  closeModal('modal-event');
  renderAll();
}

function confirmDeleteEvent() {
  pendingDeleteId = editingEventId;
  dom.confirmMsg.textContent = '确定要删除这个纪念日吗？相关的日记记录也会一并删除。此操作不可撤销。';
  openModal('modal-confirm');
}

function doDeleteEvent() {
  if (!pendingDeleteId) return;
  events = events.filter(e => e.id !== pendingDeleteId);
  delete diary[pendingDeleteId];
  saveEvents(events);
  saveDiary(diary);
  pendingDeleteId = null;
  closeModal('modal-confirm');
  closeModal('modal-event');
  if (viewingEventId) closeModal('modal-detail');
  editingEventId = null;
  renderAll();
}

// ==================== 详情 / 日记 ====================

function openDetail(id) {
  viewingEventId = id;
  const event = events.find(e => e.id === id);
  if (!event) return;

  const ds = event.type === 'until' ? daysUntil(event.date) : daysSince(event.date);
  const absDays = Math.abs(ds);
  const prefix = event.type === 'until'
    ? (ds > 0 ? '距离' : '自')
    : '自';

  dom.detailTitle.textContent = event.name;
  dom.detailBadge.textContent = event.type === 'until' ? '倒数日' : '纪念日';
  dom.detailDays.textContent = absDays;
  dom.detailUnit.textContent = '天';
  dom.detailSubtitle.textContent = `${prefix} ${formatDate(event.date)}`;
  dom.detailDays.style.color = event.color || '#6366f1';

  // 设置日记日期默认值
  dom.diaryDate.value = new Date().toISOString().slice(0, 10);

  renderDiaryList();
  openModal('modal-detail');
}

function addDiaryEntry() {
  if (!viewingEventId) return;
  const date = dom.diaryDate.value;
  const content = dom.diaryContent.value.trim();
  if (!date || !content) return;

  if (!diary[viewingEventId]) diary[viewingEventId] = [];
  diary[viewingEventId].push({ id: uid(), date, content });

  saveDiary(diary);
  dom.diaryContent.value = '';
  dom.diaryDate.value = new Date().toISOString().slice(0, 10);
  renderDiaryList();
  renderStats();
}

function deleteDiaryEntry(entryId) {
  if (!viewingEventId || !diary[viewingEventId]) return;
  diary[viewingEventId] = diary[viewingEventId].filter(e => e.id !== entryId);
  saveDiary(diary);
  renderDiaryList();
  renderStats();
}

// ==================== 弹窗控制 ====================

function openModal(name) {
  $(`#${name}`).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(name) {
  $(`#${name}`).classList.remove('active');
  // 检查是否还有任何弹窗打开
  const anyOpen = $$('.modal-overlay.active').length > 0;
  if (!anyOpen) document.body.style.overflow = '';
}

function closeAllModals() {
  $$('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
}

// ==================== 主题切换 ====================

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  $('#theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('timeline_theme', next);
}

function initTheme() {
  const saved = localStorage.getItem('timeline_theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    $('#theme-toggle').textContent = '☀️';
  }
}

// ==================== 工具函数 ====================

function escHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

// ==================== 事件绑定 ====================

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderAll();

  // 主题切换
  $('#theme-toggle').addEventListener('click', toggleTheme);

  // 添加按钮
  $('#btn-add-event').addEventListener('click', openAddModal);

  // 保存事件
  dom.btnSaveEvent.addEventListener('click', saveEvent);
  dom.btnDeleteEvent.addEventListener('click', confirmDeleteEvent);
  dom.btnCloseEvent.addEventListener('click', () => closeModal('modal-event'));
  dom.btnCancelEvent.addEventListener('click', () => closeModal('modal-event'));

  // 关闭详情
  dom.btnCloseDetail.addEventListener('click', () => closeModal('modal-detail'));

  // 添加日记
  $('#btn-add-diary').addEventListener('click', addDiaryEntry);
  dom.diaryContent.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addDiaryEntry();
    }
  });

  // 确认弹窗
  $('#btn-confirm-yes').addEventListener('click', doDeleteEvent);
  $('#btn-confirm-no').addEventListener('click', () => { pendingDeleteId = null; closeModal('modal-confirm'); });

  // 关闭弹窗（点击遮罩）
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        const modalId = overlay.id;
        closeModal(modalId);
        if (modalId === 'modal-event') editingEventId = null;
        if (modalId === 'modal-detail') viewingEventId = null;
      }
    });
  });

  // ESC 关闭弹窗
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openOverlay = document.querySelector('.modal-overlay.active');
      if (openOverlay) {
        closeModal(openOverlay.id);
        if (openOverlay.id === 'modal-event') editingEventId = null;
        if (openOverlay.id === 'modal-detail') viewingEventId = null;
        if (openOverlay.id === 'modal-confirm') pendingDeleteId = null;
      }
    }
  });

  // 颜色选择器
  $('#color-picker').addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    $$('#color-picker .color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    dom.eventColorVal.value = dot.dataset.color;
  });

  // 事件列表 - 阻止菜单按钮冒泡（已在 HTML 中处理）
  // 空状态中的按钮也已处理

  // 监听 storage 变化（多标签页同步）
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      events = loadEvents();
      renderAll();
      if (viewingEventId) renderDiaryList();
    }
    if (e.key === DIARY_KEY) {
      diary = loadDiary();
      renderStats();
      if (viewingEventId) renderDiaryList();
    }
  });
});

// 暴露方法到全局
window.openDetail = openDetail;
window.editEvent = editEvent;
window.deleteDiaryEntry = deleteDiaryEntry;
