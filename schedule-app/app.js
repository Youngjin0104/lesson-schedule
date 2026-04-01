// app.js — ES Module
import {
  fbOnAuth, fbSignIn, fbSignOut,
  fbGetUser, fbGetUsers, fbSetUser, fbDeleteUser, fbWatchUsers,
  fbGetStudents, fbAddStudent, fbUpdateStudent, fbDeleteStudent, fbWatchStudents,
  fbGetLessons,  fbAddLesson,  fbUpdateLesson,  fbDeleteLesson,  fbWatchLessons,
} from './firebase-config.js';

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const DAYS   = ['월','화','수','목','금','토', '일'];
const COLORS = ['#58a6ff','#f0984a','#3fb950','#bc8cff','#f85149','#39d3d3','#e3a645','#ff79c6'];

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let me        = null;   // 현재 로그인 유저 {uid, name, role, color, email, phone}
let teachers  = [];     // admin 제외 users
let students  = [];
let lessons   = [];
let unsubs    = [];     // realtime listener 해제 함수들

// 스케줄 뷰
let selDayIdx  = (() => { const d = (new Date().getDay() + 6) % 7; return d === 0 ? 0 : d - 1; })(); // 0=월
let weekOff    = 0;
let filterTid  = null;  // null = 전체

// 캘린더 뷰
let moOff      = 0;
let selCalDate = null;

// 통계
let stOff      = 0;

// 편집 중인 ID
let editLesson  = null;
let editTeacher = null;
let editStudent = null;

// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════
fbOnAuth(async (user) => {
  if (user) {
    await initUser(user.uid);
    await loadData();
    showApp();
  } else {
    showScreen('S_login');
  }
});

async function initUser(uid) {
  let profile = await fbGetUser(uid);
  if (!profile) {
    profile = { name: '관리자', role: 'admin', color: COLORS[0], email: '' };
    await fbSetUser(uid, profile);
    profile = await fbGetUser(uid);
  }
  me = { uid, ...profile };
}

async function loadData() {
  const [u, s, l] = await Promise.all([fbGetUsers(), fbGetStudents(), fbGetLessons()]);
  teachers = u.filter(x => x.role !== 'admin');
  students = s;
  lessons  = l;

  // 기존 리스너 해제 후 재등록
  unsubs.forEach(f => f());
  unsubs = [
    fbWatchUsers(data => { teachers = data.filter(x => x.role !== 'admin'); refresh(); }),
    fbWatchStudents(data => { students = data; refresh(); }),
    fbWatchLessons(data => { lessons = data; refresh(); }),
  ];
}

// ═══════════════════════════════════════════
// SCREEN CONTROL
// ═══════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'flex';
}

function showApp() {
  showScreen('S_app');

  const isAdmin = me.role === 'admin';

  // 관리자 전용 메뉴 표시 여부
  document.querySelectorAll('.snav-btn.adm').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });

  // 상단 유저 칩
  const badge = document.getElementById('uc_role');
  badge.textContent    = isAdmin ? '대표' : '선생님';
  badge.className      = 'role-badge' + (isAdmin ? ' adm' : '');
  document.getElementById('uc_name').textContent = me.name;

  // 사이드바 유저 정보
  document.getElementById('sb_user').innerHTML = `
    <div style="font-weight:700">${me.name}</div>
    <div style="font-size:11px;color:var(--tx2);margin-top:2px">${me.email || ''}</div>`;

  // 선생님이면 본인만 필터
  if (!isAdmin) filterTid = me.uid;

  goPage('schedule');
}

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
let curPage = 'schedule';

window.goPage = function(page) {
  curPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('P_' + page).style.display = 'block';
  document.querySelectorAll('.snav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  const titles = { schedule:'스케줄', monthly:'월별 캘린더', teachers:'선생님 관리', students:'학생 목록', stats:'통계/정산', settings:'설정' };
  document.getElementById('tb_title').textContent = titles[page] || '';
  closeSidebar();
  refresh();
};

function refresh() {
  if (curPage === 'schedule') { renderWeekNav(); renderDayTabs(); renderTChips(); renderSchedule(); }
  if (curPage === 'monthly')  renderMonthly();
  if (curPage === 'teachers') renderTeachers();
  if (curPage === 'students') renderStudents();
  if (curPage === 'stats')    renderStats();
  if (curPage === 'settings') renderSettings();
}

// ═══════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════
window.openSidebar  = () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('sb_backdrop').classList.add('open'); };
window.closeSidebar = () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sb_backdrop').classList.remove('open'); };

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
window.doLogin = async function() {
  const email = document.getElementById('li_email').value.trim();
  const pw    = document.getElementById('li_pw').value;
  const errEl = document.getElementById('li_err');
  const btn   = document.getElementById('li_btn');
  errEl.style.display = 'none';
  btn.textContent = '로그인 중...';
  btn.disabled    = true;
  try {
    await fbSignIn(email, pw);
  } catch(e) {
    errEl.textContent   = '이메일 또는 비밀번호가 올바르지 않습니다.';
    errEl.style.display = 'block';
    btn.textContent     = '로그인';
    btn.disabled        = false;
  }
};

window.doLogout = async function() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  unsubs.forEach(f => f());
  unsubs = [];
  await fbSignOut();
};

// Enter 키로 로그인
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('S_login').style.display !== 'none') doLogin();
});

// ═══════════════════════════════════════════
// WEEK NAV
// ═══════════════════════════════════════════
function getWeekDates(off = 0) {
  const now = new Date();
  const dow = now.getDay();                      // 0=일
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + off * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

window.changeWeek = function(dir) {
  weekOff += dir;
  renderWeekNav();
  renderDayTabs();
  renderSchedule();
};

function renderWeekNav() {
  const dates = getWeekDates(weekOff);
  const y = dates[0].getFullYear();
  const m1 = dates[0].getMonth() + 1;
  const m2 = dates[6].getMonth() + 1;
  document.getElementById('wk_label').textContent =
    `${y}년 ${m1}월${m1 !== m2 ? '~' + m2 + '월' : ''}`;
}

function renderDayTabs() {
  const dates = getWeekDates(weekOff);
  const today = new Date();
  const el    = document.getElementById('day_tabs');
  el.innerHTML = '';
  dates.forEach((d, i) => {
    const isTd  = d.toDateString() === today.toDateString();
    const isAct = i === selDayIdx;
    const cnt   = lessons.filter(l => l.day === i && (!filterTid || l.teacherId === filterTid)).length;
    const div   = document.createElement('div');
    div.className = 'dtab' + (isAct ? ' active' : '') + (isTd && !isAct ? ' today' : '');
    div.innerHTML = `<span class="dow">${DAYS[i]}</span><span class="date">${d.getDate()}</span><span class="cnt">${cnt || ''}</span>`;
    div.onclick   = () => { selDayIdx = i; renderDayTabs(); renderSchedule(); };
    el.appendChild(div);
  });
}

// ═══════════════════════════════════════════
// TEACHER FILTER CHIPS
// ═══════════════════════════════════════════
function renderTChips() {
  const el = document.getElementById('t_chips');
  if (me.role !== 'admin') { el.innerHTML = ''; return; }
  el.innerHTML = '';

  const mk = (label, tid, color) => {
    const ch = document.createElement('div');
    ch.className = 'tchip';
    ch.textContent = label;
    const active = filterTid === tid;
    if (active) ch.style.cssText = `border-color:${color};color:${color};background:${color}22`;
    ch.onclick = () => { filterTid = tid; renderTChips(); renderDayTabs(); renderSchedule(); };
    el.appendChild(ch);
  };

  mk('전체', null, 'var(--ac)');
  teachers.forEach(t => mk(t.name, t.id, t.color || COLORS[0]));
}

// ═══════════════════════════════════════════
// SCHEDULE RENDER
// ═══════════════════════════════════════════
function renderSchedule() {
  // Stats
  const statsEl = document.getElementById('day_stats');
  const dayAll  = lessons.filter(l => l.day === selDayIdx);
  if (me.role === 'admin') {
    statsEl.innerHTML = teachers.map(t => {
      const cnt = dayAll.filter(l => l.teacherId === t.id).length;
      return `<div class="stat-pill"><div class="sn" style="color:${t.color||COLORS[0]}">${cnt}</div><div class="sl">${t.name}</div></div>`;
    }).join('') + `<div class="stat-pill"><div class="sn">${dayAll.length}</div><div class="sl">전체</div></div>`;
  } else {
    const cnt = dayAll.filter(l => l.teacherId === me.uid).length;
    statsEl.innerHTML = `<div class="stat-pill"><div class="sn" style="color:${me.color||COLORS[0]}">${cnt}</div><div class="sl">오늘 수업</div></div>`;
  }

  // List
  let filtered = dayAll;
  if (filterTid) filtered = filtered.filter(l => l.teacherId === filterTid);
  filtered.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const listEl = document.getElementById('lesson_list');
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="ei">📭</div><p>이 날 수업이 없습니다</p></div>`;
    return;
  }
  listEl.innerHTML = filtered.map((l, idx) => {
    const t     = teachers.find(x => x.id === l.teacherId) || {};
    const color = t.color || '#8b949e';
    return `<div class="lcard" style="animation-delay:${idx * 0.03}s" onclick="openDetail('${l.id}')">
      <div class="lc-time"><span class="t">${l.time || ''}</span></div>
      <div class="lc-conn">
        <div class="lc-dot" style="background:${color}"></div>
        <div class="lc-line"></div>
      </div>
      <div class="lc-body" style="--c:${color}">
        <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${color};border-radius:4px 0 0 4px"></div>
        <div class="lc-name">${l.studentName || ''}</div>
        <div class="lc-meta">
          <span class="lc-badge" style="background:${color}22;color:${color}">${t.name || '미배정'}</span>
          <span class="lc-dur">${l.duration || 50}분</span>
        </div>
        ${l.memo ? `<div class="lc-memo">★ ${l.memo}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// LESSON MODAL
// ═══════════════════════════════════════════
window.openLessonModal = function(id) {
  editLesson = id;
  const l    = id ? lessons.find(x => x.id === id) : null;

  document.getElementById('M_lesson_title').textContent = l ? '수업 수정' : '수업 추가';
  document.getElementById('lf_del').style.display       = l ? 'block' : 'none';

  // 학생 셀렉트
  const stuSel = document.getElementById('lf_stu');
  stuSel.innerHTML = '<option value="">-- 학생 선택 --</option>' +
    students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  // 선생님 셀렉트
  const tSel = document.getElementById('lf_teacher');
  tSel.innerHTML = teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

  if (l) {
    stuSel.value                                            = l.studentId || '';
    document.getElementById('lf_stuname').value            = l.studentId ? '' : (l.studentName || '');
    tSel.value                                              = l.teacherId || '';
    document.getElementById('lf_day').value                = String(l.day ?? selDayIdx);
    document.getElementById('lf_time').value               = l.time || '09:30';
    document.getElementById('lf_dur').value                = String(l.duration || 50);
    document.getElementById('lf_memo').value               = l.memo || '';
  } else {
    stuSel.value                                            = '';
    document.getElementById('lf_stuname').value            = '';
    tSel.value                                              = filterTid || (teachers[0]?.id || '');
    document.getElementById('lf_day').value                = String(selDayIdx);
    document.getElementById('lf_time').value               = '09:30';
    document.getElementById('lf_dur').value                = '50';
    document.getElementById('lf_memo').value               = '';
    // 선생님 본인이면 자신으로 고정
    if (me.role !== 'admin') tSel.value = me.uid;
  }
  openModal('M_lesson');
};

window.saveLesson = async function() {
  const stuId   = document.getElementById('lf_stu').value;
  const stuName = document.getElementById('lf_stuname').value.trim();
  const stu     = stuId ? students.find(x => x.id === stuId) : null;
  const name    = stu ? stu.name : stuName;
  if (!name) { toast('학생 이름을 입력하세요'); return; }

  const data = {
    studentId:   stu?.id || null,
    studentName: name,
    teacherId:   document.getElementById('lf_teacher').value,
    day:         parseInt(document.getElementById('lf_day').value),
    time:        document.getElementById('lf_time').value,
    duration:    parseInt(document.getElementById('lf_dur').value),
    memo:        document.getElementById('lf_memo').value.trim(),
  };
  try {
    if (editLesson) { await fbUpdateLesson(editLesson, data); toast('✅ 수정되었습니다'); }
    else            { await fbAddLesson(data);                toast('✅ 추가되었습니다'); }
    closeModal('M_lesson');
  } catch(e) { toast('오류: ' + e.message); }
};

window.deleteLesson = async function() {
  if (!confirm('이 수업을 삭제할까요?')) return;
  try { await fbDeleteLesson(editLesson); toast('🗑 삭제되었습니다'); closeModal('M_lesson'); }
  catch(e) { toast('오류: ' + e.message); }
};

// ═══════════════════════════════════════════
// LESSON DETAIL
// ═══════════════════════════════════════════
window.openDetail = function(id) {
  const l = lessons.find(x => x.id === id);
  if (!l) return;
  const t     = teachers.find(x => x.id === l.teacherId) || {};
  const s     = students.find(x => x.id === l.studentId)  || {};
  const color = t.color || '#8b949e';
  const canEd = me.role === 'admin' || me.uid === l.teacherId;

  document.getElementById('M_detail_body').innerHTML = `
    <div class="m-head" style="padding-top:18px">
      <div class="det-hero">
        <div class="det-ava" style="background:${color}22;color:${color};border-color:${color}">${(l.studentName||'?')[0]}</div>
        <div>
          <div class="det-name">${l.studentName}</div>
          <div class="det-sub">${t.name || '-'} 선생님 · ${DAYS[l.day]}요일</div>
        </div>
      </div>
      <button class="icon-btn sm" onclick="closeModal('M_detail')">✕</button>
    </div>
    <div class="det-row"><span class="dk">⏰ 시간</span><span class="dv">${l.time} (${l.duration||50}분)</span></div>
    <div class="det-row"><span class="dk">👩‍🏫 선생님</span><span class="dv">${t.name||'-'}</span></div>
    ${t.phone ? `<div class="det-row"><span class="dk">📞 선생님 연락처</span><span class="dv"><a href="tel:${t.phone}">${t.phone}</a></span></div>` : ''}
    ${s.phone ? `<div class="det-row"><span class="dk">📱 학생 연락처</span><span class="dv"><a href="tel:${s.phone}">${s.phone}</a></span></div>` : ''}
    ${s.parentPhone ? `<div class="det-row"><span class="dk">👪 보호자</span><span class="dv"><a href="tel:${s.parentPhone}">${s.parentName ? s.parentName + ' ' : ''}${s.parentPhone}</a></span></div>` : ''}
    ${l.memo ? `<div class="det-row"><span class="dk">📝 메모</span><span class="dv">${l.memo}</span></div>` : ''}
    <div class="m-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('M_detail')">닫기</button>
      ${canEd ? `<button class="btn btn-primary" onclick="closeModal('M_detail');openLessonModal('${l.id}')">수정</button>` : ''}
    </div>`;
  openModal('M_detail');
};

// ═══════════════════════════════════════════
// MONTHLY CALENDAR
// ═══════════════════════════════════════════
window.changeMonth = function(dir) { moOff += dir; renderMonthly(); };

function renderMonthly() {
  const ref   = new Date();
  const base  = new Date(ref.getFullYear(), ref.getMonth() + moOff, 1);
  const y     = base.getFullYear();
  const m     = base.getMonth();
  document.getElementById('mo_label').textContent = `${y}년 ${m + 1}월`;

  const firstDow  = (new Date(y, m, 1).getDay() + 6) % 7; // 0=월
  const daysInMon = new Date(y, m + 1, 0).getDate();
  const today     = new Date();

  let html = `<div class="cal-head">${['월','화','수','목','금','토','일'].map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="cal-body">`;

  for (let i = 0; i < firstDow; i++) html += '<div class="cal-cell empty"></div>';

  for (let day = 1; day <= daysInMon; day++) {
    const dt    = new Date(y, m, day);
    const dow   = (dt.getDay() + 6) % 7;  // 0=월
    const isTd  = dt.toDateString() === today.toDateString();
    const isSel = selCalDate && dt.toDateString() === selCalDate.toDateString();
    const dayL  = lessons.filter(l => l.day === dow && (!filterTid || l.teacherId === filterTid));
    const tids  = [...new Set(dayL.map(l => l.teacherId))].slice(0, 5);
    const dots  = tids.map(tid => { const t = teachers.find(x => x.id === tid); return `<span style="background:${t?.color||'#8b949e'}"></span>`; }).join('');
    html += `<div class="cal-cell${isTd?' today':''}${isSel?' sel':''}" onclick="selectCalDay(${y},${m},${day})">
      <span class="cal-day">${day}</span><div class="cal-dots">${dots}</div></div>`;
  }
  html += '</div>';
  document.getElementById('cal_grid').innerHTML = html;
  if (selCalDate) renderCalDetail();
}

window.selectCalDay = function(y, m, day) {
  selCalDate = new Date(y, m, day);
  renderMonthly();
  renderCalDetail();
};

function renderCalDetail() {
  if (!selCalDate) return;
  const dow = (selCalDate.getDay() + 6) % 7;
  let dl    = lessons.filter(l => l.day === dow && (!filterTid || l.teacherId === filterTid));
  dl.sort((a,b) => (a.time||'').localeCompare(b.time||''));
  const label = `${selCalDate.getMonth()+1}/${selCalDate.getDate()} (${DAYS[dow]})`;
  const el = document.getElementById('cal_detail');
  if (!dl.length) { el.innerHTML = `<div class="cd-title">${label} — 수업 없음</div>`; return; }
  el.innerHTML = `<div class="cd-title">${label} — ${dl.length}개 수업</div>` +
    dl.map(l => {
      const t = teachers.find(x => x.id === l.teacherId)||{};
      const c = t.color||'#8b949e';
      return `<div class="cd-item" onclick="openDetail('${l.id}')">
        <span class="ci-time">${l.time}</span>
        <span class="ci-name">${l.studentName}</span>
        <span class="ci-badge" style="background:${c}22;color:${c}">${t.name||'-'}</span>
      </div>`;
    }).join('');
}

// ═══════════════════════════════════════════
// TEACHER MANAGEMENT
// ═══════════════════════════════════════════
function renderTeachers() {
  const el = document.getElementById('teacher_list');
  if (!teachers.length) {
    el.innerHTML = '<div class="empty-state"><div class="ei">👩‍🏫</div><p>등록된 선생님이 없습니다</p></div>';
    return;
  }
  el.innerHTML = teachers.map(t => {
    const dayCnts = DAYS.map((_, i) => lessons.filter(l => l.day === i && l.teacherId === t.id).length);
    const c = t.color || COLORS[0];
    return `<div class="tcard" onclick="openTeacherModal('${t.id}')">
      <div class="tc-top">
        <div class="tc-ava" style="background:${c}22;color:${c};border-color:${c}">${(t.name||'?')[0]}</div>
        <div class="tc-info">
          <h3>${t.name}</h3>
          <p>📧 ${t.email||'-'}</p>
          <p>📞 ${t.phone||'-'}</p>
        </div>
      </div>
      <div class="tc-days">
        ${DAYS.map((d,i)=>`<div class="tc-day"><div class="d">${d}</div><div class="n" style="color:${dayCnts[i]?c:'var(--tx3)'}">${dayCnts[i]||'·'}</div></div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

window.openTeacherModal = function(id) {
  editTeacher = id;
  const t = id ? teachers.find(x => x.id === id) : null;
  document.getElementById('M_teacher_title').textContent = t ? '선생님 수정' : '선생님 추가';
  document.getElementById('tf_del').style.display = t ? 'block' : 'none';
  document.getElementById('tf_name').value  = t?.name  || '';
  document.getElementById('tf_phone').value = t?.phone || '';
  document.getElementById('tf_email').value = t?.email || '';
  document.getElementById('tf_pw').value    = '';
  document.getElementById('tf_memo').value  = t?.memo  || '';
  renderColorPicker('tf_colors', t?.color || COLORS[0]);
  openModal('M_teacher');
};

window.saveTeacher = async function() {
  const name = document.getElementById('tf_name').value.trim();
  if (!name) { toast('이름을 입력하세요'); return; }
  const colorEl = document.querySelector('#tf_colors .cswatch.sel');
  const color   = colorEl?.dataset.color || COLORS[0];
  const data = {
    name,
    phone: document.getElementById('tf_phone').value.trim(),
    email: document.getElementById('tf_email').value.trim(),
    color,
    memo:  document.getElementById('tf_memo').value.trim(),
    role:  'teacher',
  };
  try {
    if (editTeacher) {
      await fbSetUser(editTeacher, data);
      toast('✅ 수정되었습니다');
    } else {
      // 신규: Firestore에 임시 key로 저장 (Firebase Auth 계정은 콘솔에서 별도 생성)
      const newKey = 'teacher_' + Date.now();
      data.pendingAuth = true;
      data.tempPw      = document.getElementById('tf_pw').value;
      await fbSetUser(newKey, data);
      toast('✅ 추가됨 — Firebase Console에서 Auth 계정을 만들어 주세요');
    }
    closeModal('M_teacher');
  } catch(e) { toast('오류: ' + e.message); }
};

window.deleteTeacher = async function() {
  if (!confirm('선생님을 삭제할까요?')) return;
  try { await fbDeleteUser(editTeacher); toast('🗑 삭제되었습니다'); closeModal('M_teacher'); }
  catch(e) { toast('오류: ' + e.message); }
};

// ═══════════════════════════════════════════
// STUDENT MANAGEMENT
// ═══════════════════════════════════════════
window.renderStudents = function() {
  const q   = (document.getElementById('stu_search')?.value || '').toLowerCase();
  let list  = students;
  if (me.role !== 'admin') list = list.filter(s => s.teacherId === me.uid);
  if (q) list = list.filter(s =>
    (s.name||'').toLowerCase().includes(q) ||
    (s.phone||'').includes(q) ||
    (s.parentPhone||'').includes(q));

  const el = document.getElementById('student_list');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="ei">👥</div><p>등록된 학생이 없습니다</p></div>'; return; }
  el.innerHTML = list.map(s => {
    const t = teachers.find(x => x.id === s.teacherId)||{};
    const c = t.color||'#8b949e';
    const wk = lessons.filter(l => l.studentId === s.id).length;
    return `<div class="scard" onclick="openStudentModal('${s.id}')">
      <div class="sc-top">
        <span class="sc-name">${s.name}</span>
        <span class="sc-badge" style="background:${c}22;color:${c}">${t.name||'미배정'}</span>
      </div>
      <div class="sc-info">
        ${s.phone       ? `<span>📱 ${s.phone}</span>`       : ''}
        ${s.parentPhone ? `<span>👪 ${s.parentPhone}</span>` : ''}
        ${s.fee         ? `<span>💰 ${Number(s.fee).toLocaleString()}원</span>` : ''}
        <span>주 ${wk}회</span>
      </div>
    </div>`;
  }).join('');
};

window.openStudentModal = function(id) {
  editStudent = id;
  const s = id ? students.find(x => x.id === id) : null;
  document.getElementById('M_student_title').textContent = s ? '학생 수정' : '학생 추가';
  document.getElementById('sf_del').style.display = s ? 'block' : 'none';
  document.getElementById('sf_name').value   = s?.name   || '';
  document.getElementById('sf_phone').value  = s?.phone  || '';
  document.getElementById('sf_pname').value  = s?.parentName  || '';
  document.getElementById('sf_pphone').value = s?.parentPhone || '';
  document.getElementById('sf_fee').value    = s?.fee    || '';
  document.getElementById('sf_memo').value   = s?.memo   || '';
  const tSel = document.getElementById('sf_teacher');
  tSel.innerHTML = '<option value="">미배정</option>' + teachers.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  tSel.value = s?.teacherId || '';
  openModal('M_student');
};

window.saveStudent = async function() {
  const name = document.getElementById('sf_name').value.trim();
  if (!name) { toast('이름을 입력하세요'); return; }
  const data = {
    name,
    phone:       document.getElementById('sf_phone').value.trim(),
    parentName:  document.getElementById('sf_pname').value.trim(),
    parentPhone: document.getElementById('sf_pphone').value.trim(),
    teacherId:   document.getElementById('sf_teacher').value || null,
    fee:         parseInt(document.getElementById('sf_fee').value) || 0,
    memo:        document.getElementById('sf_memo').value.trim(),
  };
  try {
    if (editStudent) { await fbUpdateStudent(editStudent, data); toast('✅ 수정되었습니다'); }
    else             { await fbAddStudent(data);                 toast('✅ 추가되었습니다'); }
    closeModal('M_student');
  } catch(e) { toast('오류: ' + e.message); }
};

window.deleteStudent = async function() {
  if (!confirm('학생을 삭제할까요?')) return;
  try { await fbDeleteStudent(editStudent); toast('🗑 삭제되었습니다'); closeModal('M_student'); }
  catch(e) { toast('오류: ' + e.message); }
};

// ═══════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════
window.changeStatsMonth = function(dir) { stOff += dir; renderStats(); };

function renderStats() {
  const ref  = new Date();
  const base = new Date(ref.getFullYear(), ref.getMonth() + stOff, 1);
  const y    = base.getFullYear();
  const m    = base.getMonth();
  document.getElementById('st_label').textContent = `${y}년 ${m+1}월`;

  const daysInM = new Date(y, m+1, 0).getDate();
  // 요일별 주 발생 횟수
  const dowCount = Array(6).fill(0);
  for (let d = 1; d <= daysInM; d++) {
    const dow = (new Date(y,m,d).getDay()+6)%7;
    if (dow < 6) dowCount[dow]++;
  }

  const totalCnt = lessons.reduce((s, l) => s + (l.day < 6 ? dowCount[l.day] : 0), 0);

  const el = document.getElementById('stats_content');
  el.innerHTML = `
    <div class="stats-grid">
      <div class="sum-card"><div class="sn" style="color:var(--ac)">${totalCnt}</div><div class="sl">전체 수업 횟수</div></div>
      <div class="sum-card"><div class="sn" style="color:var(--gr)">${students.length}</div><div class="sl">등록 학생</div></div>
      <div class="sum-card"><div class="sn" style="color:var(--or)">${teachers.length}</div><div class="sl">선생님</div></div>
      <div class="sum-card"><div class="sn" style="color:var(--pu)">${lessons.length}</div><div class="sl">정기 수업</div></div>
    </div>` +
    teachers.map(t => {
      const tL   = lessons.filter(l => l.teacherId === t.id);
      const tCnt = tL.reduce((s,l) => s + (l.day<6?dowCount[l.day]:0), 0);
      const sids = [...new Set(tL.map(l=>l.studentId||l.studentName))];
      const fee  = sids.reduce((s,sid) => { const st=students.find(x=>x.id===sid); return s+(st?.fee||0); }, 0);
      const days = DAYS.map((d,i)=>({ d, cnt: tL.filter(l=>l.day===i).length * dowCount[i] })).filter(x=>x.cnt>0);
      return `<div class="t-stat">
        <div class="ts-head"><span class="ts-name" style="color:${t.color}">${t.name}</span><span class="ts-cnt">${tCnt}회 / ${sids.length}명</span></div>
        ${days.map(x=>`<div class="ts-row"><span class="k">${x.d}요일</span><span>${x.cnt}회</span></div>`).join('')}
        <div class="fee-box"><span class="fk">예상 수강료 합계</span><span class="fv">${fee.toLocaleString()}원</span></div>
      </div>`;
    }).join('');
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
function renderSettings() {
  document.getElementById('settings_list').innerHTML = `
    <div class="set-section">계정</div>
    <div class="set-item" onclick="editProfile()">
      <div class="si-l"><span>👤</span><span>내 프로필 수정</span></div><span class="si-r">›</span>
    </div>
    <div class="set-item" onclick="doLogout()">
      <div class="si-l"><span>🚪</span><span>로그아웃</span></div><span class="si-r">›</span>
    </div>
    <div class="set-section">앱</div>
    <div class="set-item" onclick="installGuide()">
      <div class="si-l"><span>📲</span><span>홈 화면에 앱 추가하기</span></div><span class="si-r">›</span>
    </div>
    <div class="set-section">정보</div>
    <div class="set-item">
      <div class="si-l"><span>ℹ️</span><span>버전</span></div><span style="font-size:12px;color:var(--tx2)">v1.0.1</span>
    </div>`;
}

window.editProfile = async function() {
  const name = prompt('이름:', me.name);
  if (!name?.trim()) return;
  await fbSetUser(me.uid, { name: name.trim() });
  me.name = name.trim();
  document.getElementById('uc_name').textContent = name.trim();
  document.getElementById('sb_user').querySelector('div').textContent = name.trim();
  toast('✅ 이름이 변경되었습니다');
};

window.installGuide = function() {
  alert('📱 홈 화면 설치 방법\n\n【Android Chrome】\n오른쪽 상단 메뉴(⋮) → "홈 화면에 추가"\n\n【iPhone Safari】\n하단 공유 버튼(□↑) → "홈 화면에 추가"\n\n설치하면 앱처럼 실행됩니다!');
};

// ═══════════════════════════════════════════
// COLOR PICKER
// ═══════════════════════════════════════════
function renderColorPicker(containerId, selected) {
  document.getElementById(containerId).innerHTML = COLORS.map(c =>
    `<div class="cswatch${c===selected?' sel':''}" style="background:${c}" data-color="${c}" onclick="pickColor(this,'${containerId}')"></div>`
  ).join('');
}
window.pickColor = function(el, cid) {
  document.querySelectorAll(`#${cid} .cswatch`).forEach(s => s.classList.remove('sel'));
  el.classList.add('sel');
};

// ═══════════════════════════════════════════
// MODAL HELPERS
// ═══════════════════════════════════════════
window.openModal  = function(id) { document.getElementById(id).classList.add('open'); };
window.closeModal = function(id) { document.getElementById(id).classList.remove('open'); };

// 백드롭 클릭 시 닫기
document.querySelectorAll('.modal-back').forEach(mb => {
  mb.addEventListener('click', e => { if (e.target === mb) mb.classList.remove('open'); });
});

// ═══════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

// ═══════════════════════════════════════════
// SERVICE WORKER
// ═══════════════════════════════════════════
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Service Worker 등록 시 업데이트 감지
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 새 버전이 설치됨 -> 사용자에게 알림 또는 강제 새로고침
          if (confirm('새로운 버전이 있습니다. 업데이트하시겠습니까?')) {
            window.location.reload();
          }
        }
      });
    });
  });
}