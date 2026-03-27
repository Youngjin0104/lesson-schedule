// app.js  —  Lesson Schedule PWA Main Logic

// ============================================================
// CONSTANTS
// ============================================================
const DAYS    = ['월','화','수','목','금','토'];
const DAYS_EN = ['mon','tue','wed','thu','fri','sat'];
const COLORS  = ['#58a6ff','#f0984a','#3fb950','#bc8cff','#f85149','#39d3d3','#e3a645','#ff79c6'];

// ============================================================
// STATE
// ============================================================
let currentUser   = null;   // { uid, name, role, color, email, phone }
let teachers      = [];     // [{id, name, color, email, phone, memo}]
let students      = [];     // [{id, name, phone, parentName, parentPhone, teacherId, fee, memo}]
let lessons       = [];     // [{id, studentId, studentName, teacherId, day, time, duration, memo}]

let selectedDay   = new Date().getDay();       // 0=일 ... 6=토
let weekOffset    = 0;
let filterTeacher = null;   // null=all, or teacherId
let editingLessonId  = null;
let editingTeacherId = null;
let editingStudentId = null;

let monthOffset   = 0;
let selectedCalDate = null;
let statsMonth    = 0; // offset from current month

// Unsubscribe listeners
const unsubs = [];

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Adjust selected day to Mon-Sat range
  if (selectedDay === 0) selectedDay = 1;

  window.fbOnAuth(async (user) => {
    if (user) {
      await loadCurrentUser(user.uid);
      await loadAllData();
      showApp();
    } else {
      showLogin();
    }
  });
});

async function loadCurrentUser(uid) {
  let profile = await fbGetUser(uid);
  if (!profile) {
    // First time: treat as admin
    profile = { id: uid, name: '관리자', role: 'admin', color: '#58a6ff', email: '' };
    await fbSetUser(uid, profile);
  }
  currentUser = { uid, ...profile };
}

async function loadAllData() {
  try {
    [teachers, students, lessons] = await Promise.all([
      fbGetUsers(),
      fbGetStudents(),
      fbGetLessons()
    ]);

    // Filter teachers (role !== admin)
    teachers = teachers.filter(t => t.role !== 'admin');

    // Setup real-time listeners
    unsubs.forEach(u => u());
    unsubs.push(
      fbWatchUsers(data => {
        teachers = data.filter(t => t.role !== 'admin');
        refreshCurrentPage();
      }),
      fbWatchStudents(data => {
        students = data;
        refreshCurrentPage();
      }),
      fbWatchLessons(data => {
        lessons = data;
        refreshCurrentPage();
      })
    );
  } catch(e) {
    console.error('Load error:', e);
    showToast('데이터 로드 실패: ' + e.message);
  }
}

// ============================================================
// AUTH UI
// ============================================================
function showLogin() {
  document.getElementById('loginScreen').classList.add('active');
  document.getElementById('appScreen').classList.remove('active');
}

function showApp() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');

  // Apply role UI
  const isAdmin = currentUser.role === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });
  document.getElementById('fabAdd').style.display =
    (isAdmin || currentUser.role === 'teacher') ? 'flex' : 'none';

  const badge = document.getElementById('userRoleBadge');
  badge.textContent = isAdmin ? '대표' : '선생님';
  badge.className = 'role-badge' + (isAdmin ? ' admin' : '');
  document.getElementById('userNameDisplay').textContent = currentUser.name;

  document.getElementById('sidebarUser').innerHTML = `
    <div style="font-weight:700;font-size:14px;">${currentUser.name}</div>
    <div style="font-size:11px;color:var(--text2);margin-top:3px;">${currentUser.email||''}</div>
  `;

  // If teacher, auto-filter to self
  if (!isAdmin) filterTeacher = currentUser.uid;

  goPage('schedule');
  fbInitMessaging && fbInitMessaging();
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw    = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');
  err.style.display = 'none';
  btn.textContent = '로그인 중...';
  btn.disabled = true;
  try {
    await fbSignIn(email, pw);
  } catch(e) {
    err.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
    err.style.display = 'block';
    btn.textContent = '로그인';
    btn.disabled = false;
  }
}

async function doLogout() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  unsubs.forEach(u => u());
  await fbSignOut();
}

// ============================================================
// NAVIGATION
// ============================================================
let currentPage = 'schedule';

function goPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });
  const titles = {
    schedule:'스케줄', monthly:'월별 캘린더',
    teachers:'선생님 관리', students:'학생 목록',
    stats:'통계/정산', settings:'설정'
  };
  document.getElementById('pageTitle').textContent = titles[page] || '';
  closeSidebar();
  refreshPage(page);
}

function refreshCurrentPage() { refreshPage(currentPage); }

function refreshPage(page) {
  if (page === 'schedule') { renderWeekNav(); renderDayTabs(); renderTeacherFilter(); renderSchedule(); }
  if (page === 'monthly')  { renderMonthly(); }
  if (page === 'teachers') { renderTeacherList(); }
  if (page === 'students') { renderStudentList(); }
  if (page === 'stats')    { renderStats(); }
  if (page === 'settings') { renderSettings(); }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
}

// ============================================================
// WEEK UTILS
// ============================================================
function getWeekDates(offset = 0) {
  const now = new Date();
  const dow = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return Array.from({length: 6}, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function changeWeek(dir) {
  weekOffset += dir;
  renderWeekNav();
  renderDayTabs();
  renderSchedule();
}

function renderWeekNav() {
  const dates = getWeekDates(weekOffset);
  const y = dates[0].getFullYear();
  const m = dates[0].getMonth() + 1;
  const e = dates[5].getMonth() + 1;
  document.getElementById('weekLabel').textContent =
    `${y}년 ${m}월${m !== e ? '~' + e + '월' : ''}`;
}

function renderDayTabs() {
  const dates  = getWeekDates(weekOffset);
  const today  = new Date();
  const el     = document.getElementById('dayTabs');
  el.innerHTML = '';
  dates.forEach((d, i) => {
    const isToday  = d.toDateString() === today.toDateString();
    const isActive = i === selectedDay - 1 + (selectedDay === 0 ? 7 : 0);
    // count lessons for this weekday
    const cnt = lessons.filter(l => l.day === i &&
      (!filterTeacher || l.teacherId === filterTeacher)).length;

    const div = document.createElement('div');
    div.className = `day-tab${isActive ? ' active' : ''}${isToday && !isActive ? ' today' : ''}`;
    div.innerHTML = `
      <span class="dow">${DAYS[i]}</span>
      <span class="date">${d.getDate()}</span>
      <span class="cnt">${cnt || ''}</span>`;
    div.onclick = () => {
      selectedDay = i + 1;
      renderDayTabs();
      renderSchedule();
    };
    el.appendChild(div);
  });
}

// ============================================================
// TEACHER FILTER CHIPS
// ============================================================
function renderTeacherFilter() {
  const el = document.getElementById('teacherFilter');
  if (currentUser.role !== 'admin') { el.innerHTML = ''; return; }

  el.innerHTML = '';
  const allChip = document.createElement('div');
  allChip.className = 't-chip' + (!filterTeacher ? ' active-chip' : '');
  allChip.textContent = '전체';
  allChip.style.cssText = !filterTeacher
    ? 'border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.1)'
    : '';
  allChip.onclick = () => { filterTeacher = null; renderTeacherFilter(); renderSchedule(); renderDayTabs(); };
  el.appendChild(allChip);

  teachers.forEach(t => {
    const chip = document.createElement('div');
    chip.className = 't-chip';
    const active = filterTeacher === t.id;
    if (active) chip.style.cssText = `border-color:${t.color};color:${t.color};background:${t.color}22`;
    chip.textContent = t.name;
    chip.onclick = () => {
      filterTeacher = t.id;
      renderTeacherFilter(); renderSchedule(); renderDayTabs();
    };
    el.appendChild(chip);
  });
}

// ============================================================
// SCHEDULE
// ============================================================
function renderSchedule() {
  const dayIdx = selectedDay - 1; // 0=Mon...5=Sat
  let filtered = lessons.filter(l => l.day === dayIdx);
  if (filterTeacher) filtered = filtered.filter(l => l.teacherId === filterTeacher);
  filtered.sort((a, b) => a.time.localeCompare(b.time));

  // Stats
  const statsEl = document.getElementById('dayStats');
  if (currentUser.role === 'admin') {
    const allDay = lessons.filter(l => l.day === dayIdx);
    statsEl.innerHTML = teachers.map(t => {
      const cnt = allDay.filter(l => l.teacherId === t.id).length;
      return `<div class="stat-pill">
        <div class="snum" style="color:${t.color}">${cnt}</div>
        <div class="slabel">${t.name}</div>
      </div>`;
    }).join('') + `<div class="stat-pill">
      <div class="snum">${allDay.length}</div>
      <div class="slabel">전체</div>
    </div>`;
  } else {
    const cnt = filtered.length;
    statsEl.innerHTML = `<div class="stat-pill">
      <div class="snum" style="color:${currentUser.color||'var(--accent)'}">${cnt}</div>
      <div class="slabel">오늘 수업</div>
    </div>`;
  }

  const listEl = document.getElementById('scheduleList');
  if (!filtered.length) {
    listEl.innerHTML = `<div class="lesson-empty"><div class="ei">📭</div><p>이 날 수업이 없습니다</p></div>`;
    return;
  }

  listEl.innerHTML = filtered.map((l, idx) => {
    const t = teachers.find(x => x.id === l.teacherId) || {};
    const color = t.color || '#58a6ff';
    return `<div class="lesson-card" style="animation-delay:${idx * 0.035}s" onclick="openLessonDetail('${l.id}')">
      <div class="lc-time"><span class="lt">${l.time}</span></div>
      <div class="lc-connector">
        <div class="lc-dot" style="background:${color}"></div>
        <div class="lc-line"></div>
      </div>
      <div class="lc-body" style="border-left-color:${color}">
        <div style="position:absolute;left:0;top:0;bottom:0;width:3.5px;background:${color};border-radius:4px 0 0 4px"></div>
        <div class="lc-name">${l.studentName}</div>
        <div class="lc-meta">
          <span class="lc-badge" style="background:${color}22;color:${color}">${t.name || '미배정'}</span>
          <span class="lc-dur">${l.duration || 50}분</span>
        </div>
        ${l.memo ? `<div class="lc-memo">★ ${l.memo}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// LESSON MODAL
// ============================================================
function openLessonModal(prefillDay) {
  editingLessonId = null;
  document.getElementById('lessonModalTitle').textContent = '수업 추가';
  document.getElementById('lf_deleteRow').style.display = 'none';

  // populate teacher select
  const tSel = document.getElementById('lf_teacher');
  tSel.innerHTML = teachers.map(t =>
    `<option value="${t.id}">${t.name}</option>`).join('');
  if (currentUser.role !== 'admin')
    tSel.value = currentUser.uid;

  // populate student select
  const sSel = document.getElementById('lf_student');
  sSel.innerHTML = '<option value="">-- 학생 선택 --</option>' +
    students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  document.getElementById('lf_studentName').value = '';
  document.getElementById('lf_day').value = prefillDay !== undefined
    ? prefillDay : (selectedDay - 1);
  document.getElementById('lf_time').value = '09:30';
  document.getElementById('lf_duration').value = '50';
  document.getElementById('lf_memo').value = '';

  openModal('lessonModal');
}

function openLessonEdit(id) {
  const l = lessons.find(x => x.id === id);
  if (!l) return;
  editingLessonId = id;
  closeModal('detailModal');

  document.getElementById('lessonModalTitle').textContent = '수업 수정';
  document.getElementById('lf_deleteRow').style.display = 'block';

  const tSel = document.getElementById('lf_teacher');
  tSel.innerHTML = teachers.map(t =>
    `<option value="${t.id}">${t.name}</option>`).join('');
  tSel.value = l.teacherId;

  const sSel = document.getElementById('lf_student');
  sSel.innerHTML = '<option value="">-- 직접 입력 --</option>' +
    students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  sSel.value = l.studentId || '';

  document.getElementById('lf_studentName').value = l.studentName || '';
  document.getElementById('lf_day').value = l.day;
  document.getElementById('lf_time').value = l.time;
  document.getElementById('lf_duration').value = l.duration || 50;
  document.getElementById('lf_memo').value = l.memo || '';

  openModal('lessonModal');
}

async function saveLesson() {
  const sSel = document.getElementById('lf_student').value;
  const sName = document.getElementById('lf_studentName').value.trim();
  const student = sSel
    ? students.find(x => x.id === sSel)
    : null;
  const name = student ? student.name : sName;
  if (!name) { showToast('학생 이름을 입력하세요'); return; }

  const data = {
    studentId:   student ? student.id : null,
    studentName: name,
    teacherId:   document.getElementById('lf_teacher').value,
    day:         parseInt(document.getElementById('lf_day').value),
    time:        document.getElementById('lf_time').value,
    duration:    parseInt(document.getElementById('lf_duration').value),
    memo:        document.getElementById('lf_memo').value.trim(),
  };

  try {
    if (editingLessonId) {
      await fbUpdateLesson(editingLessonId, data);
      showToast('✅ 수정되었습니다');
    } else {
      await fbAddLesson(data);
      showToast('✅ 수업이 추가되었습니다');
    }
    closeModal('lessonModal');
  } catch(e) { showToast('오류: ' + e.message); }
}

async function deleteLesson() {
  if (!confirm('이 수업을 삭제할까요?')) return;
  try {
    await fbDeleteLesson(editingLessonId);
    showToast('🗑 삭제되었습니다');
    closeModal('lessonModal');
  } catch(e) { showToast('오류: ' + e.message); }
}

function openLessonDetail(id) {
  const l = lessons.find(x => x.id === id);
  if (!l) return;
  const t = teachers.find(x => x.id === l.teacherId) || {};
  const s = students.find(x => x.id === l.studentId) || {};
  const color = t.color || '#58a6ff';
  const canEdit = currentUser.role === 'admin' || currentUser.uid === l.teacherId;

  document.getElementById('detailContent').innerHTML = `
    <div class="modal-header" style="padding-top:18px">
      <div class="detail-hero">
        <div class="detail-avatar" style="background:${color}22;color:${color};border-color:${color}">
          ${(l.studentName||'?')[0]}
        </div>
        <div>
          <div class="detail-name">${l.studentName}</div>
          <div class="detail-sub">${t.name || '미배정'} 선생님 · ${DAYS[l.day]}요일</div>
        </div>
      </div>
      <button class="modal-x" onclick="closeModal('detailModal')">✕</button>
    </div>
    <div class="modal-body">
      <div class="detail-row"><span class="dk">⏰ 시간</span><span class="dv">${l.time} (${l.duration||50}분)</span></div>
      <div class="detail-row"><span class="dk">📅 요일</span><span class="dv">${DAYS[l.day]}요일</span></div>
      <div class="detail-row"><span class="dk">👩‍🏫 선생님</span><span class="dv">${t.name||'-'}</span></div>
      ${t.phone ? `<div class="detail-row"><span class="dk">📞 선생님 연락처</span><span class="dv"><a href="tel:${t.phone}">${t.phone}</a></span></div>` : ''}
      ${s.phone ? `<div class="detail-row"><span class="dk">📱 학생 연락처</span><span class="dv"><a href="tel:${s.phone}">${s.phone}</a></span></div>` : ''}
      ${s.parentPhone ? `<div class="detail-row"><span class="dk">👪 보호자</span><span class="dv"><a href="tel:${s.parentPhone}">${s.parentName||''} ${s.parentPhone}</a></span></div>` : ''}
      ${l.memo ? `<div class="detail-row"><span class="dk">📝 메모</span><span class="dv">${l.memo}</span></div>` : ''}
      ${canEdit ? `
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn btn-ghost" onclick="closeModal('detailModal')">닫기</button>
        <button class="btn btn-primary" onclick="openLessonEdit('${l.id}')">수정</button>
      </div>` : `
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn btn-ghost btn-full" onclick="closeModal('detailModal')">닫기</button>
      </div>`}
    </div>`;
  openModal('detailModal');
}

// ============================================================
// MONTHLY CALENDAR
// ============================================================
function changeMonth(dir) {
  monthOffset += dir;
  renderMonthly();
}

function renderMonthly() {
  const now = new Date();
  const d   = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const y   = d.getFullYear();
  const m   = d.getMonth();
  document.getElementById('monthLabel').textContent = `${y}년 ${m + 1}월`;

  const firstDow  = (new Date(y, m, 1).getDay() + 6) % 7; // 0=Mon
  const daysInMon = new Date(y, m + 1, 0).getDate();
  const today     = new Date();

  // Build grid
  let html = `<div class="cal-header">
    ${['월','화','수','목','금','토','일'].map(d =>
      `<span>${d}</span>`).join('')}
  </div><div class="cal-body">`;

  for (let i = 0; i < firstDow; i++)
    html += '<div class="cal-cell empty"></div>';

  for (let day = 1; day <= daysInMon; day++) {
    const cellDate = new Date(y, m, day);
    const dow      = (cellDate.getDay() + 6) % 7; // 0=Mon
    const isToday  = cellDate.toDateString() === today.toDateString();
    const isSel    = selectedCalDate && cellDate.toDateString() === selectedCalDate.toDateString();
    const dayLessons = lessons.filter(l => l.day === dow &&
      (!filterTeacher || l.teacherId === filterTeacher));

    // color dots
    const teacherIds = [...new Set(dayLessons.map(l => l.teacherId))].slice(0, 5);
    const dots = teacherIds.map(tid => {
      const t = teachers.find(x => x.id === tid);
      return `<span style="background:${t ? t.color : '#8b949e'}"></span>`;
    }).join('');

    html += `<div class="cal-cell${isToday ? ' today' : ''}${isSel ? ' selected' : ''}"
      onclick="selectCalDate(${y},${m},${day})">
      <span class="cal-day">${day}</span>
      <div class="cal-dots">${dots}</div>
    </div>`;
  }
  html += '</div>';
  document.getElementById('monthlyGrid').innerHTML = html;

  if (selectedCalDate) renderMonthlyDetail();
  else document.getElementById('monthlyDetail').innerHTML = '';
}

function selectCalDate(y, m, day) {
  selectedCalDate = new Date(y, m, day);
  renderMonthly();
  renderMonthlyDetail();
}

function renderMonthlyDetail() {
  if (!selectedCalDate) return;
  const dow = (selectedCalDate.getDay() + 6) % 7;
  let dayLessons = lessons.filter(l => l.day === dow);
  if (filterTeacher) dayLessons = dayLessons.filter(l => l.teacherId === filterTeacher);
  dayLessons.sort((a,b) => a.time.localeCompare(b.time));

  const el = document.getElementById('monthlyDetail');
  if (!dayLessons.length) {
    el.innerHTML = `<div class="md-title">${selectedCalDate.getMonth()+1}/${selectedCalDate.getDate()} (${DAYS[dow]}) — 수업 없음</div>`;
    return;
  }
  el.innerHTML = `<div class="md-title">${selectedCalDate.getMonth()+1}/${selectedCalDate.getDate()} (${DAYS[dow]}) — ${dayLessons.length}개 수업</div>` +
    dayLessons.map(l => {
      const t = teachers.find(x => x.id === l.teacherId) || {};
      const color = t.color || '#8b949e';
      return `<div class="md-item" onclick="openLessonDetail('${l.id}')">
        <span class="mi-time">${l.time}</span>
        <span class="mi-name">${l.studentName}</span>
        <span class="mi-badge" style="background:${color}22;color:${color}">${t.name||'-'}</span>
      </div>`;
    }).join('');
}

// ============================================================
// TEACHER MANAGEMENT
// ============================================================
function renderTeacherList() {
  const el = document.getElementById('teacherList');
  if (!teachers.length) {
    el.innerHTML = `<div class="lesson-empty"><div class="ei">👩‍🏫</div><p>등록된 선생님이 없습니다</p></div>`;
    return;
  }
  el.innerHTML = teachers.map(t => {
    const dayCounts = Array.from({length: 6}, (_, i) =>
      lessons.filter(l => l.day === i && l.teacherId === t.id).length);
    return `<div class="teacher-card" onclick="openTeacherEdit('${t.id}')">
      <div class="tc-header">
        <div class="tc-avatar" style="background:${t.color}22;color:${t.color};border-color:${t.color}">
          ${(t.name||'?')[0]}
        </div>
        <div class="tc-info">
          <h3>${t.name}</h3>
          <div class="tc-email">📧 ${t.email||'-'}</div>
          <div class="tc-phone">📞 ${t.phone||'-'}</div>
        </div>
      </div>
      <div class="tc-days">
        ${DAYS.map((d, i) => `<div class="tc-day-cell">
          <div class="td">${d}</div>
          <div class="tn" style="color:${dayCounts[i] ? t.color : 'var(--text3)'}">${dayCounts[i]||'·'}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function openTeacherModal() {
  editingTeacherId = null;
  document.getElementById('teacherModalTitle').textContent = '선생님 추가';
  document.getElementById('tf_deleteRow').style.display = 'none';
  document.getElementById('tf_name').value = '';
  document.getElementById('tf_phone').value = '';
  document.getElementById('tf_email').value = '';
  document.getElementById('tf_password').value = '';
  document.getElementById('tf_memo').value = '';
  renderColorPicker('tf_colorPicker', COLORS[0]);
  openModal('teacherModal');
}

function openTeacherEdit(id) {
  const t = teachers.find(x => x.id === id);
  if (!t) return;
  editingTeacherId = id;
  document.getElementById('teacherModalTitle').textContent = '선생님 수정';
  document.getElementById('tf_deleteRow').style.display = 'block';
  document.getElementById('tf_name').value = t.name || '';
  document.getElementById('tf_phone').value = t.phone || '';
  document.getElementById('tf_email').value = t.email || '';
  document.getElementById('tf_password').value = '';
  document.getElementById('tf_memo').value = t.memo || '';
  renderColorPicker('tf_colorPicker', t.color || COLORS[0]);
  openModal('teacherModal');
}

async function saveTeacher() {
  const name  = document.getElementById('tf_name').value.trim();
  const email = document.getElementById('tf_email').value.trim();
  const pw    = document.getElementById('tf_password').value;
  if (!name) { showToast('이름을 입력하세요'); return; }

  const colorEl = document.querySelector('#tf_colorPicker .color-swatch.selected');
  const color = colorEl ? colorEl.dataset.color : COLORS[0];

  const data = {
    name,
    phone:  document.getElementById('tf_phone').value.trim(),
    email,
    color,
    memo:   document.getElementById('tf_memo').value.trim(),
    role:   'teacher',
  };

  try {
    if (editingTeacherId) {
      await fbSetUser(editingTeacherId, data);
      showToast('✅ 수정되었습니다');
    } else {
      // Create Firebase Auth user via Admin SDK requires backend.
      // Instead, note the email/pw and create manually.
      // For now, store as a placeholder user doc with a generated key.
      if (!email) { showToast('이메일을 입력하세요'); return; }
      // We'll store in Firestore; actual Auth account needs Firebase Admin or manual creation.
      const newId = 'teacher_' + Date.now();
      data.pendingAuth = true;
      data.tempPassword = pw;
      await fbSetUser(newId, data);
      showToast('✅ 선생님 추가됨 (계정 생성 안내 참고)');
    }
    closeModal('teacherModal');
  } catch(e) { showToast('오류: ' + e.message); }
}

async function deleteTeacher() {
  if (!confirm('선생님을 삭제할까요? 수업 기록은 남습니다.')) return;
  try {
    await fbDeleteUser(editingTeacherId);
    showToast('🗑 삭제되었습니다');
    closeModal('teacherModal');
  } catch(e) { showToast('오류: ' + e.message); }
}

// ============================================================
// STUDENT MANAGEMENT
// ============================================================
function renderStudentList() {
  const q  = (document.getElementById('studentSearch')?.value || '').toLowerCase();
  let list = students;
  if (q) list = list.filter(s =>
    s.name?.toLowerCase().includes(q) ||
    s.phone?.includes(q) ||
    s.parentPhone?.includes(q));

  // Non-admin: only show own students
  if (currentUser.role !== 'admin')
    list = list.filter(s => s.teacherId === currentUser.uid);

  const el = document.getElementById('studentList');
  if (!list.length) {
    el.innerHTML = `<div class="lesson-empty"><div class="ei">👥</div><p>등록된 학생이 없습니다</p></div>`;
    return;
  }
  el.innerHTML = list.map(s => {
    const t = teachers.find(x => x.id === s.teacherId) || {};
    const color = t.color || '#8b949e';
    const wkCount = lessons.filter(l => l.studentId === s.id).length;
    return `<div class="student-card" onclick="openStudentEdit('${s.id}')">
      <div class="sc-header">
        <span class="sc-name">${s.name}</span>
        <span class="sc-teacher" style="background:${color}22;color:${color}">${t.name||'미배정'}</span>
      </div>
      <div class="sc-info">
        ${s.phone ? `<span>📱 ${s.phone}</span>` : ''}
        ${s.parentPhone ? `<span>👪 ${s.parentPhone}</span>` : ''}
        ${s.fee ? `<span>💰 ${Number(s.fee).toLocaleString()}원</span>` : ''}
        <span>주 ${wkCount}회</span>
      </div>
    </div>`;
  }).join('');
}

function openStudentModal() {
  editingStudentId = null;
  document.getElementById('studentModalTitle').textContent = '학생 추가';
  document.getElementById('sf_deleteRow').style.display = 'none';
  ['sf_name','sf_phone','sf_parentName','sf_parentPhone','sf_fee','sf_memo']
    .forEach(id => document.getElementById(id).value = '');

  const tSel = document.getElementById('sf_teacher');
  tSel.innerHTML = '<option value="">미배정</option>' +
    teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  openModal('studentModal');
}

function openStudentEdit(id) {
  const s = students.find(x => x.id === id);
  if (!s) return;
  editingStudentId = id;
  document.getElementById('studentModalTitle').textContent = '학생 수정';
  document.getElementById('sf_deleteRow').style.display = 'block';
  document.getElementById('sf_name').value       = s.name || '';
  document.getElementById('sf_phone').value      = s.phone || '';
  document.getElementById('sf_parentName').value = s.parentName || '';
  document.getElementById('sf_parentPhone').value= s.parentPhone || '';
  document.getElementById('sf_fee').value        = s.fee || '';
  document.getElementById('sf_memo').value       = s.memo || '';

  const tSel = document.getElementById('sf_teacher');
  tSel.innerHTML = '<option value="">미배정</option>' +
    teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  tSel.value = s.teacherId || '';
  openModal('studentModal');
}

async function saveStudent() {
  const name = document.getElementById('sf_name').value.trim();
  if (!name) { showToast('이름을 입력하세요'); return; }
  const data = {
    name,
    phone:       document.getElementById('sf_phone').value.trim(),
    parentName:  document.getElementById('sf_parentName').value.trim(),
    parentPhone: document.getElementById('sf_parentPhone').value.trim(),
    teacherId:   document.getElementById('sf_teacher').value,
    fee:         parseInt(document.getElementById('sf_fee').value) || 0,
    memo:        document.getElementById('sf_memo').value.trim(),
  };
  try {
    if (editingStudentId) {
      await fbUpdateStudent(editingStudentId, data);
      showToast('✅ 수정되었습니다');
    } else {
      await fbAddStudent(data);
      showToast('✅ 학생이 추가되었습니다');
    }
    closeModal('studentModal');
  } catch(e) { showToast('오류: ' + e.message); }
}

async function deleteStudent() {
  if (!confirm('학생을 삭제할까요?')) return;
  try {
    await fbDeleteStudent(editingStudentId);
    showToast('🗑 삭제되었습니다');
    closeModal('studentModal');
  } catch(e) { showToast('오류: ' + e.message); }
}

// ============================================================
// STATS
// ============================================================
function changeStatsMonth(dir) {
  statsMonth += dir;
  renderStats();
}

function renderStats() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + statsMonth;
  const label = new Date(y, m, 1);
  document.getElementById('statsMonthLabel').textContent =
    `${label.getFullYear()}년 ${label.getMonth() + 1}월`;

  // For weekly recurring lessons, count occurrences of each weekday in the month
  const year  = label.getFullYear();
  const month = label.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Count how many times each weekday (0=Mon) occurs in the month
  const dowCount = Array(6).fill(0);
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (new Date(year, month, d).getDay() + 6) % 7;
    if (dow < 6) dowCount[dow]++;
  }

  const totalLessons = lessons.reduce((sum, l) =>
    sum + (l.day < 6 ? dowCount[l.day] : 0), 0);

  const el = document.getElementById('statsContent');

  const summaryHTML = `
    <div class="stats-summary">
      <div class="summary-card">
        <div class="sn" style="color:var(--accent)">${totalLessons}</div>
        <div class="sl">전체 수업 횟수</div>
      </div>
      <div class="summary-card">
        <div class="sn" style="color:var(--green)">${students.length}</div>
        <div class="sl">등록 학생</div>
      </div>
      <div class="summary-card">
        <div class="sn" style="color:var(--orange)">${teachers.length}</div>
        <div class="sl">선생님</div>
      </div>
      <div class="summary-card">
        <div class="sn" style="color:var(--purple)">${lessons.length}</div>
        <div class="sl">정기 수업</div>
      </div>
    </div>`;

  const teacherStatsHTML = teachers.map(t => {
    const tLessons = lessons.filter(l => l.teacherId === t.id);
    const tCount   = tLessons.reduce((sum, l) =>
      sum + (l.day < 6 ? dowCount[l.day] : 0), 0);
    const tStudents = [...new Set(tLessons.map(l => l.studentId || l.studentName))];
    const tFee     = tStudents.reduce((sum, sid) => {
      const s = students.find(x => x.id === sid);
      return sum + (s?.fee || 0);
    }, 0);

    const dayBreakdown = Array.from({length: 6}, (_, i) => ({
      day: DAYS[i],
      cnt: tLessons.filter(l => l.day === i).length * dowCount[i]
    })).filter(x => x.cnt > 0);

    return `<div class="teacher-stats-card">
      <div class="tsc-header">
        <span class="tsc-name" style="color:${t.color}">${t.name}</span>
        <span class="tsc-total">${tCount}회 / ${tStudents.length}명</span>
      </div>
      ${dayBreakdown.map(x =>
        `<div class="tsc-row"><span class="tk">${x.day}요일</span><span class="tv">${x.cnt}회</span></div>`
      ).join('')}
      <div class="fee-total">
        <span class="ft-label">예상 수강료 합계</span>
        <span class="ft-val">${tFee.toLocaleString()}원</span>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = summaryHTML + '<div style="margin-top:8px">' + teacherStatsHTML + '</div>';
}

// ============================================================
// SETTINGS
// ============================================================
function renderSettings() {
  const el = document.getElementById('settingsList');
  el.innerHTML = `
    <div class="settings-section-title">계정</div>
    <div class="settings-item" onclick="openProfileEdit()">
      <div class="si-left"><span class="si-icon">👤</span><span class="si-label">내 프로필 수정</span></div>
      <span class="si-arrow">›</span>
    </div>
    <div class="settings-item" onclick="doLogout()">
      <div class="si-left"><span class="si-icon">🚪</span><span class="si-label">로그아웃</span></div>
      <span class="si-arrow">›</span>
    </div>
    <div class="settings-section-title">앱 설치</div>
    <div class="settings-item" onclick="showInstallGuide()">
      <div class="si-left"><span class="si-icon">📲</span><span class="si-label">홈 화면에 앱 추가</span></div>
      <span class="si-arrow">›</span>
    </div>
    <div class="settings-section-title">정보</div>
    <div class="settings-item">
      <div class="si-left"><span class="si-icon">ℹ️</span><span class="si-label">버전</span></div>
      <span style="font-size:12px;color:var(--text2)">v1.0.0</span>
    </div>
  `;
}

function showInstallGuide() {
  alert(
    '📱 앱 설치 방법\n\n' +
    '【Android Chrome】\n' +
    '주소창 오른쪽 메뉴 (⋮) → "홈 화면에 추가"\n\n' +
    '【iPhone Safari】\n' +
    '하단 공유 버튼 (□↑) → "홈 화면에 추가"\n\n' +
    '홈 화면 아이콘을 탭하면 앱처럼 실행됩니다!'
  );
}

function openProfileEdit() {
  // Simple inline edit
  const name = prompt('이름 변경:', currentUser.name);
  if (name && name.trim()) {
    fbSetUser(currentUser.uid, { name: name.trim() }).then(() => {
      currentUser.name = name.trim();
      document.getElementById('userNameDisplay').textContent = name.trim();
      showToast('✅ 이름이 변경되었습니다');
    });
  }
}

// ============================================================
// COLOR PICKER
// ============================================================
function renderColorPicker(containerId, selected) {
  const el = document.getElementById(containerId);
  el.innerHTML = COLORS.map(c =>
    `<div class="color-swatch${c === selected ? ' selected' : ''}"
      style="background:${c}" data-color="${c}"
      onclick="selectColor(this,'${containerId}')"></div>`
  ).join('');
}
function selectColor(el, containerId) {
  document.querySelectorAll(`#${containerId} .color-swatch`).forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

// ============================================================
// MODAL UTILS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
function closeMB(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ============================================================
// PWA SERVICE WORKER
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ============================================================
// LOGIN keyboard shortcut
// ============================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('loginScreen').classList.contains('active')) doLogin();
  }
});
