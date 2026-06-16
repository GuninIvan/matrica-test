// ═══ summary.js — Режим «Сводка»: разбор листа и вычисляемый fallback ═══
// Подключение: см. порядок <script> в index.html (важен!)

// ── Сводка: лист «Сводка» из Google как есть ─────────────────────
// ── Сводка ────────────────────────────────────────────────────────
// Лист «Сводка» может содержать несколько таблиц (по группам, по видам
// работ), разделённых пустыми строками. Каждая рисуется карточкой.
// Если листа нет или он пуст — сводка считается из данных шахматки.
// Процент в сводке: просто число, без прогресс-бара.
// gray=true — плановый процент, приглушённый.
function sumBar(pct,gray){
  return `<span class="sum-pct${gray?' plan':''}">${pct}%</span>`;
}
// Числовое значение процента: понимает и «15 %», и долю 0–1 (0.0671 → 7)
function sumPctVal(raw){
  const v=String(raw==null?'':raw).trim();
  if(v==='') return null;
  const n=parseFloat(v.replace(',','.').replace('%','').trim());
  if(isNaN(n)) return null;
  // без знака % и в диапазоне 0..1 — это доля (0.6257 → 63%, 1 → 100%)
  if(!v.includes('%') && Math.abs(n)<=1) return Math.round(n*100);
  return Math.round(n);
}
// Сборка <td> с подписью для мобильной карточки (data-label) и классами.
function sumTd(inner,cls,style,label){
  const c=cls&&cls.length?` class="${cls.join(' ')}"`:'';
  const s=style?` style="${style}"`:'';
  const dl=label!=null&&label!==''?` data-label="${esc(label)}"`:' data-label=""';
  return `<td${c}${s}${dl}>${inner}</td>`;
}
// Перевод заголовка столбца Сводки: распознаём тип колонки и отдаём t().
// Неизвестный заголовок оставляем как в данных листа.
function sumHeadLabel(raw){
  const s=String(raw==null?'':raw).trim(), l=s.toLowerCase();
  if(!l) return s;
  if(/групп|grup|group/.test(l))           return t('sumColGroup');
  if(/вид работ|vrsta|work type/.test(l))  return t('sumColWork');
  const isPct=/процент|procen|percent|%/.test(l);
  if(isPct && /план|plan/.test(l))         return t('sumColPctPlan');
  if(isPct)                                 return t('sumColPctFact');
  if(/отстав|kašnj|kasnj|lag/.test(l))     return t('sumColLag');
  return s;
}
// Перевод значения-названия (вид работ / группа) под текущий язык.
// Лист «Сводка» хранит русские имена; для отображения подменяем их на
// перевод из «Списка работ» (workLabel/groupLabel, колонки SR/EN).
// Сравнение и ключи остаются на русском — переводится только видимый текст.
function sumNameLabel(head,raw){
  const v=String(raw==null?'':raw).trim();
  if(v==='') return v;
  if(/вид работ|vrsta|work type/i.test(head)){
    const w=CONFIG.works.find(x=>String(x['Вид работ']||'').trim()===v);
    return w?workLabel(w):v;
  }
  if(/групп|grup|group/i.test(head)) return groupLabel(v);
  return v;
}
// isName=true помечает ячейку-название (вид работ/группа) — на мобиле она
// становится заголовком карточки (см. styles.css, @media ≤720px).
function sumCellHtml(head,val,prevVal,label,isName){
  const v=String(val==null?'':val).trim();
  const cls=[]; if(isName) cls.push('sum-name');
  if(/процент|procenat|percent|%/i.test(head)){
    const n=sumPctVal(v);
    if(n!==null) return sumTd(sumBar(n,/план|plan/i.test(head)),cls,'',label);
  }
  if(/отстав|kašnj|kasnj|lag/i.test(head)){
    const n=parseFloat(v.replace(',','.'));
    if(!isNaN(n)){
      cls.push('num');
      if(n>0)      return sumTd('+'+esc(v),cls,'color:#dc2626;font-weight:700;',label);
      if(n<0)      return sumTd(esc(v),cls,'color:#16a34a;font-weight:700;',label);
      return sumTd('—',cls,'color:var(--ink3);',label);
    }
  }
  // текст-название (вид работ/группа) — показываем в переводе текущего языка
  const disp=sumNameLabel(head,v);
  // повторяющееся значение группирующей колонки — приглушаем
  // (сравниваем по сырому русскому значению, чтобы группировка не ломалась)
  if(/групп|grup|group/i.test(head) && v!=='' && v===String(prevVal==null?'':prevVal).trim()){
    return sumTd(esc(disp),cls,'color:var(--ink3);font-size:10px;',label);
  }
  if(/^-?\d+([.,]\d+)?$/.test(v)){ cls.push('num'); return sumTd(esc(v),cls,'',label); }
  return sumTd(esc(disp),cls,'',label);
}
// Сетка листа → список таблиц: режем по пустым строкам И по пустым колонкам
// (на листе таблицы могут стоять рядом по горизонтали)
function splitSummaryGrid(grid){
  const vblocks=[]; let cur=[];
  grid.forEach(row=>{
    if(row.some(c=>String(c).trim()!=='')) cur.push(row);
    else if(cur.length){ vblocks.push(cur); cur=[]; }
  });
  if(cur.length) vblocks.push(cur);
  const tables=[];
  vblocks.forEach(b=>{
    const W=Math.max(...b.map(r=>r.length));
    const colHas=[];
    for(let c=0;c<W;c++) colHas[c]=b.some(r=>String(r[c]||'').trim()!=='');
    let start=null;
    for(let c=0;c<=W;c++){
      if(c<W && colHas[c]){ if(start===null) start=c; continue; }
      if(start!==null){
        const rows=b.map(r=>r.slice(start,c)).filter(r=>r.some(x=>String(x||'').trim()!==''));
        if(rows.length) tables.push(rows);
        start=null;
      }
    }
  });
  return tables;
}
// Проблемы по работам для колонки «Комментарий» сводки:
// 🔒×N — N незавершённых ячеек с закрытым фронтом; ✍ — контракт не заключён.
// Считается по DATA (ключ: секция|||этаж|||работа).
function summaryIssues(){
  const byWork=new Map();   // имя работы → счётчики незавершённых ячеек по признакам
  Object.keys(DATA).forEach(k=>{
    const name=k.split('|||')[2]; if(!name) return;
    const d=DATA[k];
    let e=byWork.get(name); if(!e){ e={lock:0,rd:0,tender:0,contract:0}; byWork.set(name,e); }
    if(d.pct>=100) return;
    if(d.front===false)    e.lock++;
    if(d.rd===false)       e.rd++;
    if(d.tender===false)   e.tender++;
    if(d.contract===false) e.contract++;
  });
  const byGroup=new Map();  // группа → суммы по входящим работам
  CONFIG.works.forEach(w=>{
    const e=byWork.get(w['Вид работ']); if(!e) return;
    const g=String(w['Группа работ']||'').trim()||'—';
    let ge=byGroup.get(g); if(!ge){ ge={lock:0,rd:0,tender:0,contract:0}; byGroup.set(g,ge); }
    ge.lock+=e.lock; ge.rd+=e.rd; ge.tender+=e.tender; ge.contract+=e.contract;
  });
  return {byWork, byGroup};
}
function issueText(e){
  if(!e) return '';
  const parts=[];
  if(e.lock)     parts.push(`🔒×${e.lock}`);
  if(e.rd)       parts.push(`📐×${e.rd}`);
  if(e.tender)   parts.push(`🧾×${e.tender}`);
  if(e.contract) parts.push(`✍×${e.contract}`);
  return parts.join(' · ');
}

function renderSummary(sw,empty){
  const issues=summaryIssues();
  let html='';
  if(SUMMARY.length){
    splitSummaryGrid(SUMMARY).forEach(b=>{
      let dataTitle='';
      if(b.length>1 && b[0].filter(c=>String(c).trim()!=='').length===1){
        dataTitle=b[0].find(c=>String(c).trim()!==''); b=b.slice(1);
      }
      if(!b.length) return;
      const head=b[0];
      const hs=head.map(x=>String(x).toLowerCase());
      const workCol = hs.findIndex(x=>/вид работ|vrsta|work type/.test(x));
      const groupCol= hs.findIndex(x=>/групп|grup|group/.test(x));
      const nameCol = workCol>-1?workCol:groupCol;
      // Заголовок: переводим по составу колонок; литеральный заголовок
      // листа (часто на одном языке) используем только если колонки не опознаны.
      const title = workCol>-1 ? t('sumByWork')
                  : groupCol>-1 ? t('sumByGroup')
                  : dataTitle;
      // Единая сетка: имена — резиновые, числа — фиксированные,
      // комментарий — фиксированный. Числовые колонки двух таблиц
      // встают друг под другом, ничего не «едет».
      const isNum=x=>/процент|отстав|percent|lag|kašnj|procen/.test(x);
      let colg='<colgroup>'+hs.map(x=>isNum(x)?'<col class="c-num">':'<col class="c-name">').join('')+'<col class="c-cmt"></colgroup>';
      html+=`<div class="sum-card">${title?`<div class="sum-title">${esc(title)}</div>`:''}<table class="sum-tbl">${colg}<thead><tr>`;
      head.forEach(hd=>{ html+=`<th>${esc(sumHeadLabel(hd))}</th>`; });
      html+=`<th>${esc(t('colIssues'))}</th>`;
      html+='</tr></thead><tbody>';
      b.slice(1).forEach((r,ri)=>{
        const prev=ri>0?b[ri]:null;   // b[ri] = предыдущая строка данных (b сдвинут на header)
        // Комментарий: по виду работ — точные проблемы; по группе — агрегат
        let issue='';
        if(workCol>-1)       issue=issueText(issues.byWork.get(String(r[workCol]||'').trim()));
        else if(groupCol>-1) issue=issueText(issues.byGroup.get(String(r[groupCol]||'').trim()));
        html+='<tr>'+head.map((hd,i)=>sumCellHtml(hd,r[i],prev?prev[i]:null,sumHeadLabel(hd),i===nameCol)).join('')
             +`<td class="sum-issue" data-label="${esc(t('colIssues'))}">${issue}</td>`+'</tr>';
      });
      html+='</tbody></table></div>';
    });
  } else {
    html=computedSummaryHtml();   // лист пуст — считаем сами
  }
  sw.innerHTML=html;
}

// Сводка из данных шахматки: по группам работ и по видам работ
function allCellsOf(w){
  // все применимые ячейки работы БЕЗ учёта фильтров интерфейса
  const unit=String(w['Единица приемки']||'').trim(), out=[];
  if(unit==='Этаж секция'){
    CONFIG.sections.forEach(s=>{
      const sec=s['Секция'], a=parseInt(s['Этажи выше 0.000'])||0, b=parseInt(s['Этажи ниже 0.000'])||0;
      for(let f=-b;f<=-1;f++) if(isWorkApplicable(w,sec,f)) out.push(getCell(sec,f,w['Вид работ']));
      for(let f=1;f<=a;f++)   if(isWorkApplicable(w,sec,f)) out.push(getCell(sec,f,w['Вид работ']));
    });
  } else if(unit==='Секция'){
    CONFIG.sections.forEach(s=>{ if(isWorkApplicable(w,s['Секция'],null)) out.push(getCell(s['Секция'],'',w['Вид работ'])); });
  } else if(unit==='Площадка'){
    out.push(getCell('','',w['Вид работ']));
  }
  return out;
}
function sumAggRow(label, cells){
  const total=cells.length;
  const done=cells.filter(c=>c.pct===100).length;
  const prog=cells.filter(c=>c.pct>0&&c.pct<100).length;
  const avg=total?Math.round(cells.reduce((a,c)=>a+c.pct,0)/total):0;
  const dev=cells.reduce((m,c)=>c.dev!==null&&c.dev>m?c.dev:m,0);
  return `<tr><td class="sum-name" data-label="">${esc(label)}</td>`+
    `<td class="num" data-label="${esc(t('total'))}">${total}</td>`+
    `<td class="num" data-label="${esc(t('done'))}">${done}</td>`+
    `<td class="num" data-label="${esc(t('inProg'))}">${prog}</td>`+
    `<td data-label="${esc(t('avgPct'))}">${sumBar(avg)}</td>`+
    `<td class="num" data-label="${esc(t('maxDev'))}"${dev>0?' style="color:#dc2626;font-weight:700;"':''}>${dev>0?'+'+dev+DAY_LBL[CURRENT_LANG]:'—'}</td></tr>`;
}
function computedSummaryHtml(){
  const headRow=`<thead><tr><th></th><th>${t('total')}</th><th>${t('done')}</th><th>${t('inProg')}</th><th>${t('avgPct')}</th><th>${t('maxDev')}</th></tr></thead>`;
  // по группам
  const gorder=[];
  CONFIG.works.forEach(w=>{ const g=String(w['Группа работ']||'').trim(); if(g&&!gorder.includes(g)) gorder.push(g); });
  let h=`<div class="sum-card"><div class="sum-title">${t('sumByGroup')}</div><table class="sum-tbl">${headRow}<tbody>`;
  gorder.forEach(g=>{
    const cells=[];
    CONFIG.works.filter(w=>String(w['Группа работ']||'').trim()===g).forEach(w=>cells.push(...allCellsOf(w)));
    if(cells.length) h+=sumAggRow(groupLabel(g),cells);
  });
  h+='</tbody></table></div>';
  // по видам работ (в порядке: поэтажные → на секцию → на площадку)
  h+=`<div class="sum-card"><div class="sum-title">${t('sumByWork')}</div><table class="sum-tbl">${headRow}<tbody>`;
  ['Этаж секция','Секция','Площадка'].forEach(unit=>{
    CONFIG.works.filter(w=>String(w['Единица приемки']||'').trim()===unit).forEach(w=>{
      const cells=allCellsOf(w);
      if(cells.length) h+=sumAggRow(workLabel(w),cells);
    });
  });
  h+='</tbody></table></div>';
  return h;
}

