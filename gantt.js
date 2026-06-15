// ═══ gantt.js — Режим «График» (диаграмма Ганта) ═══
// Подключение: см. порядок <script> в index.html (важен!)

// ── ДИАГРАММА ГАНТА ──────────────────────────────────────────────
// Строка-родитель = вид работ (сворачивается), дети = этажи по возрастанию.
// Колбаска: трек = план (старт→финиш), заливка = % выполнения,
// цвет заливки — та же логика отставания, что у ячеек (cellBarColor).
let GANTT_PXD  = parseFloat(localStorage.getItem('shk_gpxd')) || 2.5;  // пикселей в дне
let GANTT_OPEN = new Set();      // развёрнутые виды работ
let GANTT_SCROLLED = false;      // авто-прокрутка к «сегодня» один раз

const G_MONTHS = {
  ru:['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'],
  sr:['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'],
  en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
};
const G_DAY = 86400000;

// Дети работы с учётом фильтров; этажи от наименьшего к наивысшему
function ganttChildren(w){
  const unit=String(w['Единица приемки']||'').trim();
  const out=[];
  if(unit==='Этаж секция'){
    if(!anyFloorsVisible()) return out;
    getSections().forEach(s=>{
      const sec=s['Секция'];
      const a=parseInt(s['Этажи выше 0.000'])||0, b=parseInt(s['Этажи ниже 0.000'])||0;
      const fls=[];
      for(let f=-b;f<=-1;f++) fls.push(f);
      for(let f=1;f<=a;f++)   fls.push(f);
      fls.forEach(f=>{
        if(!floorVisible(f)||!isWorkApplicable(w,sec,f)) return;
        out.push({sec:String(sec),floor:f,label:`${t('sectionPrefix')} ${sec} · ${f} ${t('floorShort')}`});
      });
    });
  } else if(unit==='Секция'){
    if(!secBlockVisible()) return out;
    getSections().forEach(s=>{
      if(isWorkApplicable(w,s['Секция'],null))
        out.push({sec:String(s['Секция']),floor:'',label:`${t('sectionPrefix')} ${s['Секция']}`});
    });
  } else if(unit==='Площадка'){
    if(!siteBlockVisible()) return out;
    out.push({sec:'',floor:'',label:t('onSiteOpt')});
  }
  return out;
}

// Агрегат по детям: интервал = min старт … max план, % = средний.
// Отставание свёрнутой строки — НЕ худший этаж (раньше один отстающий
// этаж красил всю строку), а «средний % против ожидаемого»:
// ожидаемый % = доля прошедшего времени интервала старт→план;
// разница переводится в дни, чтобы работала общая цветовая шкала
// (cellBarColor). Опережающие этажи компенсируют отстающие:
// суммарно в графике → строка зелёная, суммарно отстаёт → красная.
function ganttAgg(w, kids){
  let start=null, plan=null, pctSum=0, n=0;
  kids.forEach(k=>{
    const d=getCell(k.sec,k.floor,w['Вид работ']);
    k.d=d;
    const s=parseDate(d.startDate), p=parseDate(d.planDate);
    if(s&&(!start||s<start)) start=s;
    if(p&&(!plan ||p>plan))  plan=p;
    pctSum+=d.pct; n++;
  });
  const pct=n?Math.round(pctSum/n):0;
  let dev=null;   // null = нет дат/готово → цвет по проценту
  if(start&&plan&&plan>start&&pct<100){
    const today=new Date(); today.setHours(0,0,0,0);
    const total=(plan-start)/G_DAY;
    const expected=Math.max(0,Math.min(100,(today-start)/G_DAY/total*100));
    dev=Math.round((expected-pct)/100*total);   // дни: >0 отстаёт, ≤0 в графике
  }
  return {start, plan, pct, dev, n};
}

function ganttBar(x,wd,d,clkAttrs,isChild){
  const fill = d.pct>0 ? `<div class="g-fill" style="width:${d.pct}%;background:${cellBarColor(d)||'#94a3b8'}"></div>` : '';
  const tint = cellTint(d);
  const pctX = x+wd+6;
  return `<div class="g-bar${clkAttrs?' clk':''}"${clkAttrs||''} style="left:${x}px;width:${Math.max(wd,3)}px;${tint?`background:${tint};`:''}" title="${esc(fmtShort(d.startDate)||'')} → ${esc(fmtShort(d.factDate||d.planDate)||'')} · ${d.pct}%">${fill}</div>`+
         `<span class="g-pct" style="left:${pctX}px">${d.pct}%</span>`;
}

function renderGantt(gw){
  // Порядок: поэтажные → на секцию → на площадку; внутри — по группам работ
  const UNIT_ORDER=[['Этаж секция',t('byFloorWorks')],['Секция',t('workOnSec')],['Площадка',t('workOnSite')]];
  const all = CONFIG.works.filter(w=>inGroup(w)&&workSelected(w));
  const items=[];   // {type:'unit'|'group'|'work', ...}
  UNIT_ORDER.forEach(([unit,ulabel])=>{
    const uworks=all.filter(w=>String(w['Единица приемки']||'').trim()===unit);
    const urows=[];
    // группы в порядке появления в «Списке работ»
    const gorder=[];
    uworks.forEach(w=>{ const g=String(w['Группа работ']||'').trim(); if(!gorder.includes(g)) gorder.push(g); });
    gorder.forEach(g=>{
      const grows=[];
      uworks.filter(w=>String(w['Группа работ']||'').trim()===g).forEach(w=>{
        const kids=ganttChildren(w);
        if(kids.length) grows.push({type:'work', w, kids, agg:ganttAgg(w,kids)});
      });
      if(grows.length){
        if(g) urows.push({type:'group', label:groupLabel(g)});
        urows.push(...grows);
      }
    });
    if(urows.length){ items.push({type:'unit', label:ulabel}); items.push(...urows); }
  });
  const rows=items.filter(i=>i.type==='work');

  // Диапазон шкалы
  let min=null,max=null;
  rows.forEach(r=>{
    if(r.agg.start&&(!min||r.agg.start<min)) min=r.agg.start;
    if(r.agg.plan &&(!max||r.agg.plan >max)) max=r.agg.plan;
  });
  const today=new Date(); today.setHours(0,0,0,0);
  if(!min) min=new Date(today.getTime()-30*G_DAY);
  if(!max) max=new Date(today.getTime()+60*G_DAY);
  if(today<min) min=today;                                 // линия «сегодня» всегда на шкале
  if(today>max) max=new Date(today.getTime()+15*G_DAY);
  min=new Date(min.getFullYear(),min.getMonth(),1);                       // от начала месяца
  max=new Date(max.getFullYear(),max.getMonth()+1,15);                    // запас справа
  const pxd=GANTT_PXD;
  const X=d=>Math.round((d-min)/G_DAY*pxd);
  const totalW=X(max);

  // Шапка месяцев + сетка
  let months='', grid='';
  const mn=G_MONTHS[CURRENT_LANG]||G_MONTHS.ru;
  for(let d=new Date(min); d<max; d=new Date(d.getFullYear(),d.getMonth()+1,1)){
    const next=new Date(d.getFullYear(),d.getMonth()+1,1);
    const wpx=X(next>max?max:next)-X(d);
    months+=`<div class="g-m" style="width:${wpx}px">${wpx>26?`${mn[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`:''}</div>`;
    grid+=`<div class="g-gl" style="left:${X(d)}px"></div>`;
  }
  if(today>=min&&today<=max) grid+=`<div class="g-today" style="left:${X(today)}px"></div>`;

  let body='';
  items.forEach(it=>{
    if(it.type==='unit'){
      body+=`<div class="g-row uhdr"><div class="g-side">${esc(it.label)}</div><div class="g-lane" style="width:${totalW}px"></div></div>`;
      return;
    }
    if(it.type==='group'){
      body+=`<div class="g-row ghdr"><div class="g-side">${esc(it.label)}</div><div class="g-lane" style="width:${totalW}px"></div></div>`;
      return;
    }
    const r=it;
    const open=GANTT_OPEN.has(r.w['Вид работ']);
    const single=r.kids.length===1;
    const wc=workColor(r.w['Вид работ']);
    const dot=wc?`<span class="g-wdot" style="background:${wc}"></span>`:'';
    // одиночные (площадка, одна секция) — сразу кликабельная колбаска без разворота
    const k0=single?r.kids[0]:null;
    const clk=single?` data-sec="${esc(k0.sec)}" data-floor="${esc(String(k0.floor))}" data-work="${esc(r.w['Вид работ'])}"`:'';
    let lane='';
    if(r.agg.start&&r.agg.plan){
      lane=ganttBar(X(r.agg.start),X(r.agg.plan)-X(r.agg.start),
        single?k0.d:{pct:r.agg.pct,dev:r.agg.dev,startDate:'',planDate:'',factDate:''},clk,false);
    } else lane=`<span class="g-nodata" style="left:6px">${t('noDates')}</span>`;
    body+=`<div class="g-row parent">
      <div class="g-side"${single?'':` data-toggle="${esc(r.w['Вид работ'])}"`}>
        <span class="g-caret">${single?'':(open?'▾':'▸')}</span>${dot}
        <span class="g-sname" title="${esc(workLabel(r.w))}">${esc(workLabel(r.w))}</span>
        ${single?'':`<span class="g-cnt">${r.kids.length}</span>`}
      </div>
      <div class="g-lane" style="width:${totalW}px">${lane}</div>
    </div>`;
    if(open&&!single){
      r.kids.forEach(k=>{
        const d=k.d, s=parseDate(d.startDate), p=parseDate(d.factDate)||parseDate(d.planDate);
        let lane2='';
        if(s&&p&&p>s) lane2=ganttBar(X(s),X(p)-X(s),d,
          ` data-sec="${esc(k.sec)}" data-floor="${esc(String(k.floor))}" data-work="${esc(r.w['Вид работ'])}"`,true);
        else lane2=`<span class="g-nodata" style="left:6px">${t('noDates')}</span>`;
        body+=`<div class="g-row child">
          <div class="g-side">${esc(k.label)}</div>
          <div class="g-lane" style="width:${totalW}px">${lane2}</div>
        </div>`;
      });
    }
  });

  gw.innerHTML=`
    <div class="g-ctrl">${t('scaleLbl')} <input type="range" min="1" max="14" step="0.5" value="${pxd}" id="gZoom"></div>
    <div class="g-hdr"><div class="g-hside"></div><div class="g-months" style="width:${totalW}px">${months}</div></div>
    <div class="g-body">
      <div class="g-gridlayer" style="width:${totalW}px">${grid}</div>
      ${body}
    </div>`;

  document.getElementById('gZoom').oninput=e=>{
    GANTT_PXD=parseFloat(e.target.value);
    localStorage.setItem('shk_gpxd',GANTT_PXD);
    renderGantt(gw);
  };
  gw.onclick=e=>{
    const tg=e.target.closest('[data-toggle]');
    if(tg){
      const n=tg.dataset.toggle;
      GANTT_OPEN.has(n)?GANTT_OPEN.delete(n):GANTT_OPEN.add(n);
      renderGantt(gw); return;
    }
    const bar=e.target.closest('.g-bar.clk');
    if(bar) openModal(bar.dataset.sec, bar.dataset.floor, bar.dataset.work);
  };

  // авто-прокрутка к «сегодня» при первом входе в режим
  if(!GANTT_SCROLLED){
    GANTT_SCROLLED=true;
    const sc=gw.closest('.wrap')||gw.parentElement;
    if(sc) sc.scrollLeft=Math.max(0, X(today)-Math.round(sc.clientWidth*0.35));
  }
}

