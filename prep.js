// ═══ prep.js — Режим «Подготовка»: РД → Тендер → Контракт ═══
// Подключение: см. порядок <script> в index.html (важен!)
//
// Источник — «Список работ», колонки на каждую фазу (РД/Тендер/Контракт):
//   «<Фаза> / Готовность»       — чекбокс TRUE, когда фаза закрыта
//   «<Фаза> / Начало работ»     — когда фазу надо НАЧАТЬ (дедлайн старта)
//   «<Фаза> / Дата готовности»  — к какой дате фаза должна быть готова
//   «<Фаза> / Длительность»     — дней на фазу
// Математика дедлайнов — формулами в таблице (обратный отсчёт от первого
// старта работ в БД); здесь разбор, отображение и переключение «Готово»
// кликом (пишется TRUE/FALSE в «Список работ» через action=prepUpdate).

const PREP_PHASES = [
  {key:'РД',       lbl:'prepRd'},
  {key:'Тендер',   lbl:'prepTender'},
  {key:'Контракт', lbl:'prepContract'},
];

// Статус фазы на сегодня:
//   ok   — готовность TRUE
//   late — не готово, дата готовности уже прошла
//   run  — не готово, начинать уже пора (старт ≤ сегодня)
//   idle — не готово, старт ещё впереди
//   none — нет ни дат, ни признака (не настроено)
function prepPhaseStatus(w, phase){
  const ready = parseBool(w[phase+' / Готовность']);
  const start = parseDate(normalizeDate(w[phase+' / Начало работ']));
  const due   = parseDate(normalizeDate(w[phase+' / Дата готовности']));
  const dur   = parseFloat(w[phase+' / Длительность'])||null;
  if(ready===true) return {st:'ok', start, due, dur};
  if(!start && !due && ready===null) return {st:'none', start, due, dur};
  const today=new Date(); today.setHours(0,0,0,0);
  let st='idle', lateDays=0;
  if(due && today>due){ st='late'; lateDays=Math.round((today-due)/86400000); }
  else if(start && today>=start){ st='run'; }
  return {st, start, due, dur, lateDays};
}

// Бейдж статуса фазы — общий для ячейки таблицы и карточки
function prepBadge(p){
  if(p.st==='ok')   return `<span class="pp-badge ok">✓ ${t('stReady')}</span>`;
  if(p.st==='late') return `<span class="pp-badge late">+${p.lateDays}${DAY_LBL[CURRENT_LANG]||'д'} ${t('stLate')}</span>`;
  if(p.st==='run')  return `<span class="pp-badge run">${t('stRun')}</span>`;
  if(p.st==='idle') return `<span class="pp-badge idle">${t('stIdle')}</span>`;
  return '';
}

function prepCellHtml(w, wi, phase){
  const p = prepPhaseStatus(w, phase);
  const phMeta = PREP_PHASES.find(x=>x.key===phase);
  const lbl = esc(phMeta ? t(phMeta.lbl) : phase);   // метка фазы — для мобильной раскладки (data-label)
  if(p.st==='none') return `<td class="pp pp-none" data-label="${lbl}">—</td>`;
  const dates = [
    p.start ? `${t('startShort')} ${fmtShort(toDmy(p.start))}` : '',
    p.due   ? `${t('readyBy')} ${fmtShort(toDmy(p.due))}`      : '',
  ].filter(Boolean).join(' · ');
  const dur = p.dur ? `<span class="pp-dur">${p.dur} ${t('durShort')}</span>` : '';
  // Клик по ячейке больше НЕ переключает «Готово» (случайный тап на
  // телефоне менял данные молча) — теперь клик по строке открывает
  // карточку подготовки, переключение — осознанно, кнопкой в карточке.
  return `<td class="pp pp-${p.st}" data-label="${lbl}">${prepBadge(p)}<div class="pp-dates">${esc(dates)}</div>${dur}</td>`;
}

function toDmy(d){
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
}

function renderPrep(container){
  // Фильтры «Группа» и «Вид работ» действуют и здесь
  const works = CONFIG.works
    .map((w,wi)=>({w,wi}))
    .filter(x=>inGroup(x.w)&&workSelected(x.w));

  // Группировка по «Группе работ»; внутри группы — горящие контракты сверху
  const byGroup = new Map();
  works.forEach(x=>{
    const g = String(x.w['Группа работ']||'').trim() || '—';
    if(!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(x);
  });
  const contractDue = x => {
    const d = parseDate(normalizeDate(x.w['Контракт / Дата готовности']));
    return d ? d.getTime() : Infinity;
  };
  const groups = [...byGroup.entries()].map(([g,items])=>{
    items.sort((a,b)=>contractDue(a)-contractDue(b));
    return {g, items, due: Math.min(...items.map(contractDue))};
  }).sort((a,b)=>a.due-b.due);   // группы тоже: что горит — выше

  // Счётчик просроченных фаз
  let lateCnt=0;
  works.forEach(x=>PREP_PHASES.forEach(ph=>{ if(prepPhaseStatus(x.w,ph.key).st==='late') lateCnt++; }));

  let h='';
  h+=`<div class="prep-head"><b>${t('byPrep')}</b>`;
  if(lateCnt) h+=` <span class="risk-pill">⚠ ${t('stLate')}: ${lateCnt}</span>`;
  h+=`</div>`;

  groups.forEach(grp=>{
    h+=`<div class="sum-card prep-grp"><div class="tk-sec-h">${esc(groupLabel(grp.g))} <span class="n">· ${grp.items.length}</span></div>`;
    h+=`<table class="prep-tbl"><thead><tr>`+
       `<th class="pp-work">${esc(t('colWork'))}</th>`+
       PREP_PHASES.map(ph=>`<th>${esc(t(ph.lbl))}</th>`).join('')+
       `<th class="pp-start">${esc(t('prepStart'))}</th>`+
       `</tr></thead><tbody>`;
    grp.items.forEach(x=>{
      const name = x.w['Вид работ'];
      const wc = workColor(name);
      const dot = `<span class="dot" style="background:${wc||'var(--brd2)'}"></span>`;
      const startWork = normalizeDate(x.w['Контракт / Дата готовности']);   // = первый старт в БД
      h+=`<tr data-wi="${x.wi}" title="${esc(t('prepClickHint'))}">`+
         `<td class="pp-work">${dot}${esc(workLabel(x.w))}</td>`+
         PREP_PHASES.map(ph=>prepCellHtml(x.w, x.wi, ph.key)).join('')+
         `<td class="pp-start" data-label="${esc(t('prepStart'))}">${startWork?esc(startWork):'—'}</td>`+   // дата старта — с годом
         `</tr>`;
    });
    h+=`</tbody></table></div>`;
  });

  container.innerHTML=h;
  container.onclick=prepClick;   // делегирование; перезапись свойства — без дублей
}

// ── Карточка подготовки ──────────────────────────────────────────
// Клик по строке → карточка: все три фазы (РД → Тендер → Контракт)
// с полными датами, статусами и длительностью + дата старта работ.
// Переключение «Готово» — кнопкой в карточке (а не случайным тапом).
let PREP_CARD_WI = null;

function prepClick(e){
  const tr = e.target.closest('tr[data-wi]');
  if(!tr) return;
  openPrepCard(parseInt(tr.dataset.wi));
}

function openPrepCard(wi){
  if(!CONFIG.works[wi]) return;
  PREP_CARD_WI = wi;
  renderPrepCard();
  document.getElementById('prepOverlay').classList.add('on');
}

function closePrepCard(e){
  if(e && e.target!==e.currentTarget) return;
  document.getElementById('prepOverlay').classList.remove('on');
  PREP_CARD_WI = null;
}

function renderPrepCard(){
  if(PREP_CARD_WI===null) return;
  const w = CONFIG.works[PREP_CARD_WI];
  const editable = canEdit('', w['Вид работ']);
  const wc = workColor(w['Вид работ']);
  const g  = String(w['Группа работ']||'').trim();

  let h=`<div class="mo-head"><div class="mo-title">`+
        (wc?`<span class="dot" style="background:${wc}"></span>`:'')+
        `${esc(workLabel(w))}</div>`+
        `<div class="mo-sub">${g?esc(groupLabel(g)):''}</div></div>`;
  h+=`<div class="mo-body">`;

  PREP_PHASES.forEach(ph=>{
    const p = prepPhaseStatus(w, ph.key);
    const ready = parseBool(w[ph.key+' / Готовность'])===true;
    h+=`<div class="pm-ph pp-${p.st}">`;
    h+=`<div class="pm-ph-top"><span class="pm-ph-name">${esc(t(ph.lbl))}</span>${prepBadge(p)}</div>`;
    const dates=[
      p.start ? `${t('startShort')} ${toDmy(p.start)}` : '',
      p.due   ? `${t('readyBy')} ${toDmy(p.due)}`      : '',
      p.dur   ? `${p.dur} ${t('durShort')}`            : ''
    ].filter(Boolean).join(' · ');
    h+=`<div class="pm-dates">${dates?esc(dates):esc(t('prepNone'))}</div>`;
    if(editable){
      h+=`<button class="btn pm-btn${ready?'':' btn-pri'}" onclick="prepToggle(${PREP_CARD_WI},'${ph.key}')">`+
         (ready?esc(t('prepMarkUnready')):'✓ '+esc(t('prepMarkReady')))+`</button>`;
    }
    h+=`</div>`;
  });

  const startWork = normalizeDate(w['Контракт / Дата готовности']);
  if(startWork) h+=`<div class="pm-startline"><b>${esc(t('prepStart'))}:</b> ${esc(startWork)}</div>`;
  if(!editable) h+=`<div class="ro-note">🔒 ${esc(t('readOnly'))}</div>`;

  h+=`</div><div class="mo-foot"><button class="btn" onclick="closePrepCard()">${esc(t('cancel'))}</button></div>`;
  document.getElementById('prepModal').innerHTML=h;
}

// ── Переключение «Готово» из карточки ────────────────────────────
function prepToggle(wi, phase){
  const w = CONFIG.works[wi];
  if(!w || !PREP_PHASES.some(p=>p.key===phase)) return;
  const cur = parseBool(w[phase+' / Готовность'])===true;
  const next = !cur;

  // Оптимистично: обновили локально, нарисовали, отправили; ошибка → откат
  const fld = phase+' / Готовность';
  const old = w[fld];
  w[fld] = next;
  render(); renderPrepCard(); setSt('spin',t('saving'));

  apiFetch({
    action:'prepUpdate',
    work: w['Вид работ'],
    phase: phase,
    ready: next,
    token: localStorage.getItem('shk_token')||'',
    who: OPEN_MODE?(userName||t('anonymous')):''
  }).then(j=>{
    if(j && j.success){ setSt('ok',t('saved')); toast(t('saved'),'ok'); }
    else throw new Error((j&&j.error)||'error');
  }).catch(err=>{
    w[fld] = old; render(); renderPrepCard();
    const m = String(err.message||'');
    const msg = m==='no_access'||m==='read_only' ? t('readOnly')
              : m==='work_denied' ? t('noWorkAccess')
              : m==='section_denied' ? t('noSecAccess')
              : t('errorSave');
    setSt('err',msg); toast(msg,'err',4000);
    if(!['no_access','read_only','work_denied','section_denied'].includes(m)) logError('prepUpdate', m||'network');
  });
}
