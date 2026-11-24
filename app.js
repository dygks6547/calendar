'use strict';

/* ───────── 상수 ───────── */
const STORE_KEY = 'shiftcal.v1';
const DEFAULT_COLORS = { D: '#E53935', N: '#1E63D6', O: '#9E9E9E', W: '#FBC02D', AL: '#2E9E4F' };
const TYPES = {
  D:  { label: '주간', short: '주', icon: 'sun' },
  N:  { label: '야간', short: '야', icon: 'moon' },
  O:  { label: '비번', short: '비', icon: 'bed' },
  W:  { label: '일근', short: '일', icon: 'brief' },
  AL: { label: '연차', short: '연', icon: 'plane' },
};
const PATTERN_KEYS = ['D', 'N', 'O', 'W'];   // 패턴에 넣을 수 있는 근무
const PICK_KEYS = ['D', 'N', 'O', 'W', 'AL']; // 날짜별로 지정할 수 있는 근무
// SVG path 데이터 (DOM 아이콘과 이미지 저장용 Canvas Path2D 둘 다에서 사용)
const ICONS = {
  sun: ['M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z', 'M12 1.5v2.5M12 20v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M1.5 12H4M20 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  bed: ['M2 4v16', 'M2 8h17a3 3 0 0 1 3 3v9', 'M2 16h20', 'M6 8v8'],
  brief: ['M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'],
  plane: ['M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'],
};
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/* ───────── 저장소 ───────── */
function defaultState() {
  return {
    v: 1,
    // 2026-11-30 주간 → 12/1 야간 → 12/2 비번 → 12/3 일근 → 12/4 주간 ...
    pattern: { sequence: ['D', 'N', 'O', 'W'], startDate: '2026-11-30', startIndex: 0 },
    colors: { ...DEFAULT_COLORS },
    days: {},          // 'YYYY-MM-DD': { shift?, memo?, holiday? }
    theme: 'system',
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* 저장소 사용 불가 시 기본값 */ }
  return defaultState();
}
function normalize(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  const p = s.pattern || {};
  const seq = Array.isArray(p.sequence) ? p.sequence.filter(k => PATTERN_KEYS.includes(k)) : d.pattern.sequence;
  return {
    v: 1,
    pattern: {
      sequence: seq,
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? p.startDate : d.pattern.startDate,
      startIndex: Number.isInteger(p.startIndex) && p.startIndex >= 0 && p.startIndex < Math.max(seq.length, 1) ? p.startIndex : 0,
    },
    colors: { ...DEFAULT_COLORS, ...(s.colors || {}) },
    days: s.days && typeof s.days === 'object' ? s.days : {},
    theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system',
  };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('저장 공간에 쓸 수 없습니다'); }
}

let state = loadState();
const now = new Date();
let view = { y: now.getFullYear(), m: now.getMonth() };

/* ───────── 날짜 유틸 ───────── */
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => { const t = new Date(y, m, d); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const parts = s => s.split('-').map(Number);
const dayNum = s => { const [y, m, d] = parts(s); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const dowOf = s => { const [y, m, d] = parts(s); return new Date(y, m - 1, d).getDay(); };
const todayStr = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };

/* ───────── 근무 계산 ───────── */
function patternShift(s) {
  const p = state.pattern, n = p.sequence.length;
  if (!n) return null;
  const i = (((dayNum(s) - dayNum(p.startDate) + p.startIndex) % n) + n) % n;
  return p.sequence[i];
}
function holidayOf(s) { return (state.days[s] && state.days[s].holiday) || HOLIDAYS[s] || ''; }
function info(s) {
  const dow = dowOf(s);
  const hol = holidayOf(s);
  const red = dow === 0 || dow === 6 || !!hol;
  const rec = state.days[s] || {};
  const base = patternShift(s);
  const shift = rec.shift || base;
  const restW = shift === 'W' && red;              // 주말·공휴일 일근 = 쉬는 날
  const color = shift ? (restW ? state.colors.O : state.colors[shift]) : null;
  return { s, dow, hol, red, shift, base, overridden: !!rec.shift && rec.shift !== base, memo: rec.memo || '', restW, color };
}
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#000';
  const v = parseInt(m[1], 16);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(v >> 16 & 255) + 0.7152 * lin(v >> 8 & 255) + 0.0722 * lin(v & 255);
  return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#000000';
}
function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name].map(d => `<path d="${d}"/>`).join('')}</svg>`;
}

/* ───────── 화면 그리기 ───────── */
const $ = id => document.getElementById(id);

function monthCells(y, m) {
  const first = (new Date(y, m, 1).getDay() + 6) % 7; // 월요일 시작
  const dim = new Date(y, m + 1, 0).getDate();
  const rows = 6; // 월마다 칸 크기가 달라지지 않도록 항상 6주 표시
  const out = [];
  for (let i = 0; i < rows * 7; i++) {
    const s = ymd(y, m, i - first + 1);
    out.push({ s, other: i < first || i >= first + dim, d: parts(s)[2] });
  }
  return { cells: out, rows };
}

function monthStats(y, m) {
  const dim = new Date(y, m + 1, 0).getDate();
  const c = { D: 0, N: 0, O: 0, W: 0, WR: 0, AL: 0 };
  for (let d = 1; d <= dim; d++) {
    const i = info(ymd(y, m, d));
    if (!i.shift) continue;
    if (i.restW) c.WR++; else c[i.shift]++;
  }
  return c;
}
function statItems(c) {
  const items = [
    { key: 'D', label: '주간', n: c.D },
    { key: 'N', label: '야간', n: c.N },
    { key: 'O', label: '비번', n: c.O },
    { key: 'W', label: '일근', n: c.W },
    { key: 'WR', label: '일근(휴)', n: c.WR },
  ];
  items.push({ key: 'AL', label: '연차', n: c.AL });
  return items.map(it => {
    const color = it.key === 'WR' ? state.colors.O : state.colors[it.key];
    const short = it.key === 'WR' ? '일' : TYPES[it.key].short;
    return { ...it, color, short };
  });
}

function render() {
  $('title').textContent = `${view.y}년 ${view.m + 1}월`;
  const today = todayStr();

  $('stats').innerHTML = statItems(monthStats(view.y, view.m)).map(it =>
    `<div class="stat"><span class="lbl"><i style="background:${it.color}"></i>${it.label}</span><b>${it.n}</b></div>`
  ).join('');

  const { cells, rows } = monthCells(view.y, view.m);
  const grid = $('grid');
  grid.style.gridTemplateRows = `repeat(${rows}, minmax(64px, 1fr))`;
  grid.innerHTML = cells.map(c => {
    const i = info(c.s);
    const cls = ['cell', c.other && 'other', i.red && 'red', c.s === today && 'today'].filter(Boolean).join(' ');
    const fg = textOn(i.color);
    const t = i.shift ? TYPES[i.shift] : null;
    const label = `${parts(c.s)[1]}월 ${c.d}일 ${DOW[i.dow]}요일${i.hol ? ' ' + i.hol : ''} ${t ? (i.restW ? '일근 휴무' : t.label) : '근무 없음'}${i.memo ? ' 메모 있음' : ''}`;
    const memo = (i.hol ? `<span class="hol">${esc(i.hol)}</span>` : '') + (i.memo ? `<span class="mt">${esc(i.memo)}</span>` : '');
    const memoHtml = memo ? `<div class="memo">${memo}</div>` : '';
    const blk = t
      ? `<div class="blk${i.overridden ? ' ov' : ''}" style="background:${i.color};color:${fg}"><div class="tag">${iconSvg(t.icon)}<span class="s">${t.short}</span></div>${memoHtml}</div>`
      : `<div class="blk empty">${memoHtml}</div>`;
    return `<button class="${cls}" data-date="${c.s}" aria-label="${esc(label)}">
      <div class="num"><span class="n">${c.d}</span></div>${blk}</button>`;
  }).join('');
}
function esc(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

function shiftMonth(delta) {
  const t = new Date(view.y, view.m + delta, 1);
  view = { y: t.getFullYear(), m: t.getMonth() };
  render();
}

/* ───────── 테마 ───────── */
function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.theme);
  const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#000000' : '#ffffff'));
}

/* ───────── 시트 공통 ───────── */
function openSheet(id) { $(id).hidden = false; }
function closeSheet(el) { el.closest('.sheet-wrap').hidden = true; }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet(b)));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.sheet-wrap:not([hidden])').forEach(w => w.hidden = true);
});

function shiftButton(k, sel, extra = '') {
  const color = state.colors[k];
  return `<button class="shift-btn${sel ? ' sel' : ''}" data-k="${k}" ${extra} style="background:${color};color:${textOn(color)}">
    ${iconSvg(TYPES[k].icon)}<span class="s">${TYPES[k].short}</span>${TYPES[k].label}</button>`;
}

/* ───────── 날짜 편집 ───────── */
let dayDraft = null;
function openDay(s) {
  const i = info(s);
  const rec = state.days[s] || {};
  dayDraft = { s, shift: i.shift, memo: rec.memo || '', customHol: rec.holiday || '' };
  const [y, m, d] = parts(s);
  $('dayTitle').textContent = `${m}월 ${d}일 (${DOW[i.dow]})`;
  $('dayMemo').value = dayDraft.memo;
  $('dayHolChk').checked = !!dayDraft.customHol;
  $('dayHolName').value = dayDraft.customHol;
  $('dayHolName').hidden = !dayDraft.customHol;
  $('dayHolChk').parentElement.hidden = !!HOLIDAYS[s];
  renderDay();
  openSheet('daySheet');
}
function renderDay() {
  const s = dayDraft.s;
  const base = patternShift(s);
  const builtinHol = HOLIDAYS[s];
  const bits = [];
  if (builtinHol) bits.push(`<span class="red">${esc(builtinHol)}</span>`);
  bits.push(`패턴 근무: ${base ? TYPES[base].label : '없음'}`);
  if (dayDraft.shift === 'W') {
    const red = dowOf(s) === 0 || dowOf(s) === 6 || builtinHol || ($('dayHolChk').checked);
    bits.push(red ? '주말·공휴일 일근 → 휴무' : '평일 일근 → 주간과 동일');
  }
  $('daySub').innerHTML = bits.join(' · ');
  $('dayPick').innerHTML = PICK_KEYS.map(k => shiftButton(k, k === dayDraft.shift)).join('');
}
$('dayPick').addEventListener('click', e => {
  const b = e.target.closest('[data-k]'); if (!b) return;
  dayDraft.shift = b.dataset.k; renderDay();
});
$('dayReset').addEventListener('click', () => { dayDraft.shift = patternShift(dayDraft.s); renderDay(); });
$('dayHolChk').addEventListener('change', e => {
  $('dayHolName').hidden = !e.target.checked;
  if (e.target.checked && !$('dayHolName').value) $('dayHolName').value = '임시공휴일';
  renderDay();
});
$('daySave').addEventListener('click', () => {
  const s = dayDraft.s;
  const rec = {};
  if (dayDraft.shift && dayDraft.shift !== patternShift(s)) rec.shift = dayDraft.shift;
  const memo = $('dayMemo').value.trim();
  if (memo) rec.memo = memo;
  if ($('dayHolChk').checked && !HOLIDAYS[s]) rec.holiday = $('dayHolName').value.trim() || '공휴일';
  if (Object.keys(rec).length) state.days[s] = rec; else delete state.days[s];
  save(); render(); closeSheet($('daySave'));
  toast('저장했습니다');
});

/* ───────── 패턴 설정 ───────── */
let patDraft = null;
function openPattern() {
  patDraft = JSON.parse(JSON.stringify(state.pattern));
  $('patDate').value = patDraft.startDate;
  $('patAdd').innerHTML = PATTERN_KEYS.map(k => shiftButton(k, false)).join('');
  renderPattern();
  openSheet('patSheet');
}
function chip(k, i, sel) {
  const c = state.colors[k];
  return `<button class="chipbtn${sel ? ' sel' : ''}" data-i="${i}" style="background:${c};color:${textOn(c)}"><small>${i + 1}</small>${TYPES[k].short}</button>`;
}
function renderPattern() {
  const seq = patDraft.sequence;
  if (patDraft.startIndex >= seq.length) patDraft.startIndex = 0;
  $('patSeq').innerHTML = seq.length ? seq.map((k, i) => chip(k, i, false)).join('') : '<span class="empty">아래에서 근무를 추가하세요</span>';
  $('patStart').innerHTML = seq.length ? seq.map((k, i) => chip(k, i, i === patDraft.startIndex)).join('') : '<span class="empty">—</span>';
  const start = patDraft.startDate || todayStr();
  let html = '';
  for (let j = 0; j < 7; j++) {
    const [y, m, d] = parts(start);
    const s = ymd(y, m - 1, d + j);
    const k = seq.length ? seq[(patDraft.startIndex + j) % seq.length] : null;
    const c = k ? state.colors[k] : 'var(--surface)';
    html += `<div style="background:${c};color:${k ? textOn(c) : 'inherit'}">${parts(s)[1]}/${parts(s)[2]}<b>${k ? TYPES[k].short : '-'}</b></div>`;
  }
  $('patPreview').innerHTML = html;
}
$('patAdd').addEventListener('click', e => {
  const b = e.target.closest('[data-k]'); if (!b) return;
  if (patDraft.sequence.length >= 31) return toast('최대 31개까지 가능합니다');
  patDraft.sequence.push(b.dataset.k); renderPattern();
});
$('patSeq').addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const i = +b.dataset.i;
  patDraft.sequence.splice(i, 1);
  if (patDraft.startIndex > i) patDraft.startIndex--;
  renderPattern();
});
$('patStart').addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  patDraft.startIndex = +b.dataset.i; renderPattern();
});
$('patDate').addEventListener('change', e => { if (e.target.value) { patDraft.startDate = e.target.value; renderPattern(); } });
$('patSave').addEventListener('click', () => {
  if (!patDraft.sequence.length) return toast('패턴을 1개 이상 추가하세요');
  if (!patDraft.startDate) return toast('시작일을 선택하세요');
  state.pattern = patDraft;
  // 패턴과 같아진 예외 기록은 정리
  for (const [s, rec] of Object.entries(state.days)) {
    if (rec.shift && rec.shift === patternShift(s)) { delete rec.shift; if (!Object.keys(rec).length) delete state.days[s]; }
  }
  save(); render(); closeSheet($('patSave'));
  toast('패턴을 적용했습니다');
});

/* ───────── 설정 ───────── */
function openSettings() { renderSettings(); openSheet('setSheet'); }
function renderSettings() {
  const p = state.pattern;
  $('patSummary').textContent = p.sequence.length ? `${p.sequence.map(k => TYPES[k].short).join('-')} · ${p.startDate.replace(/-/g, '.')} 시작` : '순환 패턴 설정';
  document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('sel', b.dataset.themeVal === state.theme));
  $('colorList').innerHTML = PICK_KEYS.map(k => {
    const c = state.colors[k];
    return `<label class="color-row"><span class="sw" style="background:${c};color:${textOn(c)}">${TYPES[k].short}</span>
      <span class="lbl">${TYPES[k].label}</span>
      <input type="color" data-k="${k}" value="${c}" aria-label="${TYPES[k].label} 색상"></label>`;
  }).join('');
}
$('themeSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-theme-val]'); if (!b) return;
  state.theme = b.dataset.themeVal; save(); applyTheme(); renderSettings();
});
$('colorList').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  state.colors[k] = e.target.value;
  const sw = e.target.closest('.color-row').querySelector('.sw');
  sw.style.background = e.target.value; sw.style.color = textOn(e.target.value);
  save(); render();
});
$('colorReset').addEventListener('click', () => { state.colors = { ...DEFAULT_COLORS }; save(); render(); renderSettings(); });
$('wipeBtn').addEventListener('click', () => {
  if (!confirm('패턴, 예외 근무, 메모, 색상을 모두 초기화할까요?')) return;
  state = defaultState(); save(); applyTheme(); render(); renderSettings();
  toast('초기화했습니다');
});

/* ───────── 이미지 저장 (Canvas 직접 그리기) ───────── */
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawIcon(ctx, name, cx, cy, size, color) {
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ICONS[name].forEach(d => ctx.stroke(new Path2D(d)));
  ctx.restore();
}
async function renderImage() {
  const FONT = cssVar('--font');
  // 웹폰트(부분 로딩)를 이미지에 쓰는 글자까지 미리 불러오기
  try {
    const glyphs = '0123456789년월근무표주야비일연차휴()' + DOW.join('') + Object.values(HOLIDAYS).join('') +
      Object.values(state.days).map(d => d.holiday || '').join('');
    await Promise.all(['600', '700'].map(w => document.fonts.load(`${w} 32px "Pretendard Variable"`, glyphs)));
  } catch (e) { /* 오프라인 등: 시스템 글꼴 사용 */ }
  const C = { bg: cssVar('--bg'), fg: cssVar('--fg'), surface: cssVar('--surface'), red: cssVar('--red'), muted: cssVar('--muted'), today: cssVar('--today') };
  const W = 1080, P = 36, GAP = 8;
  const colW = (W - P * 2 - GAP * 6) / 7;
  const { cells, rows } = monthCells(view.y, view.m);
  const cellH = 190;
  const titleH = 110, wdH = 56;
  // 집계 칩 줄바꿈 배치
  const items = statItems(monthStats(view.y, view.m));
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `600 32px ${FONT}`;
  const widths = items.map(it => 68 + meas.measureText(`${it.label} ${it.n}`).width + 22);
  const lines = [[]]; let lw = 0;
  items.forEach((it, idx) => {
    const add = widths[idx] + (lines[lines.length - 1].length ? 12 : 0);
    if (lw + add > W - P * 2 && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
    lines[lines.length - 1].push(idx); lw += widths[idx] + (lines[lines.length - 1].length > 1 ? 12 : 0);
  });
  const statH = lines.length * 72 + 8;
  const H = P + titleH + statH + wdH + rows * cellH + (rows - 1) * GAP + P;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // 제목
  ctx.fillStyle = C.fg; ctx.textAlign = 'center'; ctx.font = `700 60px ${FONT}`;
  ctx.fillText(`${view.y}년 ${view.m + 1}월 근무표`, W / 2, P + titleH / 2);

  // 집계
  lines.forEach((line, li) => {
    const tw = line.reduce((t, idx) => t + widths[idx], 0) + (line.length - 1) * 12;
    let x = (W - tw) / 2; const sy = P + titleH + li * 72;
    line.forEach(idx => {
      const it = items[idx], w = widths[idx];
      ctx.fillStyle = C.surface; roundRect(ctx, x, sy + 4, w, 60, 30); ctx.fill();
      ctx.fillStyle = it.color; roundRect(ctx, x + 8, sy + 10, 48, 48, 12); ctx.fill();
      ctx.fillStyle = textOn(it.color); ctx.textAlign = 'center'; ctx.font = `700 28px ${FONT}`;
      ctx.fillText(it.short, x + 32, sy + 35);
      ctx.fillStyle = C.fg; ctx.textAlign = 'left'; ctx.font = `600 32px ${FONT}`;
      ctx.fillText(`${it.label} ${it.n}`, x + 68, sy + 35);
      x += w + 12;
    });
  });

  // 요일
  const wy = P + titleH + statH;
  ctx.font = `600 30px ${FONT}`; ctx.textAlign = 'center';
  ['월', '화', '수', '목', '금', '토', '일'].forEach((d, i) => {
    ctx.fillStyle = i >= 5 ? C.red : C.fg;
    ctx.fillText(d, P + i * (colW + GAP) + colW / 2, wy + wdH / 2);
  });

  // 칸
  const gy = wy + wdH, today = todayStr();
  cells.forEach((c, idx) => {
    const r = Math.floor(idx / 7), col = idx % 7;
    const cx = P + col * (colW + GAP), cy = gy + r * (cellH + GAP);
    const i = info(c.s);
    ctx.globalAlpha = c.other ? 0.35 : 1;
    ctx.fillStyle = C.surface; roundRect(ctx, cx, cy, colW, cellH, 16); ctx.fill();
    // 날짜
    const isToday = c.s === today && !c.other;
    if (isToday) {
      ctx.fillStyle = C.today; roundRect(ctx, cx + 6, cy + 6, 50, 34, 17); ctx.fill();
    }
    ctx.fillStyle = isToday ? C.bg : (i.red ? C.red : C.fg);
    ctx.font = `600 28px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(String(c.d), cx + 31, cy + 24);
    // 근무 블록
    const bx = cx + 6, by = cy + 46, bw = colW - 12, bh = cellH - 52;
    const fg = i.shift ? textOn(i.color) : C.fg;
    let top = by + 6;
    if (i.shift) {
      ctx.fillStyle = i.color; roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
      // 상단: 아이콘 + 약자 (같은 크기)
      const TS = 26;
      ctx.font = `700 ${TS}px ${FONT}`;
      const tw = TS + 4 + ctx.measureText(TYPES[i.shift].short).width;
      const tx = bx + (bw - tw) / 2;
      drawIcon(ctx, TYPES[i.shift].icon, tx + TS / 2, by + 22, TS - 2, fg);
      ctx.fillStyle = fg; ctx.textAlign = 'left';
      ctx.fillText(TYPES[i.shift].short, tx + TS + 4, by + 23);
      top = by + 42;
    }
    // 공휴일·메모 영역: 한 줄에 5글자 크기, 공휴일 먼저 그 아래 메모
    const MS = Math.floor((bw - 8) / 5);
    const lh = Math.round(MS * 1.25);
    const maxLines = Math.max(0, Math.floor((by + bh - 4 - top) / lh));
    const lines = [];
    if (i.hol) wrapText(ctx, i.hol, bw - 8, `600 ${MS}px ${FONT}`).forEach(t => lines.push({ t, hol: true }));
    if (i.memo) wrapText(ctx, i.memo, bw - 8, `600 ${MS}px ${FONT}`).forEach(t => lines.push({ t }));
    ctx.textAlign = 'left';
    lines.slice(0, maxLines).forEach((ln, k) => {
      ctx.font = `600 ${MS}px ${FONT}`;
      ctx.fillStyle = ln.hol && !i.shift ? C.red : fg;
      let t = ln.t;
      if (k === maxLines - 1 && lines.length > maxLines) t = fitText(ctx, t + '…', bw - 8);
      else t = fitText(ctx, t, bw - 8);
      ctx.fillText(t, bx + 4, top + k * lh + lh / 2);
    });
    ctx.textAlign = 'center';
    if (isToday) { ctx.strokeStyle = C.today; ctx.lineWidth = 5; roundRect(ctx, cx + 2.5, cy + 2.5, colW - 5, cellH - 5, 15); ctx.stroke(); }
    ctx.globalAlpha = 1;
  });
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
function wrapText(ctx, text, max, font) {
  ctx.font = font;
  const out = [];
  String(text).split('\n').forEach(para => {
    let line = '';
    for (const ch of para) {
      if (line && ctx.measureText(line + ch).width > max) { out.push(line); line = ch.trim() ? ch : ''; }
      else line += ch;
    }
    out.push(line);
  });
  return out;
}
function fitText(ctx, t, max) {
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('btnImage').addEventListener('click', async () => {
  try {
    const blob = await renderImage();
    const name = `근무표-${view.y}-${pad(view.m + 1)}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
    downloadBlob(blob, name);
    toast('이미지를 저장했습니다');
  } catch (e) { toast('이미지를 만들지 못했습니다'); }
});

/* ───────── 토스트 ───────── */
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ───────── 이벤트 ───────── */
$('prev').addEventListener('click', () => shiftMonth(-1));
$('next').addEventListener('click', () => shiftMonth(1));
$('today').addEventListener('click', () => { const t = new Date(); view = { y: t.getFullYear(), m: t.getMonth() }; render(); });
$('grid').addEventListener('click', e => { const c = e.target.closest('[data-date]'); if (c) openDay(c.dataset.date); });
$('openPattern').addEventListener('click', () => { $('setSheet').hidden = true; openPattern(); });
$('btnSettings').addEventListener('click', openSettings);

// 좌우 스와이프로 월 이동
let touch = null;
$('cal').addEventListener('touchstart', e => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, at: Date.now() }; }, { passive: true });
$('cal').addEventListener('touchend', e => {
  if (!touch) return;
  const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - touch.at < 600) shiftMonth(dx < 0 ? 1 : -1);
  touch = null;
}, { passive: true });

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); render(); });
// 자정이 지나거나 앱으로 돌아왔을 때 '오늘' 갱신
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

// 확대(핀치·두 번 탭) 막기
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const t = Date.now();
  if (t - lastTouchEnd < 350 && !e.target.closest('input, textarea')) e.preventDefault();
  lastTouchEnd = t;
}, { passive: false });

applyTheme();
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
  // 새 버전이 설치되면 한 번 자동 새로고침 (이전 버전과 섞이지 않도록)
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true; location.reload();
  });
}
