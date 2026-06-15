// ═══ tasks.js — Режим «Задания» (сменно-суточные) + taskTarget (математика «к дате») ═══
// Подключение: см. порядок <script> в index.html (важен!)

// ── СМЕННО-СУТОЧНЫЕ ЗАДАНИЯ ──────────────────────────────────────
// Та же выборка, что подсветка «К дате»: работы, которые к дате должны
// идти или закончиться. Цель — пропорция по дням ВКЛЮЧАЯ последний день.
// null = работа не релевантна к дате (не начата по плану или уже 100%).
function taskTarget(d, DL){
  const sd=parseDate(d.startDate), ed=parseDate(d.planDate);
  // выполненные (100%) в задания не попадают никогда
  if(!d.found || Number(d.pct)>=100 || !sd || sd>DL) return null;
  let target=100;
  if(ed && ed>sd){
    const total=Math.round((ed-sd)/G_DAY)+1;        // дней всего, включительно
    const done =Math.floor((DL-sd)/G_DAY)+1;        // дней к дате, включительно
    if(done<total) target=Math.max(0,Math.min(99,Math.round(done/total*100)));
  }
  return target;
}

let TASK_GROUP = localStorage.getItem('shk_tgrp') || 'floor';   // floor | work | group

function renderTasks(tw){
  const DL = DEADLINE || (()=>{const d=new Date();d.setHours(23,59,59,0);return d;})();
  const UNIT_ORDER=['Этаж секция','Секция','Площадка'];

  // Собираем задания (фильтры интерфейса действуют через ganttChildren)
  const items=[];
  UNIT_ORDER.forEach(unit=>{
    CONFIG.works.filter(w=>String(w['Единица приемки']||'').trim()===unit&&inGroup(w)&&workSelected(w)).forEach(w=>{
      ganttChildren(w).forEach(k=>{
        const d=getCell(k.sec,k.floor,w['Вид работ']);
        if(d.pct>=100) return;                       // выполненные не выводим
        const target=taskTarget(d,DL);
        if(target===null) return;
        items.push({w,unit,sec:k.sec,floor:k.floor,label:k.label,d,target,gap:target-d.pct});
      });
    });
  });

  // Группировка
  const groups=[];   // {key,label,items}
  const put=(key,label,it)=>{
    let g=groups.find(x=>x.key===key);
    if(!g){ g={key,label,items:[]}; groups.push(g); }
    g.items.push(it);
  };
  if(TASK_GROUP==='floor'){
    // этажи по возрастанию, затем «На секцию», затем «Площадка»
    items.filter(i=>i.unit==='Этаж секция').sort((a,b)=>a.floor-b.floor)
      .forEach(i=>put('f'+i.floor, `${i.floor} ${t('floorShort')}`, i));
    items.filter(i=>i.unit==='Секция').forEach(i=>put('__sec__',t('onSecOpt'),i));
    items.filter(i=>i.unit==='Площадка').forEach(i=>put('__site__',t('onSiteOpt'),i));
  } else if(TASK_GROUP==='work'){
    items.forEach(i=>put('w'+i.w['Вид работ'], workLabel(i.w), i));
  } else {
    items.forEach(i=>{
      const g=String(i.w['Группа работ']||'').trim();
      put('g'+g, g?groupLabel(g):'—', i);
    });
  }
  // внутри группы: самые горящие сверху
  groups.forEach(g=>g.items.sort((a,b)=>b.gap-a.gap));

  // Переключатель группировки
  const gchip=(v,lbl)=>`<span class="chip${TASK_GROUP===v?' on':''}" data-tgrp="${v}">${lbl}</span>`;
  let h=`<div class="tk-head">
    <span class="tk-date">${t('tasksFor')} ${('0'+DL.getDate()).slice(-2)}.${('0'+(DL.getMonth()+1)).slice(-2)}.${DL.getFullYear()}</span>
    <span class="tk-grp">${gchip('floor',t('gByFloor'))}${gchip('work',t('gByWork'))}${gchip('group',t('gByGroup'))}</span>
  </div>`;

  // Риски («Фронт закрыт», «Контракт не заключён») теперь в общей
  // сворачиваемой панели над всеми вкладками — см. render.js.

  // Единая сетка колонок для ВСЕХ таблиц групп: иначе каждая таблица
  // считает ширины сама и колонки «едут» друг относительно друга.
  // Название работы — резиновое (переносится), остальные — фиксированные.
  const colg=`<colgroup><col><col style="width:21%"><col style="width:128px">`+
             `<col style="width:64px"><col style="width:64px"><col style="width:104px"></colgroup>`;

  if(!items.length){
    h+=`<div class="sum-card" style="padding:18px;font-size:12px;color:var(--ink3);">${t('noTasks')}</div>`;
  } else groups.forEach(g=>{
    h+=`<div class="tk-sec"><div class="tk-sec-h">${esc(g.label)} <span class="n">· ${g.items.length}</span></div><table class="tk-tbl">${colg}<thead><tr>`+
       `<th>${esc(t('colWork'))}</th><th>${esc(t('colPlace'))}</th><th>${esc(t('colDates'))}</th>`+
       `<th class="tk-num">${esc(t('colFact'))}</th><th class="tk-num">${esc(t('colTarget'))}</th><th class="tk-num">${esc(t('colStatus'))}</th>`+
       `</tr></thead><tbody>`;
    g.items.forEach(i=>{
      const wc=workColor(i.w['Вид работ']);
      const dot=wc?`<span class="tk-wdot" style="background:${wc}"></span>`:'';
      // Статус: дни отставания из колонки «Отставание» Google-таблицы
      // (d.dev). Отстаём → красное «+N д», иначе зелёное «в графике».
      const dy=DAY_LBL[CURRENT_LANG]||'д';
      const gapTd=(i.d.dev!==null && i.d.dev>0)
        ?`<td class="tk-num tk-gap-bad">+${i.d.dev}${dy}</td>`
        :`<td class="tk-num tk-gap-ok">✓ ${t('onTrack')}</td>`;
      h+=`<tr class="clk" data-sec="${esc(i.sec)}" data-floor="${esc(String(i.floor))}" data-work="${esc(i.w['Вид работ'])}">
        <td>${dot}${esc(workLabel(i.w))}</td>
        <td class="tk-place">${i.d.front===false?'🔒 ':''}${esc(i.label)}</td>
        <td class="tk-dates">${esc(fmtShort(i.d.startDate)||'')} → ${esc(fmtShort(i.d.planDate)||'')}</td>
        <td class="tk-num">${i.d.pct}%</td>
        <td class="tk-num" style="color:var(--acc);font-weight:700;">→${i.target}%</td>
        ${gapTd}
      </tr>`;
    });
    h+='</tbody></table></div>';
  });

  tw.innerHTML=h;
  tw.onclick=e=>{
    const c=e.target.closest('[data-tgrp]');
    if(c){ TASK_GROUP=c.dataset.tgrp; localStorage.setItem('shk_tgrp',TASK_GROUP); renderTasks(tw); return; }
    const r=e.target.closest('tr.clk');
    if(r) openModal(r.dataset.sec, r.dataset.floor, r.dataset.work);
  };
}

