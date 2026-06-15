// ═══ tables.js — Табличные режимы «По секции» и «По виду работ» ═══
// Подключение: см. порядок <script> в index.html (важен!)

function getSections(){ return CONFIG.sections.filter(s=>FILTER_SEC.size===0||FILTER_SEC.has(String(s['Секция']))); }

function worksFloorFiltered(){
  if(!anyFloorsVisible()) return [];
  return CONFIG.works.filter(w=>w['Единица приемки']==='Этаж секция'&&inGroup(w)&&workSelected(w));
}
function worksSecFiltered(){
  if(!secBlockVisible()) return [];
  return CONFIG.works.filter(w=>w['Единица приемки']==='Секция'&&inGroup(w)&&workSelected(w));
}
function worksSiteFiltered(){
  if(!siteBlockVisible()) return [];
  return CONFIG.works.filter(w=>w['Единица приемки']==='Площадка'&&inGroup(w)&&workSelected(w));
}

function secColCount(s){
  return Math.max(worksFloorFiltered().filter(w=>isWorkApplicable(w,s['Секция'],null)).length,1);
}

function renderBySection(board){
  const sections=getSections();
  const wf=worksFloorFiltered();
  const ws=worksSecFiltered();
  const wsite=worksSiteFiltered();

  let h='<thead><tr>';
  h+=`<th class="corner" rowspan="2"><div class="corner-lbl">${t('floorShort')}</div></th>`;
  sections.forEach((s,si)=>{
    h+=`<th class="h-section" colspan="${secColCount(s)}">${t('sectionPrefix')} ${s['Секция']}</th>`;
    if(si<sections.length-1) h+=`<th class="h-gap" rowspan="2"></th>`;
  });
  h+='</tr><tr>';
  sections.forEach(s=>{
    const aw=wf.filter(w=>isWorkApplicable(w,s['Секция'],null));
    if(!aw.length) h+='<th class="h-work">—</th>';
    else aw.forEach(w=>{h+=thWork(w);});
  });
  h+='</tr></thead><tbody>';

  const abv={},blw={},allA=new Set(),allB=new Set();
  sections.forEach(s=>{
    const a=parseInt(s['Этажи выше 0.000'])||0, b=parseInt(s['Этажи ниже 0.000'])||0;
    abv[s['Секция']]=a; blw[s['Секция']]=b;
    for(let f=a;f>=1;f--) allA.add(f);
    for(let f=1;f<=b;f++) allB.add(f);
  });
  const hasFloor=(s,f)=>f>0?f<=abv[s['Секция']]:Math.abs(f)<=blw[s['Секция']];
  const totCols=sections.reduce((a,s,si)=>a+secColCount(s)+(si<sections.length-1?1:0),0)+1;
  const grpRow=lbl=>`<tr><td class="rh group-hdr" colspan="${totCols}">${lbl}</td></tr>`;

  // Строка этажа; null — если этаж пуст (ни одной применимой работы) и его надо скрыть
  function floorRowHtml(fl){
    if(!floorVisible(fl)) return null;
    const any = sections.some(s=>hasFloor(s,fl)&&wf.some(w=>isWorkApplicable(w,s['Секция'],fl)));
    if(!any) return null;   // пустой этаж скрываем
    let r=`<tr><td class="rh"><div class="rh-inner"><div class="rh-num">${fl}</div><div class="rh-lbl">${t('floorShort')}</div></div></td>`;
    sections.forEach((s,si)=>{
      wf.filter(w=>isWorkApplicable(w,s['Секция'],null)).forEach(w=>{
        r+=!hasFloor(s,fl)||!isWorkApplicable(w,s['Секция'],fl)
          ?'<td class="cell na"></td>'
          :cellHtml(s['Секция'],fl,w['Вид работ']);
      });
      if(si<sections.length-1) r+='<td class="gap-col"></td>';
    });
    return r+'</tr>';
  }

  if(wf.length){
    const rowsA=[...allA].sort((a,b)=>b-a).map(floorRowHtml).filter(Boolean);
    if(rowsA.length) h+=grpRow(t('worksAbove'))+rowsA.join('');
    const rowsB=[...allB].sort((a,b)=>a-b).map(fl=>floorRowHtml(-fl)).filter(Boolean);
    if(rowsB.length) h+=grpRow(t('worksBelow'))+rowsB.join('');
  }

  if(ws.length){
    h+=grpRow(t('workOnSec'));
    ws.forEach(w=>{
      h+=`<tr><td class="rh" style="padding:3px 4px;"><div class="rh-work" title="${esc(workLabel(w))}">${esc(workLabel(w))}</div></td>`;
      sections.forEach((s,si)=>{
        const cols=secColCount(s);
        h+=isWorkApplicable(w,s['Секция'],null)
          ?cellHtml(s['Секция'],'',w['Вид работ'],cols>1?cols:undefined)
          :`<td class="cell na" colspan="${cols}"></td>`;
        if(si<sections.length-1) h+='<td class="gap-col"></td>';
      });
      h+='</tr>';
    });
  }

  // Работы на площадку: одна ячейка на всю ширину (площадка общая, не по секциям)
  if(wsite.length){
    h+=grpRow(t('workOnSite'));
    wsite.forEach(w=>{
      h+=`<tr><td class="rh" style="padding:3px 4px;"><div class="rh-work" title="${esc(workLabel(w))}">${esc(workLabel(w))}</div></td>`;
      h+=cellHtml('','',w['Вид работ'],totCols-1);
      h+='</tr>';
    });
  }

  h+='</tbody>';
  board.innerHTML=h;
}

function renderByWork(board){
  const sections=getSections();
  const colsF   = worksFloorFiltered();
  const colsS   = worksSecFiltered();
  const colsSite= worksSiteFiltered();
  const sub = document.getElementById('subBoards');

  // ── Главная таблица: только поэтажные работы ──
  if(colsF.length){
    board.style.display='table';
    let h=`<thead><tr><th class="corner" rowspan="2"><div class="corner-lbl">${t('floorShort')}</div></th>`;
    h+=`<th class="h-section" colspan="${colsF.length}">${t('byFloorWorks')}</th></tr><tr>`;
    colsF.forEach(w=>{h+=thWork(w);});
    h+='</tr></thead><tbody>';

    sections.forEach(s=>{
      const sec=s['Секция'];
      const above=parseInt(s['Этажи выше 0.000'])||0, below=parseInt(s['Этажи ниже 0.000'])||0;
      const rows=[];
      function floorRow(fl){
        if(!floorVisible(fl)) return;
        if(!colsF.some(w=>isWorkApplicable(w,sec,fl))) return;   // пустой этаж скрываем
        let r=`<tr><td class="rh"><div class="rh-inner"><div class="rh-num">${fl}</div><div class="rh-lbl">${t('floorShort')}</div></div></td>`;
        colsF.forEach(w=>{ r+=!isWorkApplicable(w,sec,fl)?'<td class="cell na"></td>':cellHtml(sec,fl,w['Вид работ']); });
        rows.push(r+'</tr>');
      }
      for(let fl=above;fl>=1;fl--)   floorRow(fl);
      for(let fl=-1;fl>=-below;fl--) floorRow(fl);
      if(rows.length){
        h+=`<tr><td class="rh group-hdr" colspan="${colsF.length+1}">${t('sectionPrefix')} ${sec}</td></tr>`+rows.join('');
      }
    });
    board.innerHTML=h+'</tbody>';
  } else {
    board.style.display='none';
    board.innerHTML='';
  }

  // ── Под-таблицы: работы на секцию и на площадку ──
  let sh='';
  if(colsS.length){
    sh+=`<table class="sub-board"><thead><tr><th class="corner2">${t('workOnSec')}</th>`;
    colsS.forEach(w=>{sh+=thWork(w);});
    sh+='</tr></thead><tbody>';
    sections.forEach(s=>{
      const sec=s['Секция'];
      if(!colsS.some(w=>isWorkApplicable(w,sec,null))) return;
      sh+=`<tr><td class="rh">${t('sectionPrefix')} ${esc(String(sec))}</td>`;
      colsS.forEach(w=>{ sh+=isWorkApplicable(w,sec,null)?cellHtml(sec,'',w['Вид работ']):'<td class="cell na"></td>'; });
      sh+='</tr>';
    });
    sh+='</tbody></table>';
  }
  if(colsSite.length){
    sh+=`<table class="sub-board"><thead><tr><th class="corner2">${t('workOnSite')}</th>`;
    colsSite.forEach(w=>{sh+=thWork(w);});
    sh+='</tr></thead><tbody>';
    sh+=`<tr><td class="rh">${esc(t('onSiteOpt'))}</td>`;
    colsSite.forEach(w=>{ sh+=cellHtml('','',w['Вид работ']); });
    sh+='</tr></tbody></table>';
  }
  sub.innerHTML=sh;
}


// Статусбар-счётчик удалён по требованию: внизу осталась только подсказка.

