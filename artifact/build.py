"""GitHub 버전(index.html, style.css, app.js, holidays.js)으로 claude.ai 아티팩트용 단일 HTML을 만든다.
실행: python3 artifact/build.py  (저장소 루트에서)"""
import re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()

js = rd('app.js')
def rep(a, b_):
    global js
    assert a in js, 'app.js: ' + a[:60]
    js = js.replace(a, b_, 1)
rep("const STORE_KEY = 'shiftcal.v1';\n", "")
a = js.index("/* ───────── 저장소 ───────── */"); b = js.index("/* ───────── 날짜 유틸 ───────── */")
js = js[:a] + r"""/* ───────── 저장소: claude.ai 공유 저장소(db) ─────────
   cal/settings      { pattern, colors }        — 모두가 함께 쓰는 설정
   days/<YYYY-MM-DD> { shift?, memo?, holiday? } — 날짜별 변경·메모
   화면 모드만 각자 기기(localStorage)에 저장 */
const THEME_KEY = 'shiftcal.theme';
const DEFAULT_PATTERN = { sequence: ['D', 'N', 'O', 'W'], startDate: '2026-11-30', startIndex: 0 };
function readTheme() {
  try { const t = localStorage.getItem(THEME_KEY); return ['system', 'light', 'dark'].includes(t) ? t : 'dark'; }
  catch (e) { return 'dark'; }
}
function saveTheme() { try { localStorage.setItem(THEME_KEY, state.theme); } catch (e) { /* 무시 */ } }
function normPattern(p) {
  p = p || {};
  const seq = Array.isArray(p.sequence) ? p.sequence.filter(k => PATTERN_KEYS.includes(k)) : DEFAULT_PATTERN.sequence.slice();
  return {
    sequence: seq,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? p.startDate : DEFAULT_PATTERN.startDate,
    startIndex: Number.isInteger(p.startIndex) && p.startIndex >= 0 && p.startIndex < Math.max(seq.length, 1) ? p.startIndex : 0,
  };
}
function normColors(c) {
  const out = { ...DEFAULT_COLORS };
  if (c && typeof c === 'object') for (const k of Object.keys(DEFAULT_COLORS)) if (/^#[0-9a-f]{6}$/i.test(c[k] || '')) out[k] = c[k];
  return out;
}
let state = { pattern: normPattern(DEFAULT_PATTERN), colors: { ...DEFAULT_COLORS }, days: {}, theme: readTheme() };
let db = null;
let canWrite = true;

function setStatus(msg) { const el = $('status'); el.textContent = msg || ''; el.hidden = !msg; }
function setReadOnly() {
  canWrite = false;
  document.body.classList.add('ro');
  $('roBadge').hidden = false;
}
function writeFailed(e) {
  const code = e && e.code;
  if (code === 'invalid_argument' || code === 'not_granted') { setReadOnly(); toast('수정 권한이 없습니다 (보기 전용)'); }
  else if (code === 'quota_exceeded') toast('저장 공간이 가득 찼습니다');
  else toast('저장하지 못했습니다. 잠시 후 다시 해 주세요');
}
// 같은 문서에는 한 번에 하나씩 쓰기
let settingsQueue = Promise.resolve();
function saveSettings() {
  if (!db) { toast('claude.ai에서 열어야 저장됩니다'); return; }
  const body = { pattern: state.pattern, colors: state.colors };
  settingsQueue = settingsQueue.then(() => db.doc('cal/settings').set(body)).catch(writeFailed);
}
const dayQueues = {};
function saveDay(s, rec) {
  if (!db) { toast('claude.ai에서 열어야 저장됩니다'); return; }
  const ref = db.collection('days').doc(s);
  dayQueues[s] = (dayQueues[s] || Promise.resolve())
    .then(() => Object.keys(rec).length ? ref.set(rec) : ref.delete())
    .catch(writeFailed);
}

async function connect() {
  if (!window.claude || typeof window.claude.use !== 'function') {
    setStatus('claude.ai에서 열어야 일정이 저장·공유됩니다');
    return;
  }
  db = await window.claude.use('db');
  if (!db) { setStatus('로그인하면 일정을 볼 수 있습니다'); return; }
  try {
    const user = await window.claude.use('user');
    if (user && (await user.can('data.write')) === false) setReadOnly();
  } catch (e) { /* 권한 정보 없음: 쓰기 시도 결과로 판단 */ }

  let settingsLoaded = false, daysLoaded = false;
  const timer = setTimeout(() => {
    if (!(settingsLoaded && daysLoaded)) setStatus('일정 저장소에 연결하지 못했습니다. 화면이 최신이 아닐 수 있습니다');
  }, 10000);
  const done = () => { if (settingsLoaded && daysLoaded) { clearTimeout(timer); setStatus(''); } };
  setStatus('일정을 불러오는 중…');

  db.doc('cal/settings').onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null;
    state.pattern = normPattern(d ? d.pattern : DEFAULT_PATTERN);
    state.colors = normColors(d ? d.colors : null);
    if (!snap.metadata.fromCache) { settingsLoaded = true; done(); }
    render();
    if (!$('setSheet').hidden) renderSettings();
  }, e => { clearTimeout(timer); setStatus('설정을 불러오지 못했습니다'); });

  db.collection('days').onSnapshot(snap => {
    const days = {};
    snap.docs.forEach(doc => { const v = doc.data(); if (v && /^\d{4}-\d{2}-\d{2}$/.test(doc.id)) days[doc.id] = v; });
    state.days = days;
    if (!snap.metadata.fromCache) { daysLoaded = true; done(); }
    render();
  }, e => { clearTimeout(timer); setStatus('일정을 불러오지 못했습니다'); });
}

const now = new Date();
let view = { y: now.getFullYear(), m: now.getMonth() };

""" + js[b:]
rep("""function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.theme);
  const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#000000' : '#ffffff'));
}""", """function applyTheme() { document.documentElement.setAttribute('data-mode', state.theme); }""")
rep("""  if (Object.keys(rec).length) state.days[s] = rec; else delete state.days[s];
  save(); render(); closeSheet($('daySave'));""", """  if (!canWrite) return toast('보기 전용입니다');
  if (Object.keys(rec).length) state.days[s] = rec; else delete state.days[s];
  saveDay(s, rec); render(); closeSheet($('daySave'));""")
rep("""  state.pattern = patDraft;
  // 패턴과 같아진 예외 기록은 정리
  for (const [s, rec] of Object.entries(state.days)) {
    if (rec.shift && rec.shift === patternShift(s)) { delete rec.shift; if (!Object.keys(rec).length) delete state.days[s]; }
  }
  save(); render(); closeSheet($('patSave'));""", """  if (!canWrite) return toast('보기 전용입니다');
  state.pattern = patDraft;
  saveSettings(); render(); closeSheet($('patSave'));""")
rep("""  state.theme = b.dataset.themeVal; save(); applyTheme(); renderSettings();""", """  state.theme = b.dataset.themeVal; saveTheme(); applyTheme(); renderSettings();""")
rep("""  sw.style.background = e.target.value; sw.style.color = textOn(e.target.value);
  save(); render();
});
$('colorReset').addEventListener('click', () => { state.colors = { ...DEFAULT_COLORS }; save(); render(); renderSettings(); });
$('wipeBtn').addEventListener('click', () => {
  if (!confirm('패턴, 예외 근무, 메모, 색상을 모두 초기화할까요?')) return;
  state = defaultState(); save(); applyTheme(); render(); renderSettings();
  toast('초기화했습니다');
});""", """  sw.style.background = e.target.value; sw.style.color = textOn(e.target.value);
  render();
});
// 색 고르기가 끝났을 때 한 번만 저장
$('colorList').addEventListener('change', e => { if (e.target.dataset.k && canWrite) saveSettings(); });
$('colorReset').addEventListener('click', () => {
  if (!canWrite) return toast('보기 전용입니다');
  state.colors = { ...DEFAULT_COLORS }; saveSettings(); render(); renderSettings();
});""")
rep("""<input type="color" data-k="${k}" value="${c}" aria-label""", """<input type="color" id="color-${k}" data-k="${k}" value="${c}" ${canWrite ? '' : 'disabled'} aria-label""")
rep("""document.fonts.load(`${w} 32px "Pretendard Variable"`, glyphs)""", """document.fonts.load(`${w} 32px "Noto Sans KR"`, glyphs)""")
a = js.index("function downloadBlob(blob, name) {"); b = js.index("/* ───────── 토스트 ───────── */")
js = js[:a] + """let downloadsApi;
$('btnImage').addEventListener('click', async () => {
  try {
    if (downloadsApi === undefined) downloadsApi = window.claude ? await window.claude.use('downloads') : null;
    if (!downloadsApi) return toast('여기서는 이미지를 저장할 수 없습니다');
    const blob = await renderImage();
    const name = `근무표-${view.y}-${pad(view.m + 1)}.png`;
    const r = await downloadsApi.save({ filename: name, data: blob });
    if (r && r.status === 'saved') toast('이미지를 저장했습니다');
  } catch (e) {
    const code = e && e.code;
    if (code === 'declined') return;
    if (code === 'rate_limited') return toast('잠시 후 다시 눌러 주세요');
    if (code === 'host_unavailable') return toast('이 앱에서는 저장할 수 없습니다. 브라우저에서 열어 주세요');
    toast('이미지를 저장하지 못했습니다');
  }
});

""" + js[b:]
a = js.index("matchMedia('(prefers-color-scheme: dark)')")
js = js[:a] + """// 자정이 지나거나 다시 볼 때 '오늘' 갱신
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

applyTheme();
render();
connect();
"""
assert not re.search(r'(?<![.\w])save\(\)', js)
for w in ['STORE_KEY', 'serviceWorker', 'defaultState', 'wipeBtn', 'confirm(']:
    assert w not in js, w

css = rd('style.css')
b = css.index("[hidden] { display: none !important; }")
LIGHT = """--bg: #ffffff; --fg: #111111; --muted: #4a4a4a; --line: #d4d4d8;
    --surface: #f1f1f3; --sheet: #ffffff; --red: #d50000; --today: #111111; --accent: #1E63D6;
    color-scheme: light;"""
css = f"""/* 근무표 캘린더 — 다크가 기본. data-mode(dark|light|system)는 각 기기에서 고른 화면 모드 */
:root {{
  --bg: #000000; --fg: #f5f5f5; --muted: #c4c4c4; --line: #3a3a3e;
  --surface: #121214; --sheet: #161618; --red: #ff5c5c; --today: #ffffff; --accent: #6ea8ff;
  --font: "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  color-scheme: dark;
}}
:root[data-mode="light"] {{ {LIGHT} }}
@media (prefers-color-scheme: light) {{
  :root[data-mode="system"]:not([data-theme="dark"]) {{ {LIGHT} }}
}}
:root[data-mode="system"][data-theme="light"] {{ {LIGHT} }}

""" + css[b:]
def crep(a, b_):
    global css
    assert a in css, 'css: ' + a[:60]
    css = css.replace(a, b_, 1)
crep("""html, body { margin: 0; height: 100%; touch-action: manipulation; overscroll-behavior: none; }""", """html, body { margin: 0; height: 100%; touch-action: manipulation; overscroll-behavior: none; }
html { background: var(--bg); }""")
crep("""  display: flex; flex-direction: column; height: 100dvh; overflow: hidden;
  padding-top: env(safe-area-inset-top);""", """  display: flex; flex-direction: column; overflow: hidden;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));""")
crep(".top { display: flex; align-items: center; gap: 4px; padding: 6px 10px; flex: none; }", ".top { display: flex; align-items: center; gap: 4px; padding: 6px 0; flex: none; }")
crep(".stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 2px 6px 8px; flex: none; }", ".stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 2px 0 8px; flex: none; }")
crep(".cal { flex: 1; display: flex; flex-direction: column; padding: 0 4px; min-height: 0; }", ".cal { flex: 1; display: flex; flex-direction: column; padding: 0; min-height: 0; }")
crep("""@media (min-width: 700px) {
  body { max-width: 760px; margin: 0 auto; }
}""", """@media (min-width: 700px) {
  body { max-width: 760px; margin: 0 auto; }
}
.status { flex: none; margin: 0 0 6px; padding: 8px 12px; border-radius: 10px; background: var(--surface); color: var(--muted); font-size: 13px; font-weight: 600; text-align: center; }
.ro-badge { flex: none; height: 26px; padding: 0 10px; border-radius: 13px; border: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.ro .write-only { display: none !important; }
.ro .shift-pick button, .ro textarea, .ro .check input, .ro .seq button, .ro #patDate { pointer-events: none; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
/* 칸 폭 기준으로 날짜·근무 표시 크기 조절 (좌우 여백 16px 때문에 칸이 좁아짐) */
.cell { container-type: inline-size; }
@container (max-width: 54px) {
  .top { padding: 2px 2px 0 !important; gap: 1px !important; }
  .top .n { min-width: 14px !important; padding: 0 !important; font-size: 12px !important; }
  .tag { gap: 0 !important; }
  .tag svg { width: 12px !important; height: 12px !important; }
  .tag .s { font-size: 12px !important; }
}
@container (max-width: 44px) { .tag svg { display: none; } }""")

h = rd('index.html')
body = h[h.index('<body>') + 6:h.index('<script src="holidays.js')]
def brep(a, b_):
    global body
    assert a in body, 'html: ' + a[:60]
    body = body.replace(a, b_, 1)
brep('<button class="todaybtn" id="today">오늘</button>', '<span class="ro-badge" id="roBadge" hidden>보기 전용</span>\n  <button class="todaybtn" id="today">오늘</button>')
brep('<section class="stats"', '<p class="status" id="status" role="status" hidden></p>\n\n<section class="stats"')
brep('<button class="wide ghost" id="dayReset">', '<button class="wide ghost write-only" id="dayReset">')
brep('<button class="wide primary" id="daySave">', '<button class="wide primary write-only" id="daySave">')
brep('<button class="wide primary" id="patSave">', '<button class="wide primary write-only" id="patSave">')
brep('<button class="wide ghost" id="colorReset">', '<button class="wide ghost write-only" id="colorReset">')
brep('''    <div class="field">데이터</div>
    <button class="wide danger" id="wipeBtn">모든 데이터 초기화</button>
''', '''    <p class="sub small">근무 패턴, 색상, 날짜별 변경과 메모는 이 근무표를 공유받은 사람과 함께 쓰입니다. 화면 모드는 기기마다 따로 저장됩니다.</p>
''')
page = f"""<title>근무표 캘린더</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;600;700&display=swap">
<style>
{css}
</style>
{body}
<script>
{rd('holidays.js')}
</script>
<script>
{js}
</script>
"""
open(os.path.join(ROOT, 'artifact', 'shift-calendar.html'), 'w', encoding='utf-8').write(page)
print('built', len(page.encode()), 'bytes')
