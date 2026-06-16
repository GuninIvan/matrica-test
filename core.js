// ═══ core.js — API, цвета/отставание, язык, состояние, init, авторизация, загрузка данных ═══
// Подключение: см. порядок <script> в index.html (важен!)

const DEMO = true;                                  // демо-сборка: бэкенд не вызывается
let   DEMO_ROLE = localStorage.getItem('shk_demo_role') || 'gen';   // gen | sub | anon
const API = '';                                     // в демо не используется (см. demoApi)

// ── ТРАНСПОРТ ────────────────────────────────────────────────────
// Всё общение с сервером — POST с телом text/plain (JSON):
// пароль/токен не попадают в URL, логи и историю браузера.
// Таймаут 15 с + до 2 повторов с паузой — для плохой связи на стройке.
// Повторы безопасны: и чтение, и запись процента идемпотентны.
async function apiFetch(payload, opts){
  if (DEMO) return demoApi(payload);
  const retries = (opts && opts.retries !== undefined) ? opts.retries : 2;
  const timeout = (opts && opts.timeout) || 15000;
  let lastErr;
  for(let attempt = 0; attempt <= retries; attempt++){
    const ctrl = new AbortController();
    const tm = setTimeout(()=>ctrl.abort(), timeout);
    try {
      const r = await fetch(API, { method:'POST', body: JSON.stringify(payload), signal: ctrl.signal });
      clearTimeout(tm);
      return await r.json();
    } catch(e) {
      clearTimeout(tm);
      lastErr = e;
      if(attempt < retries) await new Promise(res=>setTimeout(res, 1200*(attempt+1)));
    }
  }
  throw lastErr;
}

// ── ДЕМО-РЕЖИМ ───────────────────────────────────────────────────
// Бэкенда нет: все запросы обслуживаются локально из DEMO_SNAPSHOT (demo-data.js).
// Правки % живут только в памяти (DATA) и сбрасываются перезагрузкой / resetDemo().
// Три роли-чипсины задают допуск: Аноним (смотрит) · Подрядчик (правит %, без
// контрактов) · Генподрядчик (всё + Сводка/Подготовка). priv режется как на сервере.
const DEMO_PRIV_FIELDS = ['РД выпущено','Тендер проведен','Контракт заключен'];
function demoRoleMeta(role){
  if (role==='gen') return {priv:true,  edit:true};
  if (role==='sub') return {priv:false, edit:true};
  return                    {priv:false, edit:false}; // anon
}
function demoSnapshot(role){
  const meta = demoRoleMeta(role), src = DEMO_SNAPSHOT;
  if (meta.priv) return {priv:true, config:src.config, rows:src.rows, summary:src.summary};
  const works = src.config.works.map(function(w){
    const o={}; Object.keys(w).forEach(function(k){ if(!/^(РД|Тендер|Контракт)\s*\//.test(k)) o[k]=w[k]; }); return o; });
  const rows = src.rows.map(function(r){
    const o={}; Object.keys(r).forEach(function(k){ if(DEMO_PRIV_FIELDS.indexOf(k)===-1) o[k]=r[k]; }); return o; });
  return {priv:false, config:{works:works, sections:src.config.sections, warnings:[]}, rows:rows, summary:[]};
}
function demoApi(payload){
  const a = payload && payload.action;
  if (a==='all')        return demoSnapshot(DEMO_ROLE);
  if (a==='login')      return {open:true};
  if (a==='update')     return {success:true, key:'', updatedAt:new Date().toLocaleString('ru')};
  if (a==='prepUpdate') return {success:true};
  return {ok:true};
}
function applyDemoRole(){ OPEN_MODE=true; USER=null; renderUserArea(); }
function setDemoRole(role){
  DEMO_ROLE=role; try{ localStorage.setItem('shk_demo_role',role); }catch(e){}
  applyDemoRole(); loadAll();
}
function resetDemo(){ loadAll(); }

// ── ЛОГ ОШИБОК ───────────────────────────────────────────────────
// Ошибки клиента улетают на сервер в лист «Лог ошибок».
// Не больше 5 за сессию, отправка fire-and-forget без повторов.
let ERR_SENT = 0;
function logError(where, msg){
  try {
    if(ERR_SENT >= 5) return;
    ERR_SENT++;
    apiFetch({
      action:'log', where:String(where), msg:String(msg).slice(0,500),
      who: (USER && USER.name) || userName || '',
      ua: navigator.userAgent
    }, {retries:0, timeout:8000}).catch(()=>{});
  } catch(e) {}
}
window.addEventListener('error', e => logError('window', e.message + ' @ ' + (e.filename||'') + ':' + (e.lineno||'')));
window.addEventListener('unhandledrejection', e => logError('promise', (e.reason && e.reason.message) || String(e.reason)));

// ── ЦВЕТ полоски ─────────────────────────────────────────────────
// Запасной вариант (нет данных об отставании): по проценту
// 0% → серый трек, 1–99% → красный→жёлтый, 100% → зелёный
function barColor(pct) {
  if (pct === 0)   return null;
  if (pct === 100) return '#2f9e44';
  const hue = Math.round((pct / 99) * 60);
  return `hsl(${hue},${pct < 50 ? 75 : 78}%,${pct < 50 ? 50 : 43}%)`;
}

// ── ЦВЕТ по отставанию ───────────────────────────────────────────
// 1 день — уже жёлтый (hue 50), 30+ дней — красный (hue 0)
function devHue(dev){
  const x = Math.min(Math.max(dev,1),30);
  return Math.round(50 * (1 - (x-1)/29));
}
// Цвет полоски: приоритет — отставание; нет данных — по проценту
function cellBarColor(d){
  if (d.pct === 100) return '#2f9e44';
  if (d.dev !== null){
    if (d.dev > 0) return `hsl(${devHue(d.dev)},80%,45%)`;
    return '#2f9e44';                       // в графике / опережение
  }
  return barColor(d.pct);
}
// Заливка всей карточки. Не начали и отставания нет — не красим.
function cellTint(d){
  if (d.pct === 100 || d.dev === null) return '';
  if (d.dev > 0)  return `hsl(${devHue(d.dev)},75%,93%)`;   // отстаёт
  if (d.pct > 0)  return 'hsl(140,45%,94%)';                // идёт в графике
  return '';                                                 // не начата, не отстаёт
}

// Метки секции/этажа по языку
const SEC_LBL = { ru:'с', sr:'s', en:'s' };
const FL_LBL  = { ru:'э', sr:'sp', en:'fl' };
const DAY_LBL = { ru:'д', sr:'d', en:'d' };   // суффикс дней в отставании

// ── Цвет колонки работы: фон ячейки «Вид работ» в Google-таблице ──
function workColor(name){
  const w = CONFIG.works.find(x=>String(x['Вид работ'])===String(name));
  const c = w && String(w['Цвет']||'').trim();
  return (c && /^#[0-9a-f]{6}$/i.test(c)) ? c : '';
}
function hexA(hex,a){   // #rrggbb -> rgba(r,g,b,a)
  const n=parseInt(hex.slice(1),16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
// Подчёркивание названия работы в шапке полосой её цвета
function thWork(w){
  const c=workColor(w['Вид работ']);
  return `<th class="h-work"${c?` style="box-shadow:inset 0 -3px 0 ${c}"`:''}>${esc(workLabel(w))}</th>`;
}

// Перевод названия работы ТОЛЬКО для отображения.
// В базу и в ключ всегда уходит русское w['Вид работ'].
// Колонки в «Списке работ»: «Вид работ SR», «Вид работ EN».
function workLabel(w){
  if(CURRENT_LANG==='sr' && String(w['Вид работ SR']||'').trim()) return String(w['Вид работ SR']).trim();
  if(CURRENT_LANG==='en' && String(w['Вид работ EN']||'').trim()) return String(w['Вид работ EN']).trim();
  return w['Вид работ'];
}
// Перевод названия группы (колонки «Группа работ SR/EN»)
function groupLabel(g){
  const w = CONFIG.works.find(x=>String(x['Группа работ']||'').trim()===g);
  if(w){
    if(CURRENT_LANG==='sr' && String(w['Группа работ SR']||'').trim()) return String(w['Группа работ SR']).trim();
    if(CURRENT_LANG==='en' && String(w['Группа работ EN']||'').trim()) return String(w['Группа работ EN']).trim();
  }
  return g;
}

// ── ЯЗЫК ─────────────────────────────────────────────────────────
let CURRENT_LANG = 'ru';
function t(key){ return (LANG[CURRENT_LANG]&&LANG[CURRENT_LANG][key]) ? LANG[CURRENT_LANG][key] : key; }

function setLang(lang){
  CURRENT_LANG = lang;
  localStorage.setItem('shk_lang', lang);
  ['ru','sr','en'].forEach(l => document.getElementById('lang-'+l).classList.toggle('on', l===lang));
  applyLang();
  render();
}

function applyLang(){
  document.getElementById('ui-title').textContent      = t('title');
  var _dt=document.getElementById('ui-demoTip');     if(_dt) _dt.textContent=t('demoTip');
  var _dc=document.getElementById('ui-demoCtaText'); if(_dc) _dc.textContent=t('demoCta');
  var _db=document.getElementById('ui-demoBadge'); if(_db) _db.textContent=t('demoBadge');
  var _dr=document.getElementById('ui-demoReset'); if(_dr) _dr.textContent=t('demoReset');
  document.getElementById('mode-sec').textContent      = t('bySection');
  document.getElementById('mode-work').textContent     = t('byWork');
  document.getElementById('mode-gantt').textContent    = t('byGantt');
  document.getElementById('mode-tasks').textContent    = t('byTasks');
  document.getElementById('mode-sum').textContent      = t('bySummary');
  document.getElementById('mode-prep').textContent     = t('byPrep');
  document.getElementById('ui-deadlineLbl').textContent= t('deadlineLbl');
  document.getElementById('ui-showBtn').textContent    = t('showBtn');
  document.getElementById('ui-sectionLbl').textContent = t('sectionLbl');
  document.getElementById('ui-cutLbl').textContent     = t('cutLbl');
  document.getElementById('ui-groupLbl').textContent   = t('groupLbl');
  document.getElementById('ui-workLbl').textContent    = t('workLbl');
  document.getElementById('ui-pctLabel').textContent   = t('pctLabel');
  document.getElementById('ui-crewFact').textContent   = t('crewFact');
  document.getElementById('ui-cancel').textContent     = t('cancel');
  document.getElementById('saveBtn').textContent       = t('save');
  document.getElementById('ui-loading').textContent    = t('loading');
  document.getElementById('ui-hint').textContent       = t('hint');
  document.title = t('title');
  rebuildSecChips();        // чипы секций тоже перестраиваются при смене языка
  rebuildCutFilter();
  rebuildGroupFilter();
  rebuildWorkFilter();
  buildViewPanel();
  renderUserArea();
}

// ── ДАННЫЕ / СОСТОЯНИЕ ───────────────────────────────────────────
let CONFIG = { works:[], sections:[] };
let DATA   = {};
let SUMMARY= [];
let MODE   = 'section';
// «Что показывать» в ячейке (галочки), хранится в localStorage
let SHOW = { pct:true, dstart:false, dend:true, dev:true, crew:false, vol:false,
             front:true, rd:true, tender:true, contract:true, sec:true, fl:true };
try{ const s=JSON.parse(localStorage.getItem('shk_show')||'null'); if(s) SHOW=Object.assign(SHOW,s);}catch(e){}
let DEADLINE = null;   // режим «к дате»: Date или null
let FILTER_SEC   = new Set();
let FILTER_CUT   = new Set();   // «Разрез»: номера этажей (строки), '__sec__', '__site__'; пусто = всё
let FILTER_WORK  = new Set();   // выбранные виды работ (русские ID); пусто = все
let FILTER_GROUP = new Set();   // выбранные группы; пусто = все
// Фильтры запоминаются между сессиями (прораб своей секции не выбирает её заново).
// Несуществующие значения вычищаются в rebuild*-функциях после загрузки конфига.
try{
  const f = JSON.parse(localStorage.getItem('shk_filters')||'null');
  if(f){
    FILTER_SEC   = new Set(f.sec||[]);
    FILTER_CUT   = new Set(f.cut||[]);
    FILTER_GROUP = new Set(f.grp||[]);
    FILTER_WORK  = new Set(f.wrk||[]);
  }
}catch(e){}
function saveFilters(){
  try{
    localStorage.setItem('shk_filters', JSON.stringify({
      sec:[...FILTER_SEC], cut:[...FILTER_CUT], grp:[...FILTER_GROUP], wrk:[...FILTER_WORK]
    }));
  }catch(e){}
}
let CUR    = null;
let userName  = '';
let USER      = null;    // {name, role, sections} после входа по паролю
let OPEN_MODE = false;   // true, если в таблице нет листа «Роли» — доступ всем
// Допуск к контрактной информации (вкладки «Сводка»/«Подготовка», флаг ✍).
// Решает СЕРВЕР по токену (роли «Генподряд»/«Заказчик» или открытый режим)
// и режет данные сам; флаг приходит в ответе action=all и правит только UI.
let PRIV = true;

// ── INIT ─────────────────────────────────────────────────────────
window.onload = async () => {
  CURRENT_LANG = localStorage.getItem('shk_lang') || 'ru';
  userName = localStorage.getItem('shk_name') || '';
  ['ru','sr','en'].forEach(l => document.getElementById('lang-'+l).classList.toggle('on', l===CURRENT_LANG));
  applyLang();
  initDelegation();
  await Promise.all([initAuth(), loadAll()]);
};
function saveName(v){ userName=v.trim(); localStorage.setItem('shk_name',userName); }

// Делегирование кликов: ячейки и чипы секций без inline-onclick —
// названия работ с кавычками/апострофами больше ничего не ломают.
// Слушатель на #bwrap (не #board): режим «По виду работ» рисует
// под-таблицы «на секцию»/«на площадку» в #subBoards — он тоже внутри.
// Чужие клики не задеваем: prep/tasks/gantt не используют td.cell.
function initDelegation(){
  document.getElementById('bwrap').addEventListener('click', e => {
    const td = e.target.closest('td.cell');
    if(!td || td.classList.contains('na')) return;
    openModal(td.dataset.sec, td.dataset.floor, td.dataset.work);
  });
  document.getElementById('secChips').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if(!c) return;
    const v = c.dataset.sec;
    if(v === '') FILTER_SEC.clear();
    else FILTER_SEC.has(v) ? FILTER_SEC.delete(v) : FILTER_SEC.add(v);
    rebuildSecChips();
    render();
  });
}

// ── АВТОРИЗАЦИЯ ──────────────────────────────────────────────────
// Пароль уходит на сервер один раз при входе; в ответ приходит токен,
// который хранится в localStorage и используется во всех запросах.
async function initAuth(){
  if(DEMO){ applyDemoRole(); return; }
  try {
    const token = localStorage.getItem('shk_token') || '';
    const oldPass = localStorage.getItem('shk_pass') || '';   // миграция со старой схемы
    let j = null;
    if(token)        j = await apiFetch({action:'login', token});
    else if(oldPass) j = await apiFetch({action:'login', pass: oldPass});
    else             j = await apiFetch({action:'login'});
    if(j && j.open){ OPEN_MODE = true; USER = null; }
    else if(j && j.name){
      USER = j;
      if(j.token) localStorage.setItem('shk_token', j.token);
      localStorage.removeItem('shk_pass');                    // пароль больше не храним
    } else {
      USER = null;
      if(token) localStorage.removeItem('shk_token');
      if(oldPass) localStorage.removeItem('shk_pass');
    }
  } catch(e){ USER = null; }
  renderUserArea();
}

async function doLogin(){
  const inp = document.getElementById('passInp');
  const pass = (inp && inp.value || '').trim();
  if(!pass) return;
  try {
    const j = await apiFetch({action:'login', pass});
    if(j.error || !j.name){ toast(t('wrongPass'),'err'); return; }
    if(j.token) localStorage.setItem('shk_token', j.token);
    USER = j;
    renderUserArea();
    toast('👤 '+j.name,'ok');
    loadAll();   // допуск мог измениться — сервер отдаст данные под новую роль
  } catch(e){ toast(t('errorSave'),'err'); logError('doLogin', e.message); }
}

function logout(){
  const token = localStorage.getItem('shk_token');
  if(token) apiFetch({action:'logout', token}, {retries:0}).catch(()=>{});
  localStorage.removeItem('shk_token');
  localStorage.removeItem('shk_pass');
  USER = null;
  renderUserArea();
  loadAll();   // без токена сервер контрактную информацию не отдаст
}

// Может ли пользователь редактировать данную работу на данной секции.
// Ограничения по секциям и по видам работ ПЕРЕСЕКАЮТСЯ (логика И):
// «Секции: 1» + «Вид работ: Монолит» = только монолит на секции 1.
// Пустое поле = без ограничения.
function canEdit(sec, work){
  if(DEMO) return demoRoleMeta(DEMO_ROLE).edit;
  if(OPEN_MODE) return true;
  if(!USER) return false;
  if(String(USER.role||'').trim().toLowerCase() === 'читатель') return false;

  const inList = (raw, val) => {
    const s = String(raw||'').trim();
    if(s === '') return true;
    const low = s.toLowerCase();
    if(low === 'все' || low === 'sve' || low === 'all') return true;
    return s.split(',').map(x=>x.trim()).includes(String(val).trim());
  };

  if(!inList(USER.sections, sec))  return false;
  if(!inList(USER.works,    work)) return false;
  return true;
}

function renderUserArea(){
  const el = document.getElementById('userArea');
  if(!el) return;
  if(DEMO){
    const chip=function(v,lbl){ return '<span class="chip'+(DEMO_ROLE===v?' on':'')+'" onclick="setDemoRole(\''+v+'\')">'+esc(lbl)+'</span>'; };
    el.innerHTML = '<div class="chips demo-roles">'+chip('anon',t('roleAnon'))+chip('sub',t('roleSub'))+chip('gen',t('roleGen'))+'</div>';
    return;
  }
  if(OPEN_MODE){
    el.innerHTML = `<span style="font-size:11px;color:var(--ink3);">👤</span>
      <input class="name-inp" id="nameInp" placeholder="${esc(t('yourName'))}" value="${esc(userName)}" oninput="saveName(this.value)">`;
  } else if(USER){
    el.innerHTML = `<span class="user-badge">👤 <b>${esc(USER.name)}</b>${USER.role?' · '+esc(USER.role):''}</span>
      <button class="btn" onclick="logout()">${esc(t('logout'))}</button>`;
  } else {
    el.innerHTML = `<input class="name-inp" id="passInp" type="password" placeholder="${esc(t('passHolder'))}"
        onkeydown="if(event.key==='Enter')doLogin()">
      <button class="btn btn-pri" onclick="doLogin()">${esc(t('login'))}</button>`;
  }
}

// ── LOAD ─────────────────────────────────────────────────────────
// Один запрос action=all вместо трёх: один холодный старт Apps Script.
async function loadAll(){
  setSt('spin',t('loading')); showLoader(t('loadingSheets'));
  try {
    const j = await apiFetch({action:'all', token: localStorage.getItem('shk_token')||''});
    if(j.error) throw new Error(j.error);
    PRIV = (j.priv !== false);   // старый сервер без поля priv = всё видно
    const cfg = j.config || {};
    SUMMARY = j.summary || [];
    CONFIG.works    = cfg.works    || [];
    CONFIG.sections = cfg.sections || [];
    DATA = {};
    (j.rows||[]).forEach(r => {
      const k = makeKey(r['Секция'], r['Этаж'], r['Вид работ']);
      DATA[k] = {
        found:    true,
        pct:      parseFloat(r['% выполнения'])||0,
        updatedAt:r['Обновлено'] ||'',
        startDate:normalizeDate(r['Дата начала']),
        planDate: normalizeDate(r['Дата план']),
        factDate: normalizeDate(r['Дата факт']),
        dev:      parseDev(r['Отставание']),
        front:    (DEMO ? true : parseGate(r['Фронт открыт'])),   // ДЕМО: фронт всегда открыт (нет Google-таблицы) → риск «Фронт закрыт» и иконка 🔒 не возникают
        rd:       parseGate(r['РД выпущено']),
        tender:   parseGate(r['Тендер проведен']),
        contract: parseGate(r['Контракт заключен']),
        predReady:parseDev(r['Готовность предшественника']),   // % или null («не назначен»)
        vol:      parseFloat(r['Объем'])||null,
        rate:     parseFloat(r['Выработка'])||null,
        unit:     String(r['Ед.изм']||''),
        crew:     parseInt(r['Численность'])||null
      };
    });
    buildFilters();
    render();
    setSt('ok', t('loaded')+' · '+new Date().toLocaleTimeString('ru'));
    toast(t('loaded'),'ok');
    // Предупреждения конфига (опечатки в таблице) — жёлтым, подольше
    if(cfg.warnings && cfg.warnings.length){
      toast('⚠ '+cfg.warnings.slice(0,5).join(' · ')+(cfg.warnings.length>5?' · …':''),'warn',9000);
    }
  } catch(e) {
    setSt('err',e.message);
    toast('Ошибка: '+e.message,'err',4000);
    logError('loadAll', e.message);
    document.getElementById('emptyState').style.display='flex';
    document.getElementById('board').style.display='none';
  }
  hideLoader();
}

