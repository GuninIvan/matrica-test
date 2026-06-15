// ═══ cells.js — Ключи записей, разбор дат, HTML ячейки шахматки, применимость работ ═══
// Подключение: см. порядок <script> в index.html (важен!)

// ── KEY / DATA ────────────────────────────────────────────────────
function makeKey(sec,floor,work){ return [String(sec||''),String(floor||''),String(work||'')].join('|||'); }
function getPct(sec,floor,work){ return DATA[makeKey(sec,floor,work)]?.pct||0; }
const EMPTY_CELL={found:false,pct:0,updatedAt:'',startDate:'',planDate:'',factDate:'',dev:null,
                  front:null,rd:null,tender:null,contract:null,predReady:null,vol:null,rate:null,unit:'',crew:null};
function getCell(sec,floor,work){ return DATA[makeKey(sec,floor,work)]||EMPTY_CELL; }

// TRUE/FALSE из таблицы (чекбоксы, ВПР) → true/false; пусто/мусор → null.
// null = «не настроено», нейтрально: не красим, пока колонку не заполнили.
function parseBool(v){
  if(v===true||v===false) return v;
  const s=String(v??'').trim().toLowerCase();
  if(s==='true'||s==='истина'||s==='да') return true;
  if(s==='false'||s==='ложь'||s==='нет') return false;
  return null;
}
// «Ворота» (Фронт открыт / Контракт заключен): формулы в таблице возвращают
// TRUE, FALSE, 0 (VLOOKUP по пустому чекбоксу) или "" (строка-заглушка).
// undefined → колонки нет вовсе (null = не настроено, рисков не рисуем);
// всё прочее: «открыто/заключено» строго при TRUE, иначе false.
function parseGate(v){
  if(v===undefined) return null;
  if(v===''||v===null) return null;
  if(v===0||v==='0') return false;
  return parseBool(v)===true;
}
// «Отставание» из таблицы → число дней или null.
// Принимаем ТОЛЬКО чистое число (целое/дробное со знаком).
// Дата ("2026-06-15"), текст, пустое → null, чтобы не показывать мусор
// вроде "+2026д", если в ячейку случайно попала дата или формула.
function parseDev(v){
  if(v===null||v===undefined) return null;
  const s=String(v).trim().replace(',', '.');
  if(s==='') return null;
  if(!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const n=parseFloat(s);
  return isNaN(n)?null:n;
}
// Готовность фазы подготовки (РД/Тендер/Контракт) из «Списка работ».
// Правило строгое: готово ТОЛЬКО при TRUE/ИСТИНА; пусто, FALSE, мусор,
// «не настроено» — всё считаем НЕ готовым (для рисков «что не истина — ложь»).
function phaseDone(v){ return parseBool(v)===true; }

// ── DATE HELPERS ──────────────────────────────────────────────────
function normalizeDate(s){
  if(!s||s==='') return '';
  if(typeof s==='string'&&/^\d{2}\.\d{2}\.\d{4}/.test(s.trim())) return s.trim().slice(0,10);
  if(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}/.test(s.trim())){
    const[y,m,d]=s.trim().slice(0,10).split('-');
    return `${d}.${m}.${y}`;
  }
  const num=parseFloat(s);
  if(!isNaN(num)&&num>40000&&num<60000){
    const date=new Date(new Date(1899,11,30).getTime()+Math.floor(num)*86400000);
    return String(date.getDate()).padStart(2,'0')+'.'+String(date.getMonth()+1).padStart(2,'0')+'.'+date.getFullYear();
  }
  return '';
}
function parseDate(s){
  if(!s) return null;
  const num = parseFloat(s);
  if(!isNaN(num) && num > 40000 && num < 60000){
    return new Date(new Date(1899,11,30).getTime() + Math.floor(num)*86400000);
  }
  s = String(s).trim();
  if(/^\d{2}\.\d{2}\.\d{4}/.test(s)){const[d,m,y]=s.slice(0,10).split('.');return new Date(+y,+m-1,+d);}
  if(/^\d{4}-\d{2}-\d{2}/.test(s)){const[y,m,d]=s.slice(0,10).split('-');return new Date(+y,+m-1,+d);}
  return null;
}
function fmtShort(s){
  const d=parseDate(s);if(!d)return'';
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');
}
// Отставание в днях (зарезервировано под плановые даты)
function devDays(s){
  const d=parseDate(s);if(!d)return null;
  const today=new Date();today.setHours(0,0,0,0);
  return Math.round((today-d)/(1000*60*60*24));
}
// Старт СМР по работе = «Контракт / Дата готовности» + «Контракт / Готовность за»
// (последнее — буфер в днях, число). Нет даты готовности → null.
function workStartDate(w){
  if(!w) return null;
  const base=parseDate(normalizeDate(w['Контракт / Дата готовности']));
  if(!base) return null;
  const raw=String(w['Контракт / Готовность за']==null?'':w['Контракт / Готовность за']).trim().replace(',','.');
  const days=/^-?\d+(\.\d+)?$/.test(raw)?Math.round(parseFloat(raw)):0;
  const r=new Date(base.getTime());
  r.setDate(r.getDate()+days);   // календарно: устойчиво к переходам на летнее время
  return r;
}

// ── CELL HTML ─────────────────────────────────────────────────────
function cellHtml(sec,floor,work,colspan){
  const d=getCell(sec,floor,work);
  const cs=colspan?` colspan="${colspan}"` :'';
  const isEmpty=d.pct===0;
  const isDone=d.pct===100;
  const bar=cellBarColor(d);
  const tint=d.found?cellTint(d):'';

  const sl=SEC_LBL[CURRENT_LANG]||'с';
  const fl=FL_LBL[CURRENT_LANG]||'э';
  const dy=DAY_LBL[CURRENT_LANG]||'д';

  // Даты (только если запись есть в базе). Подписи словами: «Старт dd.mm» / «Финиш dd.mm»
  const hasFactDate=!!d.factDate&&String(d.factDate).trim()!=='';
  const endStr=fmtShort(hasFactDate?d.factDate:d.planDate);
  const endLabel=(d.found&&SHOW.dend&&endStr)?(t('finishShort')+' '+(hasFactDate?'✓':'')+endStr):'';
  const startStr=fmtShort(d.startDate);
  const startLabel=(d.found&&SHOW.dstart&&startStr)?(t('startShort')+' '+startStr):'';

  // Отставание: и на ненaчатых тоже, если старт просрочен (dev>0)
  let devHtml='';
  if(SHOW.dev && d.found && !isDone && d.dev!==null && d.dev!==0){
    devHtml = d.dev>0
      ? `<div class="c-dev late">+${d.dev}${dy}</div>`
      : `<div class="c-dev ahead">${Math.abs(d.dev)}${dy}</div>`;
  }

  // Режим «к дате»: незавершённые работы, которые должны идти/закончиться
  // к выбранной дате — яркие, с целевым % (→78%); остальные затемняются.
  let dim=false, targetHtml='';
  if(DEADLINE){
    const target=taskTarget(d,DEADLINE);
    if(target!==null) targetHtml=`<div class="c-target">→${target}%</div>`;
    else dim=true;
  }

  // Фронт работ / контракт: только для незавершённых.
  // front===false → 🔒 и штриховка; contract===false → ⚠.
  // null (колонки не заполнены) — нейтрально, ничего не рисуем.
  // Тумблеры SHOW.front / SHOW.contract (панель «Вид») гасят индикаторы.
  const noFront    = SHOW.front    && d.found && !isDone && d.front===false;
  const noRd       = PRIV && SHOW.rd       && d.found && !isDone && d.rd===false;
  const noTender   = PRIV && SHOW.tender   && d.found && !isDone && d.tender===false;
  const noContract = PRIV && SHOW.contract && d.found && !isDone && d.contract===false;
  let flagHtml='';
  if(noFront)    flagHtml+=`<div class="c-flag nofront" title="${esc(t('frontClosed'))}">🔒</div>`;
  if(noRd)       flagHtml+=`<div class="c-flag nord" title="${esc(t('rdNotReady'))}">📐</div>`;
  if(noTender)   flagHtml+=`<div class="c-flag notender" title="${esc(t('tenderNotReady'))}">🧾</div>`;
  if(noContract) flagHtml+=`<div class="c-flag nocontract" title="${esc(t('noContract'))}">✍</div>`;

  // Численность (требуется людей к сроку) — тумблер «Люди» в панели «Вид»
  const crewHtml=(SHOW.crew && d.found && !isDone && d.crew)?`<div class="c-date">👷${d.crew}</div>`:'';

  const trParts=[flagHtml,
                 startLabel?`<div class="c-date">${esc(startLabel)}</div>`:'',
                 endLabel?`<div class="c-date">${esc(endLabel)}</div>`:'',
                 crewHtml, devHtml, targetHtml].join('');
  const trEl = trParts ? `<div class="c-topright">${trParts}</div>` : '';

  const pctTxt = SHOW.pct ? (isEmpty?'—':d.pct+'%') : '';
  const topRow=`<div class="ci-top">
    <div class="c-pct${isEmpty?' empty':''}">${pctTxt}</div>
    ${trEl}
  </div>`;

  // Метки секции/этажа: на ВСЕХ ячейках (если включены в панели «Вид»).
  // Объём (тумблер SHOW.vol) — той же нижней строкой: «150 м³».
  const volTxt=(SHOW.vol && d.found && d.vol)?(d.vol+(d.unit?' '+d.unit:'')):'';
  const showBot = ((SHOW.sec || SHOW.fl) && (String(sec)!==''||String(floor)!=='')) || !!volTxt;
  const botRow=showBot?`<div class="ci-bot">
    ${(SHOW.sec&&String(sec)!=='')?`<div class="c-sec">${sl}${esc(String(sec))}</div>`:'<div></div>'}
    ${volTxt?`<div class="c-vol">${esc(volTxt)}</div>`:''}
    ${(SHOW.fl&&floor!=='')?`<div class="c-fl">${fl}${esc(String(floor))}</div>`:''}
  </div>`:'';

  const barHtml=`<div class="c-bar-track"></div>${bar&&!isEmpty?`<div class="c-bar-fill" style="width:${d.pct}%;background:${bar}"></div>`:''}`;

  // Фоновая подкраска столбца цветом работы (за карточкой)
  const wc=workColor(work);
  const tdStyle=wc?` style="background:${hexA(wc,0.13)}"`:'';

  return `<td class="cell${isDone?' done':''}${dim?' dim':''}" data-sec="${esc(String(sec))}" data-floor="${esc(String(floor))}" data-work="${esc(String(work))}"${cs}${tdStyle}>
    <div class="ci${noFront?' ci-nofront':''}"${tint?` style="background:${tint}"`:''}>${topRow}${botRow}${barHtml}</div>
  </td>`;
}

// ── WORK APPLICABILITY ────────────────────────────────────────────
function isWorkApplicable(work,section,floor){
  const secRule=String(work['Наличие на секции']||'').trim();
  if(secRule&&secRule.toLowerCase()!=='все'){
    if(!secRule.split(',').map(s=>s.trim()).includes(String(section))) return false;
  }
  if(floor===null) return true;
  const floorRule=String(work['Наличие на этаже']||'').trim();
  if(!floorRule||floorRule.toLowerCase()==='все') return true;
  return floorRule.split(',').map(f=>parseInt(f.trim())).filter(f=>!isNaN(f)).includes(floor);
}

