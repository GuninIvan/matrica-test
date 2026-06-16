// ═══ filters.js — Фильтры: секции, разрез, группы, работы; мультиселект; режимы; панель «Вид» ═══
// Подключение: см. порядок <script> в index.html (важен!)

// ── FILTERS ──────────────────────────────────────────────────────
function buildFilters(){
  updateSectionUi();
  updatePrivUi();
  rebuildSecChips();
  rebuildCutFilter();
  rebuildGroupFilter();
  rebuildWorkFilter();
}

// Без допуска к контрактам (PRIV=false, решает сервер): прячем вкладки
// «Сводка» и «Подготовка» и чекбокс «Контракт ✍» в панели «Вид».
// Данные сервер уже срезал — здесь только косметика интерфейса.
function updatePrivUi(){
  ['mode-sum','mode-prep'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display = PRIV ? '' : 'none';
  });
  if(!PRIV && (MODE==='summary'||MODE==='prep')){
    MODE='work';
    ['sec','work','gantt','tasks','sum','prep'].forEach(m=>{
      const el=document.getElementById('mode-'+m);
      if(el) el.classList.toggle('on', m==='work');
    });
  }
  buildViewPanel();   // состав чекбоксов зависит от PRIV
}

// Одна секция → режим «По секции» и чипы секций не нужны (визуальный
// мусор): прячем. Появится вторая секция в таблице — вернутся сами.
function updateSectionUi(){
  const multi = CONFIG.sections.length > 1;
  document.querySelectorAll('.secui').forEach(el=>{ el.style.display = multi ? '' : 'none'; });
  const btn = document.getElementById('mode-sec');
  if(btn) btn.style.display = multi ? '' : 'none';
  if(!multi){
    FILTER_SEC.clear();
    if(MODE === 'section'){
      MODE = 'work';
      ['sec','work','gantt','tasks','sum','prep'].forEach(m=>{
        const el=document.getElementById('mode-'+m);
        if(el) el.classList.toggle('on', m==='work');
      });
    }
  }
}

// ── Мультиселект (кнопка + панель с галочками) ──────────────────
const MSEL = {};
function buildMsel(id, items, sel, allLabel, onChange){
  MSEL[id] = { items, sel, allLabel, onChange };
  renderMsel(id);
}
function renderMsel(id){
  const m = MSEL[id]; const el = document.getElementById(id);
  if(!m || !el) return;
  let btnTxt = m.allLabel;
  if(m.sel.size){
    const labs = m.items.filter(i=>m.sel.has(i.v)).map(i=>i.label);
    btnTxt = labs.length===1 ? labs[0] : labs[0]+' +'+(labs.length-1);
  }
  let h = `<button type="button" class="msel-btn" onclick="toggleMsel('${id}',event)">`+
          `<span class="mtxt">${esc(btnTxt)}</span>`+
          (m.sel.size?`<span class="cnt">${m.sel.size}</span>`:'')+`<span>▾</span></button>`+
          `<div class="msel-pop">`;
  h += `<label class="msel-item msel-all"><input type="checkbox" data-all="1"${m.sel.size===0?' checked':''}>${esc(m.allLabel)}</label>`;
  m.items.forEach((it,i)=>{
    h += `<label class="msel-item"><input type="checkbox" data-i="${i}"${m.sel.has(it.v)?' checked':''}>${esc(it.label)}</label>`;
  });
  el.innerHTML = h + '</div>';
  el.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('change',()=>{
      if(inp.dataset.all) m.sel.clear();
      else { const v=m.items[+inp.dataset.i].v; m.sel.has(v)?m.sel.delete(v):m.sel.add(v); }
      const wasOpen = el.classList.contains('open');
      renderMsel(id);
      if(wasOpen) el.classList.add('open');
      if(m.onChange) m.onChange();
    });
  });
}
function toggleMsel(id,e){
  e.stopPropagation();
  document.querySelectorAll('.msel.open').forEach(x=>{ if(x.id!==id) x.classList.remove('open'); });
  document.getElementById(id).classList.toggle('open');
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.msel')) document.querySelectorAll('.msel.open').forEach(x=>x.classList.remove('open'));
});

// ── Хелперы фильтрации ───────────────────────────────────────────
function inGroup(w){
  if(FILTER_GROUP.size===0) return true;
  return FILTER_GROUP.has(String(w['Группа работ']||'').trim());
}
function workSelected(w){
  if(FILTER_WORK.size===0) return true;
  return FILTER_WORK.has(String(w['Вид работ']));
}
// «Разрез»: пусто = всё; иначе показываем только выбранные этажи/блоки
function floorVisible(f){ return FILTER_CUT.size===0 || FILTER_CUT.has(String(f)); }
function secBlockVisible(){ return FILTER_CUT.size===0 || FILTER_CUT.has('__sec__'); }
function siteBlockVisible(){ return FILTER_CUT.size===0 || FILTER_CUT.has('__site__'); }
function anyFloorsVisible(){
  return FILTER_CUT.size===0 || [...FILTER_CUT].some(v=>v!=='__sec__'&&v!=='__site__');
}

// ── «Разрез»: этажи + «На секцию» + «Площадка» ───────────────────
function rebuildCutFilter(){
  const floors = new Set();
  CONFIG.sections.forEach(s => {
    const above=parseInt(s['Этажи выше 0.000'])||0;
    const below=parseInt(s['Этажи ниже 0.000'])||0;
    for(let f=above;f>=1;f--)   floors.add(f);
    for(let f=-1;f>=-below;f--) floors.add(f);
  });
  const items = [...floors].sort((a,b)=>b-a).map(f=>({v:String(f), label:`${f} ${t('floorShort')}`}));
  items.push({v:'__sec__',  label:t('onSecOpt')});
  items.push({v:'__site__', label:t('onSiteOpt')});
  // выбор, которого больше нет (сменился конфиг) — выбрасываем
  const valid = new Set(items.map(i=>i.v));
  [...FILTER_CUT].forEach(v=>{ if(!valid.has(v)) FILTER_CUT.delete(v); });
  buildMsel('cutMs', items, FILTER_CUT, t('allCuts'), render);
}

function rebuildGroupFilter(){
  const seen = new Set(); const items=[];
  CONFIG.works.forEach(w => {
    const g = String(w['Группа работ']||'').trim();
    if(g && !seen.has(g)){ seen.add(g); items.push({v:g, label:groupLabel(g)}); }
  });
  [...FILTER_GROUP].forEach(v=>{ if(!seen.has(v)) FILTER_GROUP.delete(v); });
  buildMsel('groupMs', items, FILTER_GROUP, t('allGroups'), ()=>{
    // сужение групп выбрасывает работы, не входящие в выбранные группы
    if(FILTER_GROUP.size){
      [...FILTER_WORK].forEach(name=>{
        const w = CONFIG.works.find(x=>String(x['Вид работ'])===name);
        if(!w || !inGroup(w)) FILTER_WORK.delete(name);
      });
    }
    rebuildWorkFilter();
    render();
  });
}

// Вид работ: ВСЕ работы (поэтажные, на секцию, на площадку) выбранных групп
function rebuildWorkFilter(){
  const items = CONFIG.works.filter(inGroup)
    .map(w=>({v:String(w['Вид работ']), label:workLabel(w)}));
  const valid = new Set(items.map(i=>i.v));
  [...FILTER_WORK].forEach(v=>{ if(!valid.has(v)) FILTER_WORK.delete(v); });
  buildMsel('workMs', items, FILTER_WORK, t('allWorks'), render);
}

function rebuildSecChips(){
  const el = document.getElementById('secChips');
  if(!el) return;
  let h = `<span class="chip${FILTER_SEC.size===0?' on':''}" data-sec="">${t('allSections')}</span>`;
  CONFIG.sections.forEach(s => {
    const v = String(s['Секция']);
    h += `<span class="chip${FILTER_SEC.has(v)?' on':''}" data-sec="${esc(v)}">${t('sectionPrefix')} ${esc(v)}</span>`;
  });
  el.innerHTML = h;
}

function setMode(m){
  MODE=m;
  if(m==='gantt') GANTT_SCROLLED=false;   // заново прокрутить к «сегодня»
  document.getElementById('mode-sec').classList.toggle('on',m==='section');
  document.getElementById('mode-work').classList.toggle('on',m==='work');
  document.getElementById('mode-gantt').classList.toggle('on',m==='gantt');
  document.getElementById('mode-tasks').classList.toggle('on',m==='tasks');
  document.getElementById('mode-sum').classList.toggle('on',m==='summary');
  document.getElementById('mode-prep').classList.toggle('on',m==='prep');
  render();
}

// ── Панель «Что показывать» ──────────────────────────────────────
function toggleViewPanel(){
  const p=document.getElementById('viewPanel');
  p.style.display = p.style.display==='none' ? 'flex' : 'none';
}
function buildViewPanel(){
  const p=document.getElementById('viewPanel');
  if(!p) return;
  const items=[
    ['pct',     t('showPct')],
    ['dstart',  t('showStart')],
    ['dend',    t('showEnd')],
    ['dev',     t('showDev')],
    ['crew',    t('showCrew')],
    ['vol',     t('showVol')],
    ['rd',      t('showRd')],
    ['tender',  t('showTender')],
    ['contract',t('showContract')],
    ['sec',     t('showSec')],
    ['fl',      t('showFloor')]
  ].filter(([k])=> PRIV || (k!=='contract' && k!=='rd' && k!=='tender'));   // 📐🧾✍ — только с допуском
  p.innerHTML = items.map(([k,lbl])=>
    `<label class="vp-item"><input type="checkbox" data-show="${k}"${SHOW[k]?' checked':''}>${esc(lbl)}</label>`
  ).join('');
  p.querySelectorAll('input[data-show]').forEach(inp=>{
    inp.addEventListener('change',()=>{
      SHOW[inp.dataset.show]=inp.checked;
      localStorage.setItem('shk_show',JSON.stringify(SHOW));
      render();
    });
  });
}

