// ==================== TRANSLATIONS ====================
// Translations are now in translations.js file

let currentLang = 'en';

function t(key) {
  return translations[currentLang][key] || translations['en'][key] || key;
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('eca-lang', lang);
  
  // Update lang buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  
  // Re-render everything
  updateAllTexts();
  renderChildren();
  if (currentChildId) {
    renderEcaScreen();
  }
}

function updateAllTexts() {
  // Update static texts safely
  const childrenTitle = document.querySelector('#screen-children .card-title');
  if (childrenTitle) {
    childrenTitle.innerHTML = `<span class="icon">👨‍👩‍👧‍👦</span>${t('yourChildren')}`;
  }
  
  const summaryTitle = document.querySelector('#selected-summary .card-title');
  if (summaryTitle) {
    summaryTitle.innerHTML = `
      <span class="icon">📋</span>
      ${t('summary')}
      <div style="display: flex; gap: 8px; margin-left: auto;">
        <button class="share-btn" onclick="shareScheduleAsImage()" title="${t('shareSchedule')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </button>
        <button class="print-btn" onclick="togglePrintMode(true)" title="${t('printMode')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9V2h12v7"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
        </button>
      </div>
    `;
  }
  
  const printClose = document.getElementById('print-close');
  if (printClose) {
    printClose.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
      ${t('backToEdit')}
    `;
  }
  
  // Update share buttons
  updateShareButtons();
}

// ==================== DATA ====================
let ecaData = null;
let ecaDataChaofa = null;
let ecaDataCherngtalay = null;
let children = [];
let currentChildId = null;
let editingChildId = null;

// Time slot filter
let selectedTimeSlot = 'all';

const EXTRA_FEE = 6750;
const FREE_SLOTS = 3;
const EAL_FEE = 25000; // EAL стоит 25,000 бат за весь курс (2 занятия в неделю)

// EAL schedule by year group
const EAL_SCHEDULE = {
  // Years 1-6: Monday + Thursday
  '1': ['Monday', 'Thursday'],
  '2': ['Monday', 'Thursday'],
  '3': ['Monday', 'Thursday'],
  '4': ['Monday', 'Thursday'],
  '5': ['Monday', 'Thursday'],
  '6': ['Monday', 'Thursday'],
  // Years 7-9: Monday + Tuesday
  '7': ['Monday', 'Tuesday'],
  '8': ['Monday', 'Tuesday'],
  '9': ['Monday', 'Tuesday'],
  // Years 10-11: Thursday
  '10': ['Thursday'],
  '11': ['Thursday'],
};

const TIME_SLOTS = {
  'all': { label: 'Все', time: null },
  'after-school': { label: 'After School', time: '15:30', fridayTime: '15:10', desc: '~16:20' },
  'extended': { label: 'Extended', time: '16:30', desc: '~18:00' },
  'early': { label: 'Early', time: '14:30', desc: '~15:15' },
};

// ==================== STORAGE ====================
function saveToStorage() {
  localStorage.setItem('eca-children-v2', JSON.stringify(children));
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem('eca-children-v2');
    if (saved) {
      children = JSON.parse(saved);
      // Миграция: если у ребенка нет кампуса, по умолчанию Chaofa
      let needsSave = false;
      for (const child of children) {
        if (!child.campus) {
          child.campus = 'chaofa';
          needsSave = true;
        }
      }
      if (needsSave) {
        saveToStorage();
      }
    }
  } catch (e) {
    children = [];
  }
}

// ==================== UTILITIES ====================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  if (!text) return '';
  return String(text).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function getYearLabel(yearValue) {
  if (yearValue === '-1') return 'Preschool';
  if (yearValue === '0-ey') return 'Early Years';
  if (yearValue === '0') return 'Reception';
  return `Year ${yearValue}`;
}

function getYearNumber(yearValue) {
  if (yearValue === '-1') return -1;
  if (yearValue === '0-ey') return 0;
  return parseInt(yearValue);
}

function getEmoji(gender, yearValue) {
  if (gender === 'girl') return '👧';
  if (gender === 'boy') return '👦';
  const num = getYearNumber(yearValue);
  if (num <= 0) return '👶';
  if (num <= 6) return '🧒';
  return '🧑';
}

function activityMatchesYear(activity, childYearValue) {
  const childYear = getYearNumber(childYearValue);
  const yearGroups = activity.yearGroups;
  
  const childLabel = getYearLabel(childYearValue);
  if (yearGroups.labels.includes(childLabel)) return true;
  if (childYearValue === '0-ey' && yearGroups.labels.includes('Early Years')) return true;
  if (childYearValue === '0' && yearGroups.labels.includes('Reception')) return true;
  
  if (yearGroups.min !== null && yearGroups.max !== null) {
    if (childYear >= yearGroups.min && childYear <= yearGroups.max) return true;
  }
  
  return false;
}

function getActivityCategory(activity) {
  const id = activity.id || '';
  
  // EAL определяется по ID (PEAL = Primary EAL, SEAL = Secondary EAL)
  if (id.includes('PEAL') || id.includes('SEAL')) return 'eal';
  
  // Boosters по ID
  if (id.includes('BOS')) return 'boosters';
  
  // VAPP по ID
  if (id.includes('VAPP')) return 'vapp';
  
  // AEN по ID
  if (id.includes('AEN')) return 'aen';
  
  // Всё остальное — берём категорию из данных
  return activity.category || 'other';
}

function getActivityGender(activity) {
  const name = activity.name.toLowerCase();
  if (name.includes('boys')) return 'boy';
  if (name.includes('girls')) return 'girl';
  return null;
}

function isActivityHidden(activity, child) {
  const cat = getActivityCategory(activity);
  
  // EAL: show only if child has EAL
  if (cat === 'eal' && !child.hasEal) return true;
  
  // Special categories: show only if enabled in child profile
  if (cat === 'boosters' && !child.showBoosters) return true;
  if (cat === 'vapp' && !child.showVapp) return true;
  if (cat === 'aen' && !child.showAen) return true;
  
  return false;
}

function isEalActivity(activity) {
  const cat = getActivityCategory(activity);
  return cat === 'eal';
}

function getEalBlockedDays(child) {
  if (!child.hasEal) return [];
  const yearNum = getYearNumber(child.year);
  return EAL_SCHEDULE[yearNum] || [];
}

function isEalBlockedSlot(activity, child) {
  if (!child.hasEal) return false;
  
  const blockedDays = getEalBlockedDays(child);
  const time = activity.schedule.time;
  
  // EAL is always at 15:30-16:20
  if (time.start !== '15:30') return false;
  
  for (const day of activity.schedule.days) {
    if (blockedDays.includes(day)) return true;
  }
  return false;
}

function matchesTimeSlot(activity, slot, day) {
  if (slot === 'all') return true;
  
  const time = activity.schedule.time;
  if (!time.start) return false;
  
  const slotInfo = TIME_SLOTS[slot];
  if (!slotInfo || !slotInfo.time) return true;
  
  // Special case for Friday
  if (day === 'Friday' && slot === 'after-school') {
    return time.start === '15:10' || time.start === '15:30';
  }
  
  if (slot === 'after-school') {
    return time.start === '15:30' || time.start === '15:10';
  }
  if (slot === 'extended') {
    return time.start >= '16:30';
  }
  if (slot === 'early') {
    return time.start < '15:00';
  }
  
  return true;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function hasTimeConflict(activity, selectedActivities, data = null) {
  if (!activity.schedule.time.start) return false;
  const dataToUse = data || ecaData;
  if (!dataToUse) return false;
  
  const t1Start = timeToMinutes(activity.schedule.time.start);
  const t1End = timeToMinutes(activity.schedule.time.end);
  
  for (const day of activity.schedule.days) {
    for (const selId of selectedActivities) {
      if (selId === activity.id) continue;
      const selAct = dataToUse.activities.find(a => a.id === selId);
      if (!selAct || !selAct.schedule.time.start) continue;
      
      if (selAct.schedule.days.includes(day)) {
        const t2Start = timeToMinutes(selAct.schedule.time.start);
        const t2End = timeToMinutes(selAct.schedule.time.end);
        
        // Проверяем пересечение временных интервалов
        // Конфликт есть если НЕ (одно заканчивается до начала другого)
        if (!(t1End <= t2Start || t2End <= t1Start)) {
          return true;
        }
      }
    }
  }
  return false;
}

function calculateCost(selectedActivities, data = null) {
  const dataToUse = data || ecaData;
  if (!dataToUse) return { freeUsed: 0, extraFreeCount: 0, fixedCost: 0, extraCost: 0, totalCost: 0, ealCost: 0 };
  
  let freeUsed = 0;
  let extraFreeCount = 0;
  let fixedCost = 0;
  let hasEal = false;

  for (const actId of selectedActivities) {
    const act = dataToUse.activities.find(a => a.id === actId);
    if (!act) continue;
    
    const cat = getActivityCategory(act);
    
    // EAL - проверяем наличие, но не считаем в бесплатных слотах
    if (cat === 'eal') {
      hasEal = true;
      continue; // EAL не считается в бесплатных слотах
    }
    
    // AEN - assigned by school, don't count
    if (cat === 'aen') {
      if (!act.isFree) fixedCost += act.fee;
      continue;
    }

    if (act.isFree) {
      if (freeUsed < FREE_SLOTS) {
        freeUsed++;
      } else {
        extraFreeCount++;
      }
    } else {
      fixedCost += act.fee;
    }
  }

  // EAL стоит 25,000 бат за весь курс (независимо от количества дней)
  const ealCost = hasEal ? EAL_FEE : 0;
  const extraCost = extraFreeCount * EXTRA_FEE;
  const totalCost = fixedCost + extraCost + ealCost;

  return { freeUsed, extraFreeCount, fixedCost, extraCost, ealCost, totalCost };
}

// ==================== RENDERING ====================
function getEcaDataForChild(child) {
  const campus = child.campus || 'chaofa';
  if (campus === 'cherngtalay') {
    return ecaDataCherngtalay;
  }
  return ecaDataChaofa;
}

function getCampusName(campus) {
  if (campus === 'cherngtalay') return 'Cherngtalay';
  return 'Chaofa';
}

function renderChildren() {
  const container = document.getElementById('children-list');
  
  let html = '';
  
  for (const child of children) {
    const selected = child.selectedActivities || [];
    const childEcaData = getEcaDataForChild(child);
    const cost = childEcaData ? calculateCost(selected, childEcaData) : { totalCost: 0, ealCost: 0 };
    
    html += `
      <div class="child-card" onclick="selectChild('${escapeAttr(child.id)}')">
        <div class="child-actions">
          <button class="child-action-btn edit" onclick="event.stopPropagation(); editChild('${escapeAttr(child.id)}')" title="${escapeAttr(t('editChildTitle'))}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="child-action-btn" onclick="event.stopPropagation(); deleteChild('${escapeAttr(child.id)}')" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
        <div class="child-avatar">${getEmoji(child.gender, child.year)}</div>
        <div class="child-name">${escapeHtml(child.name)}</div>
        <div class="child-year">${getYearLabel(child.year)} • ${getCampusName(child.campus || 'chaofa')}</div>
        <div class="child-badges">
          ${child.hasEal ? '<span class="badge badge-eal">EAL</span>' : ''}
          ${selected.length > 0 ? `<span class="badge badge-count">${selected.length} ${t('activities')}</span>` : ''}
          ${cost.totalCost > 0 ? `<span class="badge badge-cost">${cost.totalCost.toLocaleString()} ฿</span>` : ''}
        </div>
      </div>
    `;
  }
  
  html += `
    <div class="add-child-card" onclick="openAddChildModal()">
      <div class="plus">+</div>
      <span>${t('addChild')}</span>
    </div>
  `;
  
  container.innerHTML = html;
  renderTotalSummary();
}

function renderTotalSummary() {
  const container = document.getElementById('selected-summary');
  const summaryDiv = document.getElementById('total-summary');
  
  if (children.length === 0 || !ecaData) {
    container.style.display = 'none';
    return;
  }

  let totalCost = 0;
  let anySelected = false;
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  let html = '<div style="display: grid; gap: 24px;">';
  
  for (const child of children) {
    const selected = child.selectedActivities || [];
    if (selected.length === 0) continue;
    anySelected = true;
    
    const childEcaData = getEcaDataForChild(child);
    const cost = calculateCost(selected, childEcaData);
    totalCost += cost.totalCost;
    
    // Группируем по дням
    const byDay = {};
    for (const actId of selected) {
      const act = childEcaData?.activities.find(a => a.id === actId);
      if (!act) continue;
      for (const day of act.schedule.days) {
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(act);
      }
    }
    
    // Сортируем занятия в каждом дне по времени
    for (const day of Object.keys(byDay)) {
      byDay[day].sort((a, b) => {
        return timeToMinutes(a.schedule.time.start) - timeToMinutes(b.schedule.time.start);
      });
    }
    
    html += `
      <div style="background: var(--bg-secondary); border-radius: 12px; overflow: hidden;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--bg-card); border-bottom: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 1.5rem;">${getEmoji(child.gender, child.year)}</span>
            <div>
              <div style="font-weight: 600; font-size: 1.1rem;">${child.name}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${getYearLabel(child.year)} • ${getCampusName(child.campus || 'chaofa')} • ${selected.length} ${t('activities')}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-family: 'JetBrains Mono', monospace; color: var(--accent-light); font-weight: 700; font-size: 1.2rem;">
              ${cost.totalCost.toLocaleString()} ฿
            </div>
            ${cost.freeUsed > 0 ? `<div style="font-size: 0.75rem; color: var(--success);">${cost.freeUsed} ${t('free')}</div>` : ''}
          </div>
        </div>
        <div style="padding: 12px 16px;">
    `;
    
    for (const day of dayOrder) {
      const activities = byDay[day];
      if (!activities || activities.length === 0) continue;
      
      html += `
        <div style="margin-bottom: 12px;">
          <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border);">
            ${getDayName(day)}
          </div>
      `;
      
      for (const act of activities) {
        const priceText = act.isFree ? 'FREE' : `${act.fee.toLocaleString()} ฿`;
        const priceColor = act.isFree ? 'var(--success)' : 'var(--day-fri)';
        
        html += `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; gap: 12px;">
            <div style="flex: 1;">
              <div style="font-size: 0.9rem; font-weight: 500;">${escapeHtml(act.name)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">
                ${act.schedule.time.start} - ${act.schedule.time.end}
              </div>
            </div>
            <div style="font-size: 0.85rem; font-weight: 600; color: ${priceColor}; white-space: nowrap;">
              ${priceText}
            </div>
          </div>
        `;
      }
      
      html += '</div>';
    }
    
    // Показываем расчёт если есть дополнительные занятия
    if (cost.extraFreeCount > 0 || cost.fixedCost > 0 || cost.ealCost > 0) {
      html += `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border); font-size: 0.8rem; color: var(--text-secondary);">
      `;
      if (cost.ealCost > 0) {
        html += `<div>EAL (курс): <span style="color: var(--day-fri);">${cost.ealCost.toLocaleString()} ฿</span></div>`;
      }
      if (cost.extraFreeCount > 0) {
        html += `<div>${t('extraActivitiesCalc')} (${cost.extraFreeCount} × 6,750): <span style="color: var(--warning);">${cost.extraCost.toLocaleString()} ฿</span></div>`;
      }
      if (cost.fixedCost > 0) {
        html += `<div>${t('paidActivities')}: <span style="color: var(--day-fri);">${cost.fixedCost.toLocaleString()} ฿</span></div>`;
      }
      html += '</div>';
    }
    
    html += '</div></div>';
  }

  if (anySelected && children.filter(c => (c.selectedActivities || []).length > 0).length > 0) {
    html += `
      <div class="summary-card">
        <div class="summary-card-row" style="font-size: 0.9rem; opacity: 0.9;">
          <span>${t('totalChildren')}</span>
          <span>${children.filter(c => (c.selectedActivities || []).length > 0).length}</span>
        </div>
        <div class="summary-card-row">
          <span>${t('totalTermCost')}</span>
          <span>${totalCost.toLocaleString()} ฿</span>
        </div>
      </div>
    `;
  }

  html += '</div>';
  
  summaryDiv.innerHTML = html;
  container.style.display = anySelected ? 'block' : 'none';
}

function renderTimeFilters() {
  const container = document.getElementById('time-filters');
  const timeLabels = {
    'all': t('all'),
    'after-school': t('afterSchool'),
    'extended': t('extended'),
    'early': t('early')
  };
  
  let html = '';
  for (const [key, info] of Object.entries(TIME_SLOTS)) {
    const isActive = selectedTimeSlot === key;
    html += `
      <div class="time-chip ${isActive ? 'active' : ''}" onclick="setTimeSlot('${escapeAttr(key)}')">
        ${timeLabels[key] || info.label}
        ${info.desc ? `<span class="time-badge">${info.desc}</span>` : ''}
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Update card title
  document.querySelector('#screen-eca .card-title').innerHTML = `<span class="icon">⏰</span>${t('timeSlot')}`;
}

function renderEcaScreen() {
  const child = children.find(c => c.id === currentChildId);
  if (!child) return;

  // Загружаем данные для текущего кампуса ребенка
  const childCampus = child.campus || 'chaofa';
  ecaData = childCampus === 'cherngtalay' ? ecaDataCherngtalay : ecaDataChaofa;

  document.getElementById('current-avatar').textContent = getEmoji(child.gender, child.year);
  document.getElementById('current-name').textContent = child.name;
  document.getElementById('current-year').textContent = getYearLabel(child.year);

  renderTimeFilters();
  renderSchedule(child);
  updateSummary(child);
}

function getDayName(day) {
  const dayKeys = {
    'Monday': 'monday',
    'Tuesday': 'tuesday',
    'Wednesday': 'wednesday',
    'Thursday': 'thursday',
    'Friday': 'friday',
    'Saturday': 'saturday'
  };
  return t(dayKeys[day]) || day;
}

function renderSchedule(child) {
  const container = document.getElementById('schedule-grid');
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  const ealBlockedDays = getEalBlockedDays(child);
  
  // Filter activities
  const matchingActivities = ecaData.activities.filter(act => {
    if (!activityMatchesYear(act, child.year)) return false;
    if (isActivityHidden(act, child)) return false;
    return true;
  });

  // Group by day
  const byDay = {};
  for (const day of days) {
    byDay[day] = matchingActivities.filter(act => {
      if (!act.schedule.days.includes(day)) return false;
      if (!matchesTimeSlot(act, selectedTimeSlot, day)) return false;
      return true;
    });
  }

  let html = '';
  for (const day of days) {
    const activities = byDay[day];
    if (activities.length === 0) continue;

    const isEalDay = ealBlockedDays.includes(day);

    html += `
      <div class="day-column">
        <div class="day-header ${day.toLowerCase()}">
          ${getDayName(day)}
          ${isEalDay && child.hasEal ? '<span style="font-size: 0.75rem; opacity: 0.7;"> • EAL</span>' : ''}
        </div>
        <div class="day-content">
    `;

    // Sort by time
    activities.sort((a, b) => {
      const timeA = a.schedule.time.start || '99:99';
      const timeB = b.schedule.time.start || '99:99';
      return timeA.localeCompare(timeB);
    });

    for (const act of activities) {
      const isSelected = (child.selectedActivities || []).includes(act.id);
      const isEal = isEalActivity(act);
      const isEalBlocked = !isEal && isEalBlockedSlot(act, child);
      const hasConflict = !isSelected && hasTimeConflict(act, child.selectedActivities || [], ecaData);
      const actGender = getActivityGender(act);
      const genderMismatch = actGender && child.gender && actGender !== child.gender;
      
      let classes = 'eca-item';
      if (isSelected) classes += ' selected';
      if (hasConflict && !isSelected) classes += ' conflict';
      if (isEalBlocked) classes += ' eal-blocked';
      if (isEal) classes += ' eal-option';
      if (genderMismatch) classes += ' gender-mismatch';

      const priceClass = act.isFree ? 'free' : 'paid';
      const priceText = act.isFree ? 'FREE' : `${act.fee.toLocaleString()} ฿`;

      let badges = '';
      if (isEal) badges += '<span class="eal-badge">EAL</span>';
      if (act.inviteOnly) badges += '<span class="invite-badge">Invite</span>';
      if (actGender === 'boy') badges += '<span class="gender-badge boys">Boys</span>';
      if (actGender === 'girl') badges += '<span class="gender-badge girls">Girls</span>';

      const clickable = !isEalBlocked && !genderMismatch && !hasConflict;

      let tooltip = '';
      if (hasConflict) tooltip = t('conflictTooltip');
      if (isEalBlocked) tooltip = t('ealBlocked');
      if (genderMismatch) tooltip = t('genderMismatch');

      html += `
        <div class="${classes}" ${clickable ? `onclick="toggleActivity('${escapeAttr(act.id)}')"` : ''} ${tooltip ? `title="${escapeAttr(tooltip)}"` : ''}>
          <div class="eca-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div class="eca-item-header">
            <div class="eca-name">
              ${escapeHtml(act.name)}${badges}
            </div>
            <div class="eca-price ${priceClass}">${priceText}</div>
          </div>
          <div class="eca-meta">
            <span class="eca-time">${act.schedule.time.start || '?'} - ${act.schedule.time.end || '?'}</span>
            ${act.location ? ` • ${escapeHtml(act.location)}` : ''}
            ${hasConflict ? ` • <span style="color: var(--danger);">⚠️ ${t('conflict')}</span>` : ''}
          </div>
        </div>
      `;
    }

    html += '</div></div>';
  }

  if (html === '') {
    html = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="icon">🔍</div>
        <p>${t('noActivities')}</p>
        <p style="margin-top: 8px; font-size: 0.85rem;">${t('tryChangeFilter')}</p>
      </div>
    `;
  }

  container.innerHTML = html;
}

function updateSummary(child) {
  const selected = child.selectedActivities || [];
  const cost = calculateCost(selected, ecaData);
  
  const panel = document.getElementById('summary-panel');
  panel.classList.toggle('visible', selected.length > 0);

  document.getElementById('summary-free').textContent = `${cost.freeUsed}/${FREE_SLOTS}`;
  document.getElementById('summary-extra').textContent = cost.extraFreeCount;
  document.getElementById('summary-total').textContent = `${cost.totalCost.toLocaleString()} ฿`;
  
  // Update labels
  document.querySelector('.summary-stat:nth-child(1) .summary-stat-label').textContent = t('freeSlots');
  document.querySelector('.summary-stat:nth-child(2) .summary-stat-label').textContent = t('extraActivities');
  document.querySelector('.summary-stat:nth-child(3) .summary-stat-label').textContent = t('total');
  document.querySelector('.summary-panel .btn-primary').innerHTML = `✓ ${t('save')}`;
}

// ==================== ACTIONS ====================
function showChildrenScreen() {
  document.getElementById('screen-children').classList.add('active');
  document.getElementById('screen-eca').classList.remove('active');
  document.getElementById('summary-panel').classList.remove('visible');
  currentChildId = null;
  renderChildren();
}

function showEcaScreen() {
  document.getElementById('screen-children').classList.remove('active');
  document.getElementById('screen-eca').classList.add('active');
  selectedTimeSlot = 'all';
  renderEcaScreen();
}

function selectChild(id) {
  currentChildId = id;
  showEcaScreen();
}

function setTimeSlot(slot) {
  selectedTimeSlot = slot;
  renderEcaScreen();
}

function toggleActivity(actId) {
  const child = children.find(c => c.id === currentChildId);
  if (!child) return;

  if (!child.selectedActivities) {
    child.selectedActivities = [];
  }

  const idx = child.selectedActivities.indexOf(actId);
  if (idx >= 0) {
    child.selectedActivities.splice(idx, 1);
  } else {
    child.selectedActivities.push(actId);
  }

  saveToStorage();
  renderEcaScreen();
}

function renderModalToggles(child) {
  // Special programs
  const specialHtml = `
    <div class="toggle-item ${child.hasEal ? 'active' : ''}" onclick="toggleModalOption('hasEal')">
      <div class="toggle-info">
        <div class="toggle-label">EAL</div>
        <div class="toggle-desc">${t('ealDesc')}</div>
      </div>
      <div class="toggle-switch"></div>
    </div>
  `;
  document.getElementById('special-programs').innerHTML = specialHtml;

  // Extra categories
  const extraHtml = `
    <div class="toggle-item ${child.showBoosters ? 'active' : ''}" onclick="toggleModalOption('showBoosters')">
      <div class="toggle-info">
        <div class="toggle-label">Boosters</div>
        <div class="toggle-desc">${t('boostersDesc')}</div>
      </div>
      <div class="toggle-switch"></div>
    </div>
    <div class="toggle-item ${child.showVapp ? 'active' : ''}" onclick="toggleModalOption('showVapp')">
      <div class="toggle-info">
        <div class="toggle-label">VAPP</div>
        <div class="toggle-desc">${t('vappDesc')}</div>
      </div>
      <div class="toggle-switch"></div>
    </div>
    <div class="toggle-item ${child.showAen ? 'active' : ''}" onclick="toggleModalOption('showAen')">
      <div class="toggle-info">
        <div class="toggle-label">AEN</div>
        <div class="toggle-desc">${t('aenDesc')}</div>
      </div>
      <div class="toggle-switch"></div>
    </div>
  `;
  document.getElementById('extra-categories').innerHTML = extraHtml;
  
  // Update modal labels
  document.querySelector('#modal-child .modal-section:nth-child(2) .modal-section-title').textContent = t('specialPrograms');
  document.querySelector('#modal-child .modal-section:nth-child(3) .modal-section-title').textContent = t('extraCategories');
}

// Temporary state for modal
let modalState = {};

function toggleModalOption(key) {
  modalState[key] = !modalState[key];
  renderModalToggles(modalState);
}

function updateModalLabels() {
  const setTextSafe = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };
  const setPlaceholderSafe = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = text;
  };
  
  setTextSafe('label[for="child-name"]', t('name'));
  setPlaceholderSafe('child-name', t('namePlaceholder'));
  setTextSafe('label[for="child-gender"]', t('gender'));
  setTextSafe('#child-gender option[value=""]', t('genderNone'));
  setTextSafe('#child-gender option[value="girl"]', t('genderGirl'));
  setTextSafe('#child-gender option[value="boy"]', t('genderBoy'));
  setTextSafe('label[for="child-year"]', t('class'));
  setTextSafe('#child-year option[value=""]', t('selectClass'));
  setTextSafe('label[for="child-campus"]', t('campus'));
  setTextSafe('#modal-child .modal-section:first-of-type .modal-section-title', t('basicInfo'));
  setTextSafe('.modal-actions .btn-secondary', t('cancel'));
  setTextSafe('.modal-actions .btn-primary', t('save'));
}

function openAddChildModal() {
  editingChildId = null;
  modalState = {};
  document.getElementById('modal-title').textContent = t('addChildTitle');
  document.getElementById('child-name').value = '';
  document.getElementById('child-year').value = '';
  document.getElementById('child-gender').value = '';
  document.getElementById('child-campus').value = 'chaofa';
  updateModalLabels();
  renderModalToggles(modalState);
  document.getElementById('modal-child').classList.add('visible');
}

function editChild(id) {
  const child = children.find(c => c.id === id);
  if (!child) return;
  
  editingChildId = id;
  modalState = { 
    hasEal: child.hasEal,
    showBoosters: child.showBoosters,
    showVapp: child.showVapp,
    showAen: child.showAen,
  };
  
  document.getElementById('modal-title').textContent = t('editChildTitle');
  document.getElementById('child-name').value = child.name;
  document.getElementById('child-year').value = child.year;
  document.getElementById('child-gender').value = child.gender || '';
  document.getElementById('child-campus').value = child.campus || 'chaofa';
  updateModalLabels();
  renderModalToggles(modalState);
  document.getElementById('modal-child').classList.add('visible');
}

function closeModal() {
  document.getElementById('modal-child').classList.remove('visible');
  modalState = {};
}

function saveChild() {
  const name = document.getElementById('child-name').value.trim();
  const year = document.getElementById('child-year').value;
  const gender = document.getElementById('child-gender').value;
  const campus = document.getElementById('child-campus').value;

  if (!name || !year) {
    alert(t('fillNameClass'));
    return;
  }

  const childData = {
    name,
    year,
    gender,
    campus: campus || 'chaofa',
    hasEal: modalState.hasEal || false,
    showBoosters: modalState.showBoosters || false,
    showVapp: modalState.showVapp || false,
    showAen: modalState.showAen || false,
  };

  if (editingChildId) {
    const child = children.find(c => c.id === editingChildId);
    if (child) {
      // Если кампус изменился, очищаем выбранные занятия
      if (child.campus && child.campus !== campus) {
        child.selectedActivities = [];
      }
      Object.assign(child, childData);
    }
  } else {
    children.push({
      id: Date.now().toString(),
      ...childData,
      selectedActivities: []
    });
  }

  saveToStorage();
  closeModal();
  renderChildren();
}

function deleteChild(id) {
  if (confirm(t('deleteConfirm'))) {
    children = children.filter(c => c.id !== id);
    saveToStorage();
    renderChildren();
  }
}

// ==================== PRINT MODE ====================
function togglePrintMode(enable) {
  document.body.classList.toggle('print-mode', enable);
  
  if (enable) {
    // Scroll to top
    window.scrollTo(0, 0);
  }
}

// ==================== SHARE AS IMAGE ====================
async function shareScheduleAsImage() {
  const shareBtn = document.querySelector('.share-btn');
  if (shareBtn) {
    shareBtn.disabled = true;
  }
  
  try {
    // Генерируем HTML для картинки
    const imageHtml = generateScheduleImageHtml();
    
    // Создаём временный контейнер
    const container = document.createElement('div');
    container.innerHTML = imageHtml;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);
    
    const element = container.firstElementChild;
    
    // Используем html2canvas для генерации изображения
    const canvas = await html2canvas(element, {
      backgroundColor: '#0a0a0f',
      scale: 2, // Retina quality
      useCORS: true,
      logging: false,
    });
    
    // Удаляем временный контейнер
    document.body.removeChild(container);
    
    // Конвертируем в blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'eca-schedule.png', { type: 'image/png' });
    
    // Пробуем использовать Web Share API
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: t('shareText'),
      });
    } else {
      // Fallback: скачиваем файл
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'eca-schedule.png';
      a.click();
      URL.revokeObjectURL(url);
      
      // Показываем уведомление
      alert(t('shareNotSupported'));
    }
  } catch (error) {
    console.error('Error sharing:', error);
  } finally {
    if (shareBtn) {
      shareBtn.disabled = false;
    }
  }
}

function generateScheduleImageHtml() {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let totalCost = 0;
  
  let childrenHtml = '';
  
  for (const child of children) {
    const selected = child.selectedActivities || [];
    if (selected.length === 0) continue;
    
    const childEcaData = getEcaDataForChild(child);
    const cost = calculateCost(selected, childEcaData);
    totalCost += cost.totalCost;
    
    // Группируем по дням
    const byDay = {};
    for (const actId of selected) {
      const act = childEcaData?.activities.find(a => a.id === actId);
      if (!act) continue;
      for (const day of act.schedule.days) {
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(act);
      }
    }
    
    // Сортируем занятия в каждом дне по времени
    for (const day of Object.keys(byDay)) {
      byDay[day].sort((a, b) => {
        return timeToMinutes(a.schedule.time.start) - timeToMinutes(b.schedule.time.start);
      });
    }
    
    let daysHtml = '';
    for (const day of dayOrder) {
      const activities = byDay[day];
      if (!activities || activities.length === 0) continue;
      
      let activitiesHtml = '';
      for (const act of activities) {
        const priceText = act.isFree ? 'FREE' : `${act.fee.toLocaleString()} ฿`;
        const priceColor = act.isFree ? '#10b981' : '#fb7185';
        
        activitiesHtml += `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0; gap: 8px;">
            <div style="flex: 1;">
              <div style="font-size: 13px; font-weight: 500; color: #f1f5f9;">${escapeHtml(act.name)}</div>
              <div style="font-size: 11px; color: #64748b; font-family: 'JetBrains Mono', monospace;">
                ${act.schedule.time.start} - ${act.schedule.time.end}
              </div>
            </div>
            <div style="font-size: 12px; font-weight: 600; color: ${priceColor}; white-space: nowrap;">
              ${priceText}
            </div>
          </div>
        `;
      }
      
      daysHtml += `
        <div style="margin-bottom: 10px;">
          <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #2a2a3a;">
            ${getDayName(day)}
          </div>
          ${activitiesHtml}
        </div>
      `;
    }
    
    // Детали расчёта
    let calcHtml = '';
    if (cost.extraFreeCount > 0 || cost.fixedCost > 0 || cost.ealCost > 0) {
      calcHtml = '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #2a2a3a; font-size: 11px; color: #94a3b8;">';
      if (cost.ealCost > 0) {
        calcHtml += `<div>EAL (курс): <span style="color: #fb7185;">${cost.ealCost.toLocaleString()} ฿</span></div>`;
      }
      if (cost.extraFreeCount > 0) {
        calcHtml += `<div>${t('extraActivitiesCalc')} (${cost.extraFreeCount} × 6,750): <span style="color: #f59e0b;">${cost.extraCost.toLocaleString()} ฿</span></div>`;
      }
      if (cost.fixedCost > 0) {
        calcHtml += `<div>${t('paidActivities')}: <span style="color: #fb7185;">${cost.fixedCost.toLocaleString()} ฿</span></div>`;
      }
      calcHtml += '</div>';
    }
    
    childrenHtml += `
      <div style="background: #12121a; border-radius: 12px; overflow: hidden; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #1a1a24; border-bottom: 1px solid #2a2a3a;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">${getEmoji(child.gender, child.year)}</span>
            <div>
              <div style="font-weight: 600; font-size: 15px; color: #f1f5f9;">${escapeHtml(child.name)}</div>
              <div style="font-size: 11px; color: #64748b;">${getYearLabel(child.year)} • ${getCampusName(child.campus || 'chaofa')} • ${selected.length} ${t('activities')}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-family: 'JetBrains Mono', monospace; color: #818cf8; font-weight: 700; font-size: 16px;">
              ${cost.totalCost.toLocaleString()} ฿
            </div>
            ${cost.freeUsed > 0 ? `<div style="font-size: 10px; color: #10b981;">${cost.freeUsed} ${t('free')}</div>` : ''}
          </div>
        </div>
        <div style="padding: 10px 16px;">
          ${daysHtml}
          ${calcHtml}
        </div>
      </div>
    `;
  }
  
  // Итоговый блок
  const activeChildren = children.filter(c => (c.selectedActivities || []).length > 0);
  let totalHtml = '';
  if (activeChildren.length > 0) {
    totalHtml = `
      <div style="background: linear-gradient(135deg, #6366f1, #7c3aed); border-radius: 12px; padding: 16px; margin-top: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; opacity: 0.9;">
          <span>${t('totalChildren')}</span>
          <span>${activeChildren.length}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); font-weight: 700; font-size: 15px;">
          <span>${t('totalTermCost')}</span>
          <span>${totalCost.toLocaleString()} ฿</span>
        </div>
      </div>
    `;
  }
  
  return `
    <div style="width: 380px; padding: 20px; background: #0a0a0f; font-family: 'Space Grotesk', -apple-system, sans-serif; color: #f1f5f9;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 20px; font-weight: 700; background: linear-gradient(135deg, #818cf8, #a78bfa, #f0abfc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 4px;">
          ✨ ECA Planner
        </div>
        <div style="font-size: 12px; color: #94a3b8;">HeadStart • Term 2&3 2025-2026</div>
      </div>
      ${childrenHtml}
      ${totalHtml}
      <div style="text-align: center; margin-top: 16px; font-size: 10px; color: #64748b;">
        eca.damurai.xyz
      </div>
    </div>
  `;
}

// ==================== SHARING ====================
function shareToTelegram(e) {
  e.preventDefault();
  const text = encodeURIComponent(t('shareText'));
  const url = encodeURIComponent(window.location.href);
  window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank');
}

function shareToWhatsApp(e) {
  e.preventDefault();
  const text = encodeURIComponent(t('shareText'));
  const url = encodeURIComponent(window.location.href);
  window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
}

function shareToLine(e) {
  e.preventDefault();
  const text = encodeURIComponent(t('shareText'));
  const url = encodeURIComponent(window.location.href);
  window.open(`https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`, '_blank');
}

function updateShareButtons() {
  const telegramBtn = document.getElementById('telegram-btn');
  const whatsappBtn = document.getElementById('whatsapp-btn');
  const lineBtn = document.getElementById('line-btn');
  
  if (telegramBtn) telegramBtn.title = t('shareTelegram');
  if (whatsappBtn) whatsappBtn.title = t('shareWhatsApp');
  if (lineBtn) lineBtn.title = t('shareLine');
}

// ==================== INIT ====================
async function init() {
  try {
    // Загружаем оба JSON файла
    const [chaofaResponse, cherngtalayResponse] = await Promise.all([
      fetch('eca_data.json'),
      fetch('eca_data_cherngtalay.json')
    ]);
    ecaDataChaofa = await chaofaResponse.json();
    ecaDataCherngtalay = await cherngtalayResponse.json();
    // По умолчанию используем Chaofa
    ecaData = ecaDataChaofa;
  } catch (e) {
    console.error('Error loading data:', e);
    return;
  }

  // Load language
  const savedLang = localStorage.getItem('eca-lang') || 'en';
  currentLang = savedLang;
  
  // Setup language switcher
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  loadFromStorage();
  updateAllTexts();
  renderChildren();
  
  // ESC to exit print mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('print-mode')) {
      togglePrintMode(false);
    }
  });
}

init();

