'use strict';
const $ = id => document.getElementById(id);
const steps = [['H','How many?'],['M','Multiply'],['S','Subtract'],['B','Bring down']];
const block = col => ({col, product:Array(col+1).fill(''), result:Array(col+1).fill(''), brought:'', extra:{}, signs:{}});
let worksheetSequence = 0;
function problem(dividend, divisor) {
  const quotient = Array(dividend.length).fill('');
  return {
    worksheetId:Date.now().toString(36)+'-'+(++worksheetSequence),
    dividend,divisor,quotient,remainder:'',rows:quotient.map((_,col)=>block(col)),
    scratch:{boards:{multiply:blankScratch(),subtract:blankScratch()},archive:[]}
  };
}
let state = problem('396583','76');
let past = [], future = [];
let selectedStep = null;
let howManyColumn = null;
let reviewQuotientColumn = null;
let lastWorkingRow = null;
let carryTarget = null;
let scratchGridTarget = null;
let pendingSubtract = null;
let pinnedScrollTop = null;
let requireStep = false;
const termNames = {dividend:'Dividend',divisor:'Divisor',answer:'Quotient',leftover:'Remainder'};
let hiddenTerms = {};
let dataBoxHidden = true;
let gridSettingsHidden = true;
let sessionHidden = true;
let hmsbHidden = true;
let colorCode = true;
let showCarryRows = false;
let scratchHidden = true;
let scratchZoom = 'normal';
const gridSizes = {small:'3.65rem',medium:'4.5rem',large:'5.5rem'};
let gridSize = gridSizes.small;
const storageKey = 'mia-long-division-v1';
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  hiddenTerms = saved?.hiddenTerms || {};
  dataBoxHidden = saved?.dataBoxHidden !== false;
  gridSettingsHidden = saved?.gridSettingsHidden !== false;
  sessionHidden = saved?.sessionHidden !== false;
  hmsbHidden = saved?.hmsbHidden !== false;
  colorCode = saved?.colorCode !== false;
  showCarryRows = saved?.showCarryRows === true;
  scratchHidden = saved?.scratchHidden !== false;
  if (['normal','medium','large'].includes(saved?.scratchZoom)) scratchZoom = saved.scratchZoom;
  if (saved?.scratchZoom==='xl') scratchZoom = 'large';
  requireStep = saved?.stepLockEnabled === true;
  if (saved?.state?.rows) {
    const previous = saved.state;
    state = problem(previous.dividend,previous.divisor);
    state.worksheetId = previous.worksheetId || state.worksheetId;
    state.scratch = previous.scratch || state.scratch;
    state.quotient = previous.quotient;
    state.remainder = previous.remainder;
    state.trace = previous.trace;
    state.activeQuotient = previous.activeQuotient;
    for (const row of previous.rows) {
      state.rows[row.col] = {...block(row.col),...row,product:row.product.slice(0,row.col+1),result:row.result.slice(0,row.col+1)};
      if (row.subtract) state.rows[row.col].signs['product:-1'] = '−';
      delete state.rows[row.col].subtract;
    }
  }
  if (Object.values(gridSizes).includes(saved?.size)) gridSize = saved.size;
  for (const id of ['theme','highlight']) {
    if (saved?.[id] && [...$(id).options].some(option=>option.value===saved[id])) $(id).value = saved[id];
  }
} catch {}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({state,hiddenTerms,dataBoxHidden,gridSettingsHidden,sessionHidden,hmsbHidden,colorCode,showCarryRows,scratchHidden,scratchZoom,stepLockEnabled:requireStep,size:gridSize,theme:$('theme').value,highlight:$('highlight').value})); return true; } catch { return false; }
}
function syncSetup() {
  $('dividend').value = state.dividend;
  $('divisor').value = state.divisor;
}
function act(change, rebuild = true) {
  const before = JSON.stringify(state);
  change();
  if (before !== JSON.stringify(state)) {
    past.push(before);
    future = [];
    save();
  }
  if (rebuild) render();
  else update();
}
function restore(from,to) {
  if (!from.length) return;
  to.push(JSON.stringify(state));
  const previous = state;
  state = JSON.parse(from.pop());
  if (state.worksheetId===previous.worksheetId) state.scratch = previous.scratch;
  lastWorkingRow = null;
  reviewQuotientColumn = null;
  carryTarget = null;
  scratchGridTarget = null;
  pendingSubtract = null;
  save();
  $('answer').value = state.quotient.join('');
  $('leftover').value = state.remainder;
  syncSetup();
  render();
}
function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function rowGrid(parent, className, name) {
  const row = element('div','grid '+className);
  row.setAttribute('role','group');
  row.setAttribute('aria-label',name);
  parent.append(row);
  return row;
}
function focusPreviousWorkingTile(current) {
  const rows = [$('carry-before-dividend0'),...$('work-grid').children].filter(row=>row && !row.hidden);
  const tiles = rows.flatMap(row=>[...row.querySelectorAll('input')]);
  const index = tiles.indexOf(current);
  if (index < 1) return;
  const previous = tiles.slice(0,index).findLast(tile=>
    !tile.disabled && (!tile.classList.contains('carry-tile') || tile.value)
  );
  if (!previous) return;
  previous.focus({preventScroll:true});
  if (previous.classList.contains('carry-tile')) {
    const end = previous.value.length;
    previous.setSelectionRange(end,end);
  }
}
function cell(parent, options) {
  const {key,col,group,name,value,write,symbols} = options;
  const input = element('input','cell');
  input.id = key;
  input.style.gridColumn = col + (symbols ? 2 : 1);
  input.style.gridRow = 1;
  input.dataset.col = col;
  input.dataset.group = group;
  input.setAttribute('aria-label',name);
  if (symbols) input.setAttribute('aria-keyshortcuts','-');
  input.inputMode = symbols ? 'text' : 'numeric';
  input.autocomplete = 'off';
  input.value = value;
  input.dataset.minus = String(value==='−');
  function enterDigit(digit) {
    input.value = digit;
    input.dataset.minus = String(digit==='−');
    write(digit);
    if (digit) {
      $('house').querySelector('[data-group="'+group+'"][data-col="'+(col+1)+'"]')?.focus({preventScroll:true});
    }
  }
  function previousTile() {
    if (symbols) {
      focusPreviousWorkingTile(input);
      return;
    }
    const tiles = [...parent.querySelectorAll('.cell')];
    tiles[tiles.indexOf(input)-1]?.focus({preventScroll:true});
  }
  input.addEventListener('focus', () => input.select());
  input.addEventListener('click', () => input.select());
  input.addEventListener('input', event => {
    if (input.disabled) return;
    const allowed = symbols ? /[^0-9−-]/g : /[^0-9]/g;
    const value = input.value.slice(-1).replace(allowed,'').replace('-','−');
    enterDigit(value);
    if (!value && event.inputType==='deleteContentBackward') previousTile();
  });
  input.addEventListener('keydown', event => {
    if (input.disabled || event.ctrlKey || event.metaKey || event.altKey) return;
    if (symbols && ['-','−','Subtract'].includes(event.key)) {
      event.preventDefault();
      enterDigit('−');
      return;
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      enterDigit(event.key);
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      input.value = '';
      input.dataset.minus = 'false';
      write('');
      if (event.key === 'Backspace') previousTile();
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const horizontal = ['ArrowLeft','ArrowRight'].includes(event.key);
      const direction = ['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1;
      const all = [...$('house').querySelectorAll('.cell')];
      const matches = all.filter(other => horizontal ? other.dataset.group === group : Number(other.dataset.col) === col);
      matches[matches.indexOf(input) + direction]?.focus({preventScroll:true});
    }
  });
  parent.append(input);
  return input;
}
function gridValue(row,part,col) {
  const key = part+':'+col;
  if (row.signs[key]) return row.signs[key];
  if (part === 'result' && col === row.col+1) return row.brought;
  if (col >= 0 && col <= row.col) return row[part][col];
  return row.extra[key] || '';
}
function writeGrid(row,part,col,value) {
  const key = part+':'+col;
  if (value === '−') row.signs[key] = value;
  else delete row.signs[key];
  const digit = value === '−' ? '' : value;
  if (part === 'result' && col === row.col+1) row.brought = digit;
  else if (col >= 0 && col <= row.col) row[part][col] = digit;
  else if (digit) row.extra[key] = digit;
  else delete row.extra[key];
}
function marked(row,part) {
  return Object.keys(row.signs).some(key=>key.startsWith(part+':'));
}
function currentBringDown(preview = false) {
  const explicit = state.trace;
  for (let index=state.rows.length-1; index>=0; index--) {
    const row = state.rows[index];
    for (const part of ['result','product']) {
      if (explicit?.index===index && explicit.part===part &&
          gridValue(row,part,explicit.col)===state.dividend[explicit.col]) return explicit;

      const abovePart = part === 'result' ? 'product' : 'result';
      const above = part === 'result' ? row : state.rows[index-1];
      if (!above || !marked(above,abovePart)) continue;
      for (let col=state.dividend.length-1; col>=0; col--) {
        if (!/^[0-9]$/.test(gridValue(above,abovePart,col))) continue;
        const next = col+1;
        if (preview && next>=state.dividend.length) return null;
        if (next < state.dividend.length && (preview || gridValue(row,part,next)===state.dividend[next])) {
          return {index,part,col:next};
        }
        break;
      }
    }
  }
  if (preview) {
    const quotientCol = state.quotient[state.activeQuotient]
      ? state.activeQuotient : state.quotient.findLastIndex(Boolean);
    if (quotientCol>=0 && quotientCol+1<state.dividend.length) {
      return {...(lastWorkingRow || {index:0,part:'result'}),col:quotientCol+1};
    }
  }
  return null;
}
function syncPinView() {
  const viewport = $('work-viewport');
  const pinned = pinnedScrollTop!==null;
  $('pin-view').setAttribute('aria-pressed',String(pinned));
  $('pin-view').title = pinned ? 'Unpin View' : 'Pin View';
  if (!viewport) return;
  viewport.dataset.pinned = String(pinned);
  if (!pinned) return;
  pinnedScrollTop = Math.min(pinnedScrollTop,Math.max(0,viewport.scrollHeight-viewport.clientHeight));
  if (Math.abs(viewport.scrollTop-pinnedScrollTop)>.5) viewport.scrollTop = pinnedScrollTop;
}
$('pin-view').onclick = () => {
  pinnedScrollTop = pinnedScrollTop===null ? $('work-viewport').scrollTop : null;
  syncPinView();
};
function syncGridScrollSpace() {
  const viewport = $('work-viewport');
  if (viewport) viewport.style.setProperty('--grid-viewport-height',viewport.clientHeight+'px');
}
function addCarryRow(parent,row,part,columns,rowNumber) {
  const isDividend = part==='dividend';
  const location = isDividend ? 'the dividend' : 'working row '+rowNumber;
  const line = rowGrid(parent,'work-row carry-row','Carry marks above '+location);
  const saved = row.carry?.[part] || [];
  for (let col=0;col<columns;col++) {
    const pair = element('div','carry-pair');
    pair.style.gridColumn = col+(isDividend ? 1 : 2);
    const index = (col+1)*2+1;
    const cross = element('button','carry-tile carry-cross','╱');
    cross.id = 'carry-cross-'+part+row.col+'-'+col;
    cross.type = 'button';
    cross.setAttribute('aria-label','Cross out digit below, '+location+', column '+(col+1));
    cross.setAttribute('aria-pressed','false');
    cross.onclick = () => act(()=>{
      row.carryCross ||= {};
      row.carryCross[part] ||= [];
      row.carryCross[part][col] = !row.carryCross[part][col];
    },false);
    const field = element('input','carry-tile');
    field.id = 'carry-'+part+row.col+'-'+index;
    field.inputMode = 'numeric';
    field.autocomplete = 'off';
    field.setAttribute('aria-label','Carry mark above '+location+', column '+(col+1));
    field.value = saved[index] || '';
    field.addEventListener('keydown',event=>{
      if (field.disabled || field.value || event.key!=='Backspace' ||
        event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      focusPreviousWorkingTile(field);
    });
    field.addEventListener('input',event=>{
      if (field.disabled) return;
      const value = field.value.replace(/[^0-9]/g,'');
      if (field.value!==value) field.value = value;
      act(()=>{
        row.carry ||= {};
        row.carry[part] ||= [];
        row.carry[part][index] = value;
      },false);
      if (!value && event.inputType==='deleteContentBackward') focusPreviousWorkingTile(field);
    });
    for (const tile of [cross,field]) {
      const select = ()=>{carryTarget = {index:row.col,part,col};};
      tile.addEventListener('focus',select);
      tile.addEventListener('click',select);
    }
    pair.append(cross,field);
    line.append(pair);
  }
  return line;
}

function render() {
  const house = $('house');
  const scrollTop = $('work-viewport')?.scrollTop || 0;
  const focusId = house.contains(document.activeElement) ? document.activeElement.id : '';
  house.replaceChildren();
  const ready = Boolean(state.dividend && state.divisor);
  const columns = ready ? state.dividend.length : 6;
  house.style.setProperty('--digits',columns);
  house.style.setProperty('--gutter','calc(max(var(--cell), '+state.divisor.length*.62+' * var(--cell) * .57 + .8rem) + .73rem + var(--house-stroke) + var(--bracket-clearance))');
  house.style.setProperty('--remainder-width', (Math.max(2,state.divisor.length) * .61 + .5) + 'em');
  const top = element('div','house-top');
  const quotient = element('div','quotient');
  const q = rowGrid(quotient,'','Quotient digits');
  Array.from({length:columns},(_,col)=>state.quotient[col]||'').forEach((value,col) => {
    const tile = cell(q,{
      key:'q'+col,col,group:'q',name:'Quotient, column '+(col+1),value,
      write:digit=>act(()=>{
        state.quotient[col] = digit;
        reviewQuotientColumn = null;
        if (selectedStep===0) howManyColumn = col;
        if (digit) {
          state.activeQuotient = col;
          scratchGridTarget = null;
          copyMultiply(col);
        }
      },false)
    });
    const reviewColumn = ()=>{
      reviewQuotientColumn = reviewQuotientColumn===col ? null : col;
      update();
    };
    tile.addEventListener('click',reviewColumn);
    tile.addEventListener('keydown',event=>{
      if (event.key!=='Enter' || tile.disabled) return;
      event.preventDefault();
      reviewColumn();
    });
  });
  const divisor = element('div','divisor');
  const dividend = element('div','dividend');
  const makeOperand = id => {
    const field = element('input','grid-operand'+(id==='divisor'?' fixed':''));
    field.id = 'grid-'+id;
    field.inputMode = 'numeric';
    field.autocomplete = 'off';
    const label = id==='divisor'?'Divisor':'Dividend';
    field.placeholder = label;
    field.setAttribute('aria-label',label+' in the Division Grid');
    field.value = state[id];
    bindProblemField(field,id);
    if (id==='dividend' && ready) return field;
    const box = element('div','operand-placeholder-box');
    const caption = element('span','operand-placeholder',label);
    caption.setAttribute('aria-hidden','true');
    box.append(field,caption);
    return box;
  };
  divisor.append(makeOperand('divisor'));
  if (ready) {
    const editor = element('div','operand-editor');
    const d = rowGrid(editor,'','Dividend digits');
    d.setAttribute('aria-hidden','true');
    [...state.dividend].forEach((digit,col)=>{
      const tile = element('span','fixed',digit);
      tile.id = 'dividend-digit-'+col;
      d.append(tile);
    });
    const field = makeOperand('dividend');
    const selectDividend = () => { carryTarget = {index:0,part:'dividend',col:0}; };
    field.addEventListener('focus',selectDividend);
    field.addEventListener('click',selectDividend);
    editor.append(field);
    if (showCarryRows) {
      const carry = addCarryRow(dividend,state.rows[0],'dividend',columns);
      carry.id = 'carry-before-dividend0';
    }
    dividend.append(editor);
  } else {
    dividend.append(makeOperand('dividend'));
  }
  const multiplyMarker = element('span','bracket-multiply');
  multiplyMarker.id = 'bracket-multiply';
  multiplyMarker.setAttribute('aria-hidden','true');
  multiplyMarker.append(element('span','bracket-multiply-icon'));
  dividend.append(multiplyMarker);
  const remainder = element('label','remainder');
  const rest = element('input');
  rest.id = 'remainder';
  rest.setAttribute('aria-label','Remainder in division house');
  rest.inputMode = 'numeric';
  rest.autocomplete = 'off';
  rest.value = state.remainder;
  rest.addEventListener('mousedown', event=>{
    if (event.button!==0 || rest.disabled || document.activeElement===rest) return;
    event.preventDefault();
    rest.focus({preventScroll:true});
  });
  rest.addEventListener('input', () => {
    rest.value = rest.value.replace(/[^0-9]/g,'');
    act(()=>{state.remainder=rest.value},false);
  });
  remainder.append(element('span','remainder-caption','R'),rest);
  const work = element('div','work');
  work.id = 'work-grid';
  top.append(quotient,divisor,dividend,remainder);
  const viewport = element('div','work-viewport');
  viewport.id = 'work-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('role','region');
  viewport.setAttribute('aria-label','Scrollable working rows');
  viewport.addEventListener('scroll',()=>{
    if (pinnedScrollTop!==null) syncPinView();
  });
  viewport.addEventListener('wheel',event=>{
    if (pinnedScrollTop!==null && Math.abs(event.deltaY)>Math.abs(event.deltaX)) event.preventDefault();
  },{passive:false});
  viewport.append(work);
  house.append(top,viewport);
  const rows = ready ? state.rows : Array.from({length:columns},(_,col)=>block(col));
  rows.forEach((row,index)=>{
    for (const part of ['product','result']) {
      const group = part + index;
      const rowNumber = index * 2 + (part === 'product' ? 1 : 2);
      if (showCarryRows) {
        const carry = addCarryRow(work,row,part,columns,rowNumber);
        carry.id = 'carry-before-'+group;
        carry.hidden = true;
      }
      const line = rowGrid(work,'work-row','Working row '+rowNumber);
      line.id = 'working-'+group;
      for (let col=-1; col<columns; col++) {
        const tile = cell(line,{
          key:group+'-'+col,col,group,name:'Working row '+rowNumber+', column '+(col+2),
          value:gridValue(row,part,col),symbols:true,
          write:value=>act(()=>{
            lastWorkingRow = {index,part};
            reviewQuotientColumn = null;
            $('step-message').textContent = '';
            if (row.carryCross?.[part]?.[col] && gridValue(row,part,col)!==value) row.carryCross[part][col] = false;
            writeGrid(row,part,col,value);
            if (pendingSubtract?.index===index && pendingSubtract.part===part && subtractionOperands(index,part) && markSubtractRow(index,part)) {
              pendingSubtract = null;
            }
            copySubtract(index,part);
            if (selectedStep===3 && col>=0 && value===state.dividend[col]) {
              state.trace = {index,part,col};
            } else if (state.trace?.index===index && state.trace.part===part && state.trace.col===col) {
              delete state.trace;
            }
          },false)
        });
        tile.addEventListener('focus',()=>{carryTarget = {index,part,col};});
        tile.addEventListener('click',()=>{
          carryTarget = {index,part,col};
          lastWorkingRow = {index,part};
          if (col>=0) scratchGridTarget = {index,part,col};
        });
        if (col===-1) tile.classList.add('gutter');
      }
      const rule = element('span','rule');
      rule.id = 'rule-'+group;
      line.append(rule);

    }
  });
  update();
  if(focusId) $(focusId)?.focus({preventScroll:true});
  if (scratchWorksheetId!==state.worksheetId) renderScratch();
  syncGridScrollSpace();
  viewport.scrollTop = scrollTop;
  syncPinView();
}
function markSubtractRow(index,part) {
  const row = state.rows[index];
  if (marked(row,part)) return true;
  if (gridValue(row,part,-1)) {
    $('step-message').textContent = 'Clear the first tile in this row to place the minus sign.';
    return false;
  }
  writeGrid(row,part,-1,'−');
  const tile = $(part+index+'--1');
  tile.value = '−';
  tile.dataset.minus = 'true';
  return true;
}
function placeSubtractSign() {
  let target = pendingSubtract || lastWorkingRow;
  if (!target) {
    for (let index=state.rows.length-1; index>=0 && !target; index--) {
      for (const part of ['result','product']) {
        if (workingDigits(state.rows[index],part).trim()) {
          target = {index,part};
          break;
        }
      }
    }
  }
  target ||= {index:0,part:'product'};
  let {index,part} = target;
  const above = part==='result' ? state.rows[index] : state.rows[index-1];
  const abovePart = part==='result' ? 'product' : 'result';
  if (above && marked(above,abovePart) && workingDigits(state.rows[index],part).trim()) {
    if (part==='result') {index++;part='product';}
    else part='result';
  }
  if (!state.rows[index]) {
    $('step-message').textContent = 'Use an empty working row for the next subtraction.';
    return;
  }
  const operands = subtractionOperands(index,part);
  if (operands) {
    act(()=>{
      if (!markSubtractRow(index,part)) return;
      lastWorkingRow = {index,part};
      pendingSubtract = null;
      copySubtract(index,part);
    },false);
    return;
  }
  pendingSubtract = {index,part};
  $('step-message').textContent = 'Type the bottom number in the outlined row, lining up its last digit with the top number.';
  const previous = index*2+(part==='result'?1:0)-1;
  const top = previous>=0
    ? workingDigits(state.rows[Math.floor(previous/2)],previous%2?'result':'product').trim()
    : state.dividend.slice(0,(state.activeQuotient ?? state.quotient.findLastIndex(Boolean))+1);
  const bottom = workingDigits(state.rows[index],part).trim();
  fillScratchOperands('subtract',part+'-'+index,/^\d+$/.test(top)?top:'',/^\d+$/.test(bottom)?bottom:'');
}
steps.forEach(([letter,name],index)=>{
  const button = element('button',letter==='S'?'subtract-step':letter==='M'?'multiply-step':'');
  button.type = 'button';
  button.setAttribute('aria-pressed','false');
  button.append(element('strong','',String(index+1)),element('span','',letter+' · '+name));
  button.addEventListener('click',()=>{
    if (!applyProblem()) return;
    if (index===2 && pendingSubtract) {
      cancelPendingSubtract();
      return;
    }
    const priorStep = selectedStep;
    $('step-message').textContent = '';
    selectedStep = index;
    reviewQuotientColumn = null;
    howManyColumn = index===0 ? pickHowManyColumn() : null;
    if (index!==2) pendingSubtract = null;
    if (index===1) {
      scratchMode = 'multiply';
      const column = state.quotient[state.activeQuotient] ? state.activeQuotient : state.quotient.findLastIndex(Boolean);
      copyMultiply(column);
      renderScratch();
    }
    if (index===2) {
      const priorMode = scratchMode;
      const priorScratch = JSON.stringify(state.scratch);
      const priorScratchUndoLength = scratchPast.length;
      scratchMode = 'subtract';
      placeSubtractSign();
      if (pendingSubtract) Object.assign(pendingSubtract,{
        priorStep,priorMode,priorScratch,priorScratchUndoLength,queuedScratch:JSON.stringify(state.scratch)
      });
      renderScratch();
    }
    update();
  });
  $('steps').append(button);
});
function updateDataBox() {
  $('data-fields').hidden = dataBoxHidden;
  $('data-toggle').setAttribute('aria-expanded',String(!dataBoxHidden));
  $('data-toggle').setAttribute('aria-label',dataBoxHidden?'Show Data Box':'Hide Data Box');
}
$('data-toggle').addEventListener('click',()=>{
  if (!dataBoxHidden) applyProblem();
  dataBoxHidden = !dataBoxHidden;
  updateDataBox();
  placeCards($('data-toggle'));
  save();
});
updateDataBox();
function updateGridSettingsVisibility() {
  $('grid-settings-details').hidden = gridSettingsHidden;
  $('grid-settings-toggle').setAttribute('aria-expanded',String(!gridSettingsHidden));
  $('grid-settings-toggle').setAttribute('aria-label',gridSettingsHidden?'Show Grid Settings':'Hide Grid Settings');
}
$('grid-settings-toggle').addEventListener('click',()=>{
  gridSettingsHidden = !gridSettingsHidden;
  updateGridSettingsVisibility();
  if (!compactCards.matches && !gridSettingsHidden) setMenuOpen(false);
  placeCards($('grid-settings-toggle'));
  save();
});
updateGridSettingsVisibility();
function updateSessionVisibility() {
  $('session-details').hidden = sessionHidden;
  $('session-toggle').setAttribute('aria-expanded',String(!sessionHidden));
  $('session-toggle').setAttribute('aria-label',sessionHidden?'Show Session':'Hide Session');
}
$('session-toggle').addEventListener('click',()=>{
  sessionHidden = !sessionHidden;
  updateSessionVisibility();
  placeCards($('session-toggle'));
  save();
});
updateSessionVisibility();

const compactCards = window.matchMedia('(max-width:55rem)');
function updateHmsbVisibility() {
  $('hmsb-details').hidden = hmsbHidden;
  $('hmsb-toggle').setAttribute('aria-expanded',String(!hmsbHidden));
  $('hmsb-toggle').setAttribute('aria-label',hmsbHidden?'Show HMSB Steps':'Hide HMSB Steps');
}
$('hmsb-toggle').addEventListener('click',()=>{
  hmsbHidden = !hmsbHidden;
  updateHmsbVisibility();
  placeCards($('hmsb-toggle'));
  save();
});
updateHmsbVisibility();

function setMenuOpen(open) {
  $('mobile-cards').hidden = !open;
  $('mobile-menu-toggle').setAttribute('aria-expanded',String(open));
}
function placeCards(focusTarget = document.activeElement) {
  const groups = {
    'left-rail': [],
    'reference-column': [],
    'mobile-cards': []
  };
  const cards = [
    ['grid-settings-card',gridSettingsHidden,'left-rail'],
    ['data-card',dataBoxHidden,'left-rail'],
    ['scratch-card',scratchHidden,'left-rail'],
    ['hmsb-card',hmsbHidden,'reference-column'],
    ['session-card',sessionHidden,'reference-column']
  ];
  for (const [id,hidden,rail] of cards) {
    groups[compactCards.matches || hidden ? 'mobile-cards' : rail].push($(id));
  }
  const menu = $('mobile-menu-toggle');
  const panel = $('mobile-cards');
  menu.hidden = !groups['mobile-cards'].length;
  if (menu.hidden) setMenuOpen(false);
  for (const [id,children] of Object.entries(groups)) {
    const container = $(id);
    if (children.length!==container.children.length ||
        children.some((card,index)=>card!==container.children[index])) {
      container.append(...children);
    }
  }
  if (panel.hidden && panel.contains(focusTarget)) menu.focus({preventScroll:true});
  else if (focusTarget && document.activeElement!==focusTarget) focusTarget.focus({preventScroll:true});
}
$('mobile-menu-toggle').addEventListener('click',()=>setMenuOpen($('mobile-cards').hidden));
compactCards.addEventListener('change',()=>{
  placeCards();
  syncScratchPanel();
});
placeCards();
function updateTerm(id) {
  const visible = !hiddenTerms[id];
  $('term-'+id).dataset.hidden = String(!visible);
  $('toggle-'+id).setAttribute('aria-expanded',String(visible));
  $('toggle-'+id).setAttribute('aria-label',(visible?'Hide ':'Show ')+termNames[id]);
  $('show-'+id).hidden = visible;
}
for (const id of Object.keys(termNames)) {
  $('toggle-'+id).addEventListener('click',()=>{
    if (id==='dividend' || id==='divisor') applyProblem();
    hiddenTerms[id] = !hiddenTerms[id];
    updateTerm(id);
    save();
  });
  updateTerm(id);
}
function setStepLock(enabled) {
  requireStep = enabled;
  if (requireStep) {selectedStep = null;howManyColumn = null;}
  save();
  update();
}
$('step-lock').addEventListener('click',()=>setStepLock(!requireStep));
$('unlock-grid').onclick = () => {
  setStepLock(false);
  $('q0')?.focus({preventScroll:true});
};
function pickHowManyColumn() {
  if (!state.dividend || !state.divisor) return null;
  const last = state.quotient[state.activeQuotient] ? state.activeQuotient : state.quotient.findLastIndex(Boolean);
  const trace = currentBringDown();
  if (trace && trace.col>=last) return trace.col;
  if (last>=0) return last;
  const length = Math.min(state.divisor.length,state.dividend.length);
  return length<state.dividend.length && BigInt(state.dividend.slice(0,length))<BigInt(state.divisor)
    ? length : length-1;
}
function updateHowManyCue(ready) {
  const current = ready && selectedStep===0 ? (reviewQuotientColumn ?? howManyColumn ?? pickHowManyColumn()) : null;
  state.quotient.forEach((_,col)=>{
    const tile = $('q'+col);
    tile.classList.toggle('how-many-current',col===current);
  });
}
function update() {
  const ready = Boolean(state.dividend && state.divisor);
  const unlocked = ready && (!requireStep || selectedStep !== null);
  for (const row of state.rows) {
    const parts = row===state.rows[0] ? ['dividend','product','result'] : ['product','result'];
    for (const part of parts) {
      $('rule-'+part+row.col)?.classList.toggle('marked',marked(row,part));
      const carry = $('carry-before-'+part+row.col);
      if (!carry) continue;
      const crossed = row.carryCross?.[part] || [];
      carry.hidden = !(row.manualCarry?.[part] || row.carry?.[part]?.slice(2).some(Boolean) || crossed.some(Boolean));
      for (let col=0;col<state.dividend.length;col++) {
        const cross = $('carry-cross-'+part+row.col+'-'+col);
        cross.setAttribute('aria-pressed',String(Boolean(crossed[col])));
        cross.disabled = !unlocked || (part!=='dividend' && !/^\d$/.test(gridValue(row,part,col)));
        const digit = $(part==='dividend' ? 'dividend-digit-'+col : part+row.col+'-'+col);
        digit.classList.toggle('carry-crossed',!carry.hidden && Boolean(crossed[col]));
        if (!carry.hidden && crossed[col]) digit.setAttribute('aria-description','Crossed out');
        else digit.removeAttribute('aria-description');
      }
    }
  }
  $('work-grid').querySelectorAll('.pending-subtract').forEach(row=>row.classList.remove('pending-subtract'));
  if (pendingSubtract) $('working-'+pendingSubtract.part+pendingSubtract.index)?.classList.add('pending-subtract');
  $('bracket-multiply').hidden = !ready || selectedStep!==1;
  $('step-lock').setAttribute('aria-pressed',String(requireStep));
  $('step-lock').title = requireStep ? 'Turn step lock off' : 'Turn step lock on';
  $('grid-gate').hidden = unlocked;
  $('unlock-grid').hidden = !ready || unlocked;
  $('grid-message').textContent = ready ? 'Choose an HMSB step or unlock the grid.' : 'Enter the dividend and divisor, then press Enter.';
  $('house').querySelectorAll('input').forEach(input=>{
    input.disabled = !input.id.startsWith('grid-') && !unlocked;
  });
  updateExerciseActions();
  $('add-carry-row').disabled = !unlocked;
  $('delete-carry-row').disabled = !unlocked || !showCarryRows;
  for (const [index,button] of [...$('steps').children].entries()) {
    button.setAttribute('aria-pressed',String(index===selectedStep));
  }
  $('house').querySelectorAll('.bring-trace').forEach(tile=>tile.classList.remove('bring-trace'));
  const trace = requireStep ? (selectedStep===3 ? currentBringDown(true) : null) : currentBringDown();
  if (ready && reviewQuotientColumn!==null) {
    const col = reviewQuotientColumn;
    $('q'+col)?.classList.add('bring-trace');
    $('dividend-digit-'+col)?.classList.add('bring-trace');
    const column = $('work-grid').querySelectorAll('.cell[data-col="'+col+'"]');
    for (const tile of column) tile.classList.add('bring-trace');
  } else if (trace) {
    $('q'+trace.col)?.classList.add('bring-trace');
    for (let col=0; col<=trace.col; col++) {
      $('dividend-digit-'+col)?.classList.add('bring-trace');
    }
    const column = [...$('work-grid').querySelectorAll('.cell[data-col="'+trace.col+'"]')];
    let end = column.indexOf($(trace.part+trace.index+'-'+trace.col));
    for (let row=end+1; row<column.length; row++) {
      if (/^[0-9]$/.test(column[row].value)) end = row;
    }
    for (const tile of column.slice(0,end+1)) tile.classList.add('bring-trace');
  }
  updateHowManyCue(ready);
  $('undo').disabled = !past.length && !pendingSubtract;
  $('redo').disabled = !future.length;
  $('answer').value = state.quotient.join('');
  $('leftover').value = state.remainder;
  if(document.activeElement!==$('remainder')) $('remainder').value = state.remainder;

}
function applyProblem() {
  const dividendField = $('grid-dividend');
  const divisorField = $('grid-divisor');
  const dividend = dividendField.value.trim().replace(/^0+(?=\d)/,'');
  const divisor = divisorField.value.trim().replace(/^0+/,'');
  const dividendValid = /^\d+$/.test(dividend);
  const divisorValid = /^[1-9]\d*$/.test(divisor);
  dividendField.setAttribute('aria-invalid',String(!dividendValid));
  divisorField.setAttribute('aria-invalid',String(!divisorValid));
  const message = $('problem-message');
  if (!state.dividend && (!dividendField.value.trim() || !divisorField.value.trim())) {
    dividendField.setAttribute('aria-invalid','false');
    divisorField.setAttribute('aria-invalid','false');
    message.textContent = '';
    return false;
  }
  message.textContent = !dividendValid ? 'Enter a whole-number dividend.' : !divisorValid ? 'Enter a whole-number divisor greater than zero.' : '';
  if (!dividendValid || !divisorValid) {
    syncSetup();
    return false;
  }
  if (dividend !== state.dividend || divisor !== state.divisor) {
    selectedStep = null;
    pinnedScrollTop = null;
    lastWorkingRow = null;
    reviewQuotientColumn = null;
    carryTarget = null;
    scratchGridTarget = null;
    pendingSubtract = null;
    act(()=>{state=problem(dividend,divisor)});
    $('status').textContent='New problem. '+dividend+' divided by '+divisor+'.';
  }
  $('grid-dividend').value = state.dividend;
  $('grid-divisor').value = state.divisor;
  $('grid-dividend').dataset.draft = 'false';
  syncSetup();
  return true;
}
function bindProblemField(field,id) {
  field.addEventListener('input',()=>{
    $(id).value = field.value;
    field.dataset.draft = String(field.value!==state[id]);
  });
  field.addEventListener('keydown',event=>{
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyProblem();
  });
  field.addEventListener('blur',event=>{
    const next = event.relatedTarget?.id;
    if (!['grid-dividend','grid-divisor'].includes(next)) setTimeout(applyProblem,0);
  });
}
function cancelPendingSubtract() {
  if (!pendingSubtract) return false;
  const {priorStep,priorMode,priorScratch,priorScratchUndoLength,queuedScratch} = pendingSubtract;
  pendingSubtract = null;
  selectedStep = priorStep ?? null;
  howManyColumn = null;
  if (priorMode) scratchMode = priorMode;
  if (priorScratch && JSON.stringify(state.scratch)===queuedScratch) {
    state.scratch = JSON.parse(priorScratch);
    scratchPast.length = Math.min(scratchPast.length,priorScratchUndoLength);
    save();
  }
  $('step-message').textContent = '';
  renderScratch();
  update();
  return true;
}
function undoWorksheet() {
  if (!cancelPendingSubtract()) restore(past,future);
}
$('undo').onclick=undoWorksheet;
$('redo').onclick=()=>restore(future,past);
document.addEventListener('keydown',event=>{
  if (event.key==='Escape' && cancelPendingSubtract()) {
    event.preventDefault();
    return;
  }
  if (event.key==='Escape' && reviewQuotientColumn!==null) {
    reviewQuotientColumn = null;
    update();
    event.preventDefault();
    return;
  }
  if(!(event.ctrlKey||event.metaKey) || event.altKey || event.key.toLowerCase()!=='z') return;
  if(event.target.closest('#setup, #scratch-card, .grid-operand') || event.target.id==='remainder') return;
  event.preventDefault();
  if (event.shiftKey) restore(future,past);
  else undoWorksheet();
});
$('color-code-toggle').onclick = () => {
  colorCode = !colorCode;
  applyDisplay();
  save();
};
$('add-carry-row').onclick = () => {
  const row = carryTarget && state.rows[carryTarget.index];
  if (!row) {
    $('grid-settings-status').textContent = 'Select the dividend or a working tile, then choose Add Row.';
    return;
  }
  const {part,col} = carryTarget;
  $('grid-settings-status').textContent = '';
  if (!showCarryRows) {
    showCarryRows = true;
    updateCarryToggle();
    save();
  }
  act(()=>{
    row.manualCarry ||= {};
    row.manualCarry[part] = true;
  });
  $('carry-'+part+row.col+'-'+((Math.max(0,col)+1)*2+1))?.focus({preventScroll:true});
};
$('delete-carry-row').onclick = () => {
  const row = carryTarget && state.rows[carryTarget.index];
  const part = carryTarget?.part;
  const carry = row && $('carry-before-'+part+row.col);
  if (!carry || carry.hidden) {
    $('grid-settings-status').textContent = 'Select a carry tile or the row directly below it, then choose Delete Row.';
    return;
  }
  $('grid-settings-status').textContent = '';
  act(()=>{
    if (row.manualCarry) delete row.manualCarry[part];
    if (row.carry) delete row.carry[part];
    if (row.carryCross) delete row.carryCross[part];
  });
  $('status').textContent = 'Carry row deleted. Undo is available.';
};
function updateCarryToggle() {
  $('carry-grid-toggle').setAttribute('aria-expanded',String(showCarryRows));
  $('carry-grid-label').textContent = showCarryRows ? 'Hide Rows' : 'Show Rows';
}
$('carry-grid-toggle').onclick = () => {
  showCarryRows = !showCarryRows;
  updateCarryToggle();
  save();
  render();
};
function applyDisplay() {
  const root = document.documentElement;
  root.style.setProperty('--cell',gridSize);
  for (const [name,value] of Object.entries(gridSizes)) {
    $('grid-size-'+name).setAttribute('aria-pressed',String(value===gridSize));
  }
  syncGridScrollSpace();
  root.dataset.theme = $('theme').value;
  root.dataset.highlight = $('highlight').value;
  root.dataset.colorCode = colorCode ? 'on' : 'off';
  $('color-code-toggle').setAttribute('aria-pressed',String(colorCode));
  updateCarryToggle();
}
for (const [name,value] of Object.entries(gridSizes)) {
  $('grid-size-'+name).onclick = () => {gridSize = value; applyDisplay(); save();};
}
for (const id of ['theme','highlight']) {
  $(id).onchange=()=>{applyDisplay();save();};
}
const sessionKey = 'mathing-session-v1';
let savedWork = [];
let preparedPdfUrl = null;
try {
  savedWork = JSON.parse(sessionStorage.getItem(sessionKey) || '[]');
} catch {}
const timerKey = sessionKey+'-started';
let sessionStarted = Date.now();
try {
  const stored = Number(sessionStorage.getItem(timerKey));
  if (stored > 0 && stored <= sessionStarted) sessionStarted = stored;
  else sessionStorage.setItem(timerKey,String(sessionStarted));
} catch {}
function sessionSeconds() {
  const end = exerciseQueue?.finishedAt ?? Date.now();
  return Math.max(0,Math.floor((end-sessionStarted)/1000));
}
function formatSessionTime(seconds) {
  const hours = Math.floor(seconds/3600);
  const minutes = Math.floor(seconds/60)%60;
  const pad = value=>String(value).padStart(2,'0');
  return (hours ? pad(hours)+':' : '')+pad(minutes)+':'+pad(seconds%60);
}
function updateSessionTime() {
  const seconds = sessionSeconds();
  const clock = $('session-time');
  clock.textContent = formatSessionTime(seconds);
  clock.setAttribute('datetime','PT'+seconds+'S');
}
function clearPreparedPdf() {
  if (preparedPdfUrl) URL.revokeObjectURL(preparedPdfUrl);
  preparedPdfUrl = null;
  const link = $('download-ready');
  link.hidden = true;
  link.removeAttribute('href');
}
function updateSession() {
  $('download-pdf').disabled = savedWork.length === 0;
  $('session-count').textContent = (savedWork.length
    ? savedWork.length+' saved '+(savedWork.length===1?'worksheet':'worksheets')
    : '');
}
$('reset').onclick = () => {
  pinnedScrollTop = null;
  selectedStep = null;
  lastWorkingRow = null;
  reviewQuotientColumn = null;
  carryTarget = null;
  scratchGridTarget = null;
  pendingSubtract = null;
  act(()=>{
    state = problem('','');
    syncSetup();
    $('problem-message').textContent = '';
    $('step-message').textContent = '';
  });
  $('scroller').scrollTo(0,0);
  $('work-viewport').scrollTop = 0;
  $('grid-dividend').focus({preventScroll:true});
  $('status').textContent = 'Exercise cleared. Enter a new dividend and divisor. Undo is available.';
};
function saveExerciseToPdf() {
  if (!canSaveExercise() || !applyProblem() || !canSaveExercise()) return;
  clearPreparedPdf();
  const exerciseNumber = exerciseQueue ? Math.min(exerciseQueue.index+1,exerciseQueue.items.length) : savedWork.length+1;
  const entry = {exerciseNumber,worksheet:JSON.parse(JSON.stringify(state)),savedAt:new Date().toISOString()};
  const index = savedWork.findIndex(item=>item.worksheet?.worksheetId===state.worksheetId);
  if (index < 0) savedWork.push(entry);
  else savedWork[index] = entry;
  try { sessionStorage.setItem(sessionKey,JSON.stringify(savedWork)); } catch {}
  updateSession();
  return true;
}
function finishExercise(endSession = false) {
  if (!canSaveExercise() || !applyProblem() || !canSaveExercise()) return;
  passedCheck = null;
  updateSession();
  if ($('check-dialog').open) $('check-dialog').close();
  if (!exerciseQueue) {update();return;}
  if (!sessionComplete()) {
    if (exerciseQueue.openEnded && !endSession) {
      exerciseQueue.items.push({dividend:'',divisor:''});
    }
    exerciseQueue.index++;
    if (sessionComplete()) exerciseQueue.finishedAt = Date.now();
    storeExercises();
  }
  if (sessionComplete()) {
    updateSessionTime();
    update();
    openCheckDialog('complete');
  } else {
    loadQueuedExercise(exerciseQueue.items[exerciseQueue.index]);
    $(exerciseQueue.openEnded?'grid-dividend':'work-title').focus({preventScroll:true});
  }
}
$('save-work').onclick = () => {
  if (!applyProblem()) return;
  const saved = save();
  readyToCheck = answerKey();
  updateExerciseActions();
  $('problem-message').textContent = saved ? 'Work saved in this browser.' : 'Check Math is ready. This browser couldn’t save your work for later.';
};

const scratchModes = {multiply:'Multiply',subtract:'Subtract'};
const scratchRows = ['marks','top','bottom','answer'];
let scratchPast = [];
let scratchWorksheetId;
let scratchMode = 'multiply';

function blankScratch(width = 5) {
  return {width,marks:Array(width).fill(''),top:Array(width).fill(''),
    bottom:Array(width).fill(''),answer:Array(width).fill(''),crossed:Array(width).fill(false)};
}
function scratchHasWork(board) {
  return scratchRows.some(row=>board[row].some(Boolean)) || board.crossed.some(Boolean);
}
function scratchHasWrittenWork(board) {
  const source = board.source;
  if (!source) return scratchHasWork(board);
  return board.marks.some(Boolean) || board.answer.some(Boolean) || board.crossed.some(Boolean)
    || board.top.join('')!==source.top || board.bottom.join('')!==source.bottom;
}
function scratchBoard() {
  return state.scratch.boards[scratchMode];
}
function editScratch(change, rebuild = false) {
  const before = JSON.stringify(state.scratch);
  change();
  if (before !== JSON.stringify(state.scratch)) {
    scratchPast.push(before);
    save();
  }
  if (rebuild) renderScratch();
  else updateScratchTransfer();
}
function fillScratchOperands(mode,key,top,bottom) {
  if (mode==='multiply' && (!top || !bottom)) return;
  const existing = state.scratch.boards[mode];
  const source = existing.source;
  if (source?.key===key && source.top===top && source.bottom===bottom) return;

  editScratch(()=>{
    let board = existing;
    if (source?.key!==key) {
      const alreadySaved = state.scratch.archive.some(item=>item.mode===mode && JSON.stringify(item.board)===JSON.stringify(existing));
      if (!alreadySaved && scratchHasWrittenWork(existing)) state.scratch.archive.push({mode,board:existing});
      board = blankScratch(existing.width);
      state.scratch.boards[mode] = board;
    }

    const width = Math.max(board.width,top.length,bottom.length);
    for (const row of scratchRows) {
      board[row].unshift(...Array(width-board.width).fill(''));
    }
    board.crossed.unshift(...Array(width-board.width).fill(false));
    board.width = width;
    const operands = {top,bottom};
    for (const row of ['top','bottom']) {
      if (source?.key===key && board[row].join('')!==source[row]) {
        operands[row] = source[row];
        continue;
      }
      board[row] = [...operands[row].padStart(width,' ')].map(digit=>digit.trim());
    }
    board.source = {key,...operands};
  },scratchMode===mode);
}

function copyMultiply(col) {
  const digit = state.quotient[col];
  if (digit) fillScratchOperands('multiply','quotient-'+col,state.divisor,digit);
}

function workingDigits(row,part) {
  return Array.from({length:state.dividend.length},(_,col)=>{
    const value = gridValue(row,part,col);
    return /^\d$/.test(value)?value:' ';
  }).join('');
}
function subtractionOperands(index,part) {
  const position = index*2+(part==='result'?1:0);
  const bottom = workingDigits(state.rows[index],part).trim();
  const end = workingDigits(state.rows[index],part).trimEnd().length-1;
  if (end<0 || !/^\d+$/.test(bottom)) return null;
  let top;
  if (position>0) {
    const previous = position-1;
    const above = state.rows[Math.floor(previous/2)];
    const side = previous%2?'result':'product';
    if (marked(above,side)) return null;
    const topTiles = workingDigits(above,side).trimEnd();
    if (topTiles) {
      if (topTiles.length-1!==end) return null;
      top = topTiles.trimStart();
    } else {
      for (let earlier=previous-1; earlier>=0; earlier--) {
        const prior = state.rows[Math.floor(earlier/2)];
        const priorSide = earlier%2?'result':'product';
        if (marked(prior,priorSide) || workingDigits(prior,priorSide).trim()) return null;
      }
    }
  }
  top ??= state.dividend.slice(0,end+1);
  return /^\d+$/.test(top) ? {top,bottom} : null;
}
function copySubtract(index,part) {
  if (!marked(state.rows[index],part)) return;
  const operands = subtractionOperands(index,part);
  if (operands) fillScratchOperands('subtract',part+'-'+index,operands.top,operands.bottom);
}

function updateScratchTransfer() {
  $('scratch-transfer').hidden = !scratchBoard().answer.some(Boolean);
}
function scratchTransferTarget(board) {
  const source = board.source?.key;
  if (scratchMode==='subtract' && source) {
    const [part,indexText] = source.split('-');
    const index = Number(indexText);
    const row = state.rows[index];
    if (row && marked(row,part)) {
      return {index:part==='product'?index:index+1,part:part==='product'?'result':'product',
        col:workingDigits(row,part).trimEnd().length-1};
    }
  }
  if (scratchMode==='multiply' && source?.startsWith('quotient-')) {
    const col = Number(source.slice('quotient-'.length));
    const trace = currentBringDown();
    if (trace?.col===col) {
      return trace.part==='result' ? {index:trace.index+1,part:'product',col}
        : {index:trace.index,part:'result',col};
    }
    const hasGridWork = state.rows.some(row=>['product','result'].some(part=>workingDigits(row,part).trim()));
    if (!hasGridWork) return {index:0,part:'product',col};
  }
  return scratchGridTarget;
}
$('scratch-transfer').onclick = () => {
  const status = $('scratch-status');
  if (!state.dividend || !state.divisor || requireStep && selectedStep===null) {
    status.textContent = 'Set up the Division Grid and unlock it before adding a result.';
    return;
  }
  const board = scratchBoard();
  const result = board.answer.map(digit=>digit || ' ').join('').trim();
  if (!/^\d+$/.test(result)) {
    status.textContent = 'Fill the gaps between the result digits first.';
    return;
  }
  let target = scratchTransferTarget(board);
  if (!target || !state.rows[target.index] || target.col+1<result.length) target = scratchGridTarget;
  const row = target && state.rows[target.index];
  const first = target ? target.col-result.length+1 : -1;
  if (!row || first<0) {
    status.textContent = 'Click the tile where the last digit should go in the Division Grid, then try again.';
    return;
  }
  const digits = [...result];
  const conflict = digits.some((digit,offset)=>{
    const value = gridValue(row,target.part,first+offset);
    return value && value!==digit;
  });
  if (conflict) {
    status.textContent = 'That spot already has different digits. Clear them or enter the result in the grid yourself.';
    return;
  }
  act(()=>{
    digits.forEach((digit,offset)=>{
      const col = first+offset;
      writeGrid(row,target.part,col,digit);
      $(target.part+target.index+'-'+col).value = digit;
    });
    lastWorkingRow = {index:target.index,part:target.part};
    if (pendingSubtract?.index===target.index && pendingSubtract.part===target.part
      && subtractionOperands(target.index,target.part) && markSubtractRow(target.index,target.part)) {
      pendingSubtract = null;
    }
    copySubtract(target.index,target.part);
  },false);
  status.textContent = 'Result added. You can edit it in the Division Grid.';
};

function renderScratch() {
  if (scratchWorksheetId!==state.worksheetId) {
    scratchWorksheetId = state.worksheetId;
    scratchPast = [];
    $('scratch-status').textContent = '';
  }
  const board = scratchBoard();
  const subtraction = scratchMode==='subtract';
  $('scratch-card').dataset.mode = scratchMode;
  for (const mode of Object.keys(scratchModes)) {
    $('scratch-'+mode).setAttribute('aria-pressed',String(mode===scratchMode));
  }

  const area = $('scratch-grid');
  const focusId = area.contains(document.activeElement) ? document.activeElement.id : '';
  area.replaceChildren();
  area.style.setProperty('--scratch-width',board.width);
  $('scratch-card').style.setProperty('--scratch-width',board.width);
  const names = {marks:'Carry',top:'Top Number',
    bottom:'Bottom Number',answer:'Result'};

  function addRow(key) {
    const row = element('div','scratch-row'+(key==='bottom'?' scratch-operation':''));
    row.append(element('span','scratch-sign',key==='bottom'?(subtraction?'−':'×'):''));
    row.firstChild.setAttribute('aria-hidden','true');
    for (let col=0; col<board.width; col++) {
      if (key==='bottom' && !subtraction && col!==board.width-1) {
        row.append(element('span','scratch-empty'));
        continue;
      }
      const field = element('input','scratch-tile');
      const place = board.width-col;
      field.id = 'scratch-'+key+'-'+col;
      field.setAttribute('aria-label',names[key]+', '+(place===1?'ones column':'column '+place+' from the right'));
      field.inputMode = 'numeric';
      field.autocomplete = 'off';
      field.maxLength = key==='marks'?2:1;
      field.value = board[key][col];
      field.placeholder = ' ';
      if (key==='top') field.classList.toggle('crossed',subtraction && board.crossed[col]);
      function enter(value) {
        field.value = value;
        editScratch(()=>{
          board[key][col] = value;
          if (key==='top' && !value) board.crossed[col] = false;
        });
        if (key==='top') {
          const cross = $('scratch-cross-'+col);
          if (cross) {
            cross.disabled = !value;
            if (!value) {
              field.classList.remove('crossed');
              cross.setAttribute('aria-pressed','false');
            }
          }
        }
        if (value && value.length===field.maxLength) $('scratch-'+key+'-'+(col+1))?.focus({preventScroll:true});
      }
      field.addEventListener('focus',()=>field.select());
      if (key!=='marks') field.addEventListener('click',()=>field.select());
      field.addEventListener('input',()=>enter(field.value.replace(/[^0-9]/g,'').slice(0,field.maxLength)));
      field.addEventListener('keydown',event=>{
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (['ArrowLeft','ArrowRight'].includes(event.key)) {
          const target = $('scratch-'+key+'-'+(col+(event.key==='ArrowLeft'?-1:1)));
          if (target && (key!=='marks' || field.selectionStart===field.selectionEnd)) {
            event.preventDefault();
            target.focus({preventScroll:true});
          }
        } else if (event.key==='Backspace' && (!field.value || field.selectionStart===0 && field.selectionEnd===field.value.length)) {
          event.preventDefault();
          enter('');
          $('scratch-'+key+'-'+(col-1))?.focus({preventScroll:true});
        }
      });
      row.append(field);
    }
    area.append(element('div','scratch-label',names[key]),row);
  }

  addRow('marks');
  if (subtraction) {
    const row = element('div','scratch-row scratch-cross-row');
    row.append(element('span','scratch-sign'));
    for (let col=0; col<board.width; col++) {
      const button = element('button','scratch-cross','╱');
      button.id = 'scratch-cross-'+col;
      button.type = 'button';
      button.setAttribute('aria-label','Cross out top digit, column '+(board.width-col)+' from the right');
      button.setAttribute('aria-pressed',String(board.crossed[col]));
      button.disabled = !board.top[col];
      button.onclick = () => {
        if (!board.top[col]) return;
        editScratch(()=>{board.crossed[col] = !board.crossed[col];});
        button.setAttribute('aria-pressed',String(board.crossed[col]));
        $('scratch-top-'+col).classList.toggle('crossed',board.crossed[col]);
      };
      row.append(button);
    }
    area.append(row);
  }
  for (const key of ['top','bottom','answer']) addRow(key);
  updateScratchTransfer();
  if (focusId) $(focusId)?.focus({preventScroll:true});
}

for (const mode of Object.keys(scratchModes)) {
  $('scratch-'+mode).onclick = () => {
    scratchMode = mode;
    renderScratch();
  };
}
function undoScratch() {
  if (!scratchPast.length) return;
  state.scratch = JSON.parse(scratchPast.pop());
  save();
  renderScratch();
}
$('scratch-column').onclick = () => {
  editScratch(()=>{
    const board = scratchBoard();
    board.width++;
    for (const row of scratchRows) board[row].unshift('');
    board.crossed.unshift(false);
  },true);
};
$('scratch-save').onclick = () => {
  const board = scratchBoard();
  const status = $('scratch-status');
  if (!scratchHasWork(board)) {
    status.textContent = 'Enter some scratch work first.';
    return;
  }
  try {
    const images = scratchImages(scratchMode,board);
    editScratch(()=>{
      state.scratch.archive.push({mode:scratchMode,board:JSON.parse(JSON.stringify(board)),images});
    });
    status.textContent = 'Scratch image saved with this worksheet.';
  } catch {
    status.textContent = 'The scratch image could not be saved. Try again.';
  }
};
$('scratch-clear').onclick = () => {
  editScratch(()=>{state.scratch.boards[scratchMode] = blankScratch(scratchBoard().width);},true);
  $('scratch-status').textContent = 'Scratch Pad cleared. Saved images are kept.';
};
function syncScratchPanel() {
  const card = $('scratch-card');
  const floating = !compactCards.matches && !scratchHidden && scratchZoom!=='normal';
  card.dataset.floating = String(floating);
  if (!floating) return;
  const bounds = $('workspace').getBoundingClientRect();
  const top = Math.max(12,Math.min(bounds.top+12,window.innerHeight*.14));
  card.style.setProperty('--scratch-panel-center',(bounds.left+bounds.width/2)+'px');
  card.style.setProperty('--scratch-panel-top',top+'px');
}
const scratchZoomLevels = ['normal','medium','large'];
function applyScratchZoom() {
  $('scratch-card').dataset.zoom = scratchZoom;
  syncScratchPanel();
  for (const size of scratchZoomLevels) {
    $('scratch-zoom-'+size).setAttribute('aria-pressed',String(size===scratchZoom));
  }
}
for (const size of scratchZoomLevels) {
  $('scratch-zoom-'+size).onclick = () => {
    scratchZoom = size;
    applyScratchZoom();
    const scroll = $('scratch-grid').parentElement;
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
    save();
  };
}
$('scratch-toggle').onclick = () => {
  scratchHidden = !scratchHidden;
  updateScratchVisibility();
  placeCards($('scratch-toggle'));
  save();
};
function updateScratchVisibility() {
  $('scratch-details').hidden = scratchHidden;
  syncScratchPanel();
  $('scratch-toggle').setAttribute('aria-expanded',String(!scratchHidden));
  $('scratch-toggle').setAttribute('aria-label',scratchHidden?'Show Scratch Pad':'Hide Scratch Pad');
}
$('scratch-card').addEventListener('keydown',event=>{
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase()==='z') {
    event.preventDefault();
    undoScratch();
  }
});
function makeWorksheetImage(title,rows,rules,crossed = [],bracket = false,carryRows = [],crossedRows = []) {
  const columns = rows[0].length;
  const cell = 32;
  const canvas = element('canvas');
  canvas.width = columns*cell+20;
  canvas.height = rows.length*cell+carryRows.filter(Boolean).length*16+38;
  const ctx = canvas.getContext('2d',{alpha:false});
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#151922';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(title,10,20,canvas.width-20);
  ctx.font = 'bold 17px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = 29;
  for (const [r,row] of rows.entries()) {
    if (carryRows[r]) {
      ctx.font = 'bold 11px monospace';
      ctx.strokeStyle = '#a5afbe';
      ctx.lineWidth = 1;
      carryRows[r].forEach((value,col)=>{
        if (value===null) return;
        const x = 10+col*16;
        ctx.strokeRect(x+.5,y+.5,15,15);
        ctx.fillText(value||'',x+8,y+8,14);
      });
      ctx.font = 'bold 17px monospace';
      y += 16;
    }
    for (const [c,value] of row.entries()) {
      const x = 10+c*cell;
      ctx.strokeStyle = '#a5afbe';
      ctx.lineWidth = 1;
      ctx.strokeRect(x+.5,y+.5,cell-1,cell-1);
      ctx.fillText(value,x+cell/2,y+cell/2,cell-4);
      if (crossedRows[r]?.[c] || r===1 && crossed[c]) {
        ctx.strokeStyle = '#151922';
        ctx.beginPath();
        ctx.moveTo(x+6,y+cell/2);
        ctx.lineTo(x+cell-6,y+cell/2);
        ctx.stroke();
      }
    }
    if (rules.includes(r)) {
      ctx.strokeStyle = '#151922';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const corner = bracket && r===0;
      ctx.moveTo(10+(corner?cell:0),y+cell);
      ctx.lineTo(10+columns*cell,y+cell);
      if (corner) {
        ctx.moveTo(10+cell,y+cell);
        ctx.quadraticCurveTo(10+cell+9,y+cell*1.5,10+cell,y+cell*2);
      }
      ctx.stroke();
    }
    y += cell;
  }
  return canvas.toDataURL('image/png');
}
function scratchImages(mode,board) {
  const images = [];
  for (let start=0;start<board.width;start+=16) {
    const end = Math.min(start+16,board.width);
    const title = board.width>16 ? 'Scratch Pad - '+scratchModes[mode]+' ('+(start+1)+'-'+end+')'
      : 'Scratch Pad - '+scratchModes[mode];
    const rows = scratchRows.map((row,index)=>[
      index===2?(mode==='subtract'?'−':'×'):'',
      ...board[row].slice(start,end)
    ]);
    images.push(makeWorksheetImage(title,rows,[2],[false,...board.crossed.slice(start,end)]));
  }
  return images;
}
function divisionImages(sheet) {
  const images = [];
  const work = sheet.rows.flatMap(row=>['product','result'].map(part=>({
    cells:Array.from({length:sheet.dividend.length+1},(_,col)=>gridValue(row,part,col-1)),
    rule:marked(row,part),
    carry:[null,null,...(row.carry?.[part]?.slice(2) || [])],
    crossed:[false,...(row.carryCross?.[part] || [])]
  })));
  const trailingCarry = sheet.rows.at(-1)?.carry?.after;
  if (trailingCarry?.some(Boolean)) work.push({
    cells:Array(sheet.dividend.length+1).fill(''),rule:false,carry:trailingCarry
  });
  while (work.length && !work.at(-1).cells.some(Boolean) && !work.at(-1).carry.some(Boolean)) work.pop();
  const columns = sheet.dividend.length+1;
  for (let start=0;start<columns;start+=18) {
    for (let first=0;first<Math.max(1,work.length);first+=18) {
      const end = Math.min(start+18,columns);
      const rows = [
        ['',...sheet.quotient].slice(start,end),
        [sheet.divisor,...sheet.dividend].slice(start,end)
      ];
      const rules = [0];
      const dividendCarry = sheet.rows[0]?.carry?.dividend || [];
      const carry = Array.from({length:(end-start)*2},(_,i)=>start*2+i<2?null:dividendCarry[start*2+i]||'');
      const carryRows = [null,carry.some(Boolean)?carry:null];
      const crossedRows = [null,[false,...(sheet.rows[0]?.carryCross?.dividend || [])].slice(start,end)];
      for (const line of work.slice(first,first+18)) {
        if (line.rule) rules.push(rows.length);
        rows.push(line.cells.slice(start,end));
        const carry = Array.from({length:(end-start)*2},(_,i)=>start*2+i<2?null:line.carry[start*2+i]||'');
        carryRows.push(carry.some(Boolean)?carry:null);
        crossedRows.push(line.crossed?.slice(start,end));
      }
      const title = 'Division Grid'+(sheet.remainder ? '   R '+sheet.remainder : '');
      images.push(makeWorksheetImage(title,rows,rules,[],start===0,carryRows,crossedRows));
    }
  }
  return images;
}
async function pdfImage(png) {
  const image = new Image();
  await new Promise((resolve,reject)=>{
    image.onload = resolve;
    image.onerror = reject;
    image.src = png;
  });
  const canvas = element('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d',{alpha:false});
  ctx.drawImage(image,0,0);
  const pixels = ctx.getImageData(0,0,image.width,image.height).data;
  const rgb = new Uint8Array(image.width*image.height*3);
  for (let i=0,j=0;i<pixels.length;i+=4,j+=3) {
    rgb[j] = pixels[i]; rgb[j+1] = pixels[i+1]; rgb[j+2] = pixels[i+2];
  }
  if (typeof CompressionStream==='undefined') return {width:image.width,height:image.height,bytes:rgb};
  const stream = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
  return {width:image.width,height:image.height,bytes:new Uint8Array(await new Response(stream).arrayBuffer()),compressed:true};
}
function worksheetDetailsImage(sheet,session) {
  const lines = [
    'Name: '+(session.name || '—'),
    'Date: '+(session.date || '—'),
    'Session duration: '+session.duration,
    'Dividend: '+sheet.dividend,
    'Divisor: '+sheet.divisor,
    'Quotient: '+sheet.quotient.join(''),
    'Remainder: '+sheet.remainder
  ];
  const canvas = element('canvas');
  canvas.width = 1040;
  canvas.height = lines.length*32;
  const ctx = canvas.getContext('2d',{alpha:false});
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#151922';
  ctx.font = '24px sans-serif';
  ctx.textBaseline = 'middle';
  lines.forEach((line,index)=>ctx.fillText(line,0,index*32+16,canvas.width));
  return canvas.toDataURL('image/png');
}
async function sessionImagePages(entries) {
  const pages = [];
  const session = {
    name:exerciseQueue?.mageName,
    date:exerciseQueue?.date,
    duration:formatSessionTime(sessionSeconds())
  };
  for (const [index,{worksheet:sheet,exerciseNumber}] of entries.entries()) {
    const details = await pdfImage(worksheetDetailsImage(sheet,session));
    const detailsHeight = details.height/2;
    const contentTop = 727-detailsHeight-12;
    let page;
    let y;
    function startPage() {
      page = {title:'Mathing - Exercise '+(exerciseNumber ?? index+1),items:[
        {image:details,x:44,y:727-detailsHeight,width:520,height:detailsHeight}
      ]};
      pages.push(page);
      y = contentTop;
    }
    startPage();
    const scratch = sheet.scratch;
    if (scratch) {
      const calculations = [...scratch.archive];
      for (const [mode,board] of Object.entries(scratch.boards)) {
        const alreadySaved = calculations.some(item=>item.mode===mode && JSON.stringify(item.board)===JSON.stringify(board));
        if (!alreadySaved && scratchHasWrittenWork(board)) calculations.push({mode,board});
      }
      for (const entry of calculations) {
        for (const png of entry.images || scratchImages(entry.mode,entry.board)) {
          const image = await pdfImage(png);
          const scale = Math.min(1,235/image.width,225/image.height);
          const width = image.width*scale;
          const height = image.height*scale;
          if (y-height<40) startPage();
          page.items.push({image,x:44,y:y-height,width,height});
          y -= height+14;
        }
      }
    }
    for (const png of divisionImages(sheet)) {
      const image = await pdfImage(png);
      const scale = Math.min(1.15,520/image.width,(contentTop-40)/image.height);
      const width = image.width*scale;
      const height = image.height*scale;
      if (y-height<40) startPage();
      page.items.push({image,x:(612-width)/2,y:y-height,width,height});
      y -= height+14;
    }
  }
  return pages;
}
function buildImagePdf(pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  const number = value=>value.toFixed(2);
  for (const {title,items} of pages) {
    const id = objects.length+1;
    kids.push(id+' 0 R');
    const commands = ['BT /F1 16 Tf 44 755 Td ('+title+') Tj ET'];
    const images = [];
    objects.push('','');
    for (const [i,{image,x,y,width,height}] of items.entries()) {
      const name = '/Im'+i;
      images.push(name+' '+(objects.length+1)+' 0 R');
      const header = '<< /Type /XObject /Subtype /Image /Width '+image.width+' /Height '+image.height+
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8'+(image.compressed?' /Filter /FlateDecode':'')+
        ' /Length '+image.bytes.length+' >>\nstream\n';
      objects.push([header,image.bytes,'\nendstream']);
      commands.push('q '+number(width)+' 0 0 '+number(height)+' '+number(x)+' '+number(y)+' cm '+name+' Do Q');
    }
    const content = commands.join('\n');
    objects[id-1] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << '+images.join(' ')+' >> >> /Contents '+(id+1)+' 0 R >>';
    objects[id] = '<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream';
  }
  objects[1] = '<< /Type /Pages /Count '+kids.length+' /Kids ['+kids.join(' ')+'] >>';
  const encoder = new TextEncoder();
  const chunks = [];
  let offset = 0;
  function append(value) {
    const bytes = typeof value==='string'?encoder.encode(value):value;
    chunks.push(bytes);
    offset += bytes.length;
  }
  append('%PDF-1.4\n');
  const offsets = objects.map((object,index)=>{
    const start = offset;
    append((index+1)+' 0 obj\n');
    for (const part of Array.isArray(object)?object:[object]) append(part);
    append('\nendobj\n');
    return String(start).padStart(10,'0')+' 00000 n \n';
  });
  const xref = offset;
  append('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.join('')
    +'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  return new Blob(chunks,{type:'application/pdf'});
}

$('download-info').onclick = () => {
  const note = $('download-note');
  note.hidden = !note.hidden;
  $('download-info').setAttribute('aria-expanded',String(!note.hidden));
};
$('download-pdf').onclick = async () => {
  if (!savedWork.length) return;
  const button = $('download-pdf');
  button.disabled = true;
  clearPreparedPdf();
  const entries = [...savedWork];
  try {
    const pdf = buildImagePdf(await sessionImagePages(entries));
    if (entries.length!==savedWork.length) return;
    preparedPdfUrl = URL.createObjectURL(pdf);
    const link = $('download-ready');
    link.href = preparedPdfUrl;
    link.download = 'Mathing-session-'+new Date().toISOString().slice(0,10)+'.pdf';
    link.hidden = false;
    link.click();
  } catch {
    $('session-count').textContent = 'The PDF could not be created. Try again.';
  } finally {
    button.disabled = !savedWork.length;
  }
};
const exerciseKey = sessionKey+'-exercises';
let exerciseQueue = null;
let passedCheck = null;
let readyToCheck = null;
try {
  const saved = JSON.parse(sessionStorage.getItem(exerciseKey) || 'null');
  if (saved?.items?.length && Number.isInteger(saved.index)) exerciseQueue = saved;
} catch {}
function storeExercises() {
  try { sessionStorage.setItem(exerciseKey,JSON.stringify(exerciseQueue)); } catch {}
}
function sessionComplete() {
  return Boolean(exerciseQueue && exerciseQueue.index>=exerciseQueue.items.length);
}
function answerKey() {
  return JSON.stringify([state.worksheetId,state.dividend,state.divisor,state.quotient,state.remainder]);
}
function canSaveExercise() {
  return passedCheck===answerKey();
}
function updateExerciseActions() {
  const key = answerKey();
  if (passedCheck!==null && passedCheck!==key) passedCheck = null;
  const canSave = canSaveExercise();
  if (readyToCheck!==null && readyToCheck!==key) readyToCheck = null;
  const hasProblem = Boolean(state.dividend && state.divisor);
  const canCheck = hasProblem && readyToCheck===key;
  $('save-work').disabled = !hasProblem;
  $('check-math').disabled = !canCheck;
  $('save-work').classList.toggle('is-next-action',hasProblem && !canCheck);
  $('check-math').classList.toggle('is-next-action',canCheck && !canSave);
  $('work-title').textContent = 'Exercise '+(exerciseQueue ? Math.min(exerciseQueue.index+1,exerciseQueue.items.length) : 1);
}

const exerciseDraft = [];
let startWithoutPlan = false;
function chooseExerciseMode(openEnded) {
  startWithoutPlan = openEnded;
  $('exercise-mode').hidden = true;
  $('exercise-setup').hidden = false;
  $('planned-fields').hidden = openEnded;
  $('planned-fields').disabled = openEnded;
  $('quick-start-actions').hidden = !openEnded;
  $('mage-name').focus();
}
$('plan-exercises').onclick = () => chooseExerciseMode(false);
$('start-now').onclick = () => chooseExerciseMode(true);
function showMathingHome() {
  $('long-division').hidden = true;
  $('mathing-home').hidden = false;
  $('open-long-division').focus();
}
$('close-exercise-setup').onclick = () => $('welcome-dialog').close();
$('open-long-division').onclick = () => {
  const today = new Date();
  today.setMinutes(today.getMinutes()-today.getTimezoneOffset());
  $('exercise-date').value = today.toISOString().slice(0,10);
  $('exercise-mode').hidden = false;
  $('exercise-setup').hidden = true;
  $('welcome-dialog').showModal();
  $('plan-exercises').focus();
};
const exerciseCount = $('exercise-count');
function renderExerciseInputs(count) {
  const fields = $('exercise-fields');
  fields.replaceChildren();
  for (let index=0;index<count;index++) {
    const values = exerciseDraft[index] ||= {dividend:'',divisor:''};
    const group = element('fieldset','exercise-fields');
    group.append(element('legend','','Exercise '+(index+1)));
    for (const [key,name,hint] of [
      ['dividend','Dividend','Number you’re dividing'],
      ['divisor','Divisor','Number you divide by']
    ]) {
      const label = element('label','',name);
      label.append(element('span','exercise-term-hint',hint));
      const input = element('input');
      input.id = 'plan-'+key+'-'+index;
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.value = values[key];
      input.required = true;
      input.pattern = key==='divisor'?'0*[1-9][0-9]*':'[0-9]+';
      input.addEventListener('input',()=>{values[key] = input.value;});
      label.append(input);
      group.append(label);
    }
    fields.append(group);
  }
  $('exercise-example').hidden = !count;
  $('exercise-actions').hidden = !count;
}
exerciseCount.onchange = () => renderExerciseInputs(Number(exerciseCount.value));
$('exercise-add').onclick = () => {
  const count = Number(exerciseCount.value)+1;
  if (![...exerciseCount.options].some(option=>option.value===String(count))) {
    const option = element('option','',String(count));
    option.value = String(count);
    exerciseCount.append(option);
  }
  exerciseCount.value = count;
  renderExerciseInputs(count);
  $('plan-dividend-'+(count-1)).focus();
};

function loadQueuedExercise(entry) {
  passedCheck = null;
  selectedStep = null;
  pendingSubtract = null;
  pinnedScrollTop = null;
  carryTarget = null;
  scratchGridTarget = null;
  lastWorkingRow = null;
  reviewQuotientColumn = null;
  state = problem(entry.dividend,entry.divisor);
  past = [];
  future = [];
  syncSetup();
  $('step-message').textContent = '';
  $('problem-message').textContent = '';
  save();
  render();
  $('scroller').scrollTo(0,0);
  $('work-viewport').scrollTop = 0;
}
$('exercise-setup').onsubmit = event => {
  event.preventDefault();
  const count = Number(exerciseCount.value);
  if (!startWithoutPlan && !count) return;
  const items = startWithoutPlan ? [{dividend:'',divisor:''}] : exerciseDraft.slice(0,count).map(({dividend,divisor})=>({
    dividend:dividend.replace(/^0+(?=\d)/,''),
    divisor:divisor.replace(/^0+/,'')
  }));
  if (!startWithoutPlan && items.some(({dividend,divisor})=>!/^\d+$/.test(dividend)||!/^[1-9]\d*$/.test(divisor))) return;
  const mageName = $('mage-name').value.trim();
  const date = $('exercise-date').value;
  if (!mageName || !date) return;
  exerciseQueue = {items,index:0,mageName,date,openEnded:startWithoutPlan};
  storeExercises();
  savedWork = [];
  sessionStarted = Date.now();
  clearPreparedPdf();
  try {
    sessionStorage.removeItem(sessionKey);
    sessionStorage.setItem(timerKey,String(sessionStarted));
  } catch {}
  updateSession();
  updateSessionTime();
  $('mathing-home').hidden = true;
  $('long-division').hidden = false;
  loadQueuedExercise(items[0]);
  $('welcome-dialog').close();
  $(startWithoutPlan?'grid-dividend':'work-title').focus({preventScroll:true});
};

function checkAnswer() {
  const {dividend,divisor,quotient,remainder} = state;
  const entered = quotient.map(value=>value||' ').join('').trim();
  const shownDividend = $('grid-dividend').value.trim().replace(/^0+(?=\d)/,'');
  const shownDivisor = $('grid-divisor').value.trim().replace(/^0+/,'');
  if (!dividend || !divisor || shownDividend!==dividend || shownDivisor!==divisor) {
    return {ok:false,detail:'Finish entering the dividend and divisor first.'};
  }
  if (!/^\d+$/.test(entered) || !/^\d+$/.test(remainder)) {
    return {ok:false,detail:'Enter a quotient and a remainder. If nothing is left, enter 0.'};
  }
  const total = BigInt(dividend);
  const divisorValue = BigInt(divisor);
  const quotientOK = BigInt(entered)===total/divisorValue;
  const remainderOK = BigInt(remainder)===total%divisorValue;
  const ok = quotientOK && remainderOK;
  return {ok,detail:ok ? '' : quotientOK ? 'Take another look at the remainder.'
    : remainderOK ? 'Take another look at the quotient.' : 'Take another look at the quotient and remainder.'};
}
function playCheckSound(correct) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    const audio = new Audio();
    const start = audio.currentTime;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = correct ? 1750 : 850;
    filter.connect(audio.destination);
    const notes = correct ? [392,494,587,784] : [267,208];
    for (const [index,hz] of notes.entries()) {
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      const time = start+index*(correct ? .125 : .24);
      const duration = correct ? (index===3 ? .34 : .14) : (index===0 ? .19 : .42);
      tone.type = 'sawtooth';
      tone.frequency.setValueAtTime(hz,time);
      if (!correct) tone.frequency.exponentialRampToValueAtTime(hz*.78,time+duration);
      volume.gain.setValueAtTime(.0001,time);
      volume.gain.exponentialRampToValueAtTime(correct ? .065 : .043,time+.035);
      volume.gain.exponentialRampToValueAtTime(.0001,time+duration);
      tone.connect(volume).connect(filter);
      tone.start(time);
      tone.stop(time+duration);
      if (index===notes.length-1) tone.onended = ()=>audio.close().catch(()=>{});
    }
    audio.resume().catch(()=>audio.close());
  } catch {}
}
const successMessages = ['Toot toot, your math is cute!', 'You got it, math astronaut!'];
let successMessageIndex = Math.floor(Math.random()*successMessages.length);
function openCheckDialog(outcome,detail = '') {
  const dialog = $('check-dialog');
  dialog.dataset.outcome = outcome;
  const correct = outcome==='correct';
  const complete = outcome==='complete';
  const next = outcome==='next';
  const canAdd = next && exerciseQueue?.openEnded && !sessionComplete();
  const last = next && !canAdd && (!exerciseQueue || exerciseQueue.index+1>=exerciseQueue.items.length);
  $('check-title').textContent = correct ? successMessages[successMessageIndex] : next ? (last?'Ready to finish?':'Ready for the next one?') :
    complete ? 'Brave warrior, you made it through!' : 'Oopsie-doodle, try again!';
  if (correct) successMessageIndex = (successMessageIndex+1)%successMessages.length;
  $('check-copy').textContent = correct ? 'Write down your quotient and remainder before moving on. You can also save this exercise to your PDF.'
    : complete ? 'You’re done for today!'
    : detail;
  $('check-data').hidden = !correct;
  if (correct) {
    $('check-quotient').textContent = $('answer').value;
    $('check-remainder').textContent = state.remainder;
  }
  $('check-face').hidden = outcome!=='wrong';
  $('check-copy').hidden = next && !detail;
  $('check-ok').hidden = next;
  $('check-save').hidden = !next;
  $('check-next-label').textContent = canAdd ? 'Add next exercise' : last ? 'Finish' : 'Onward!';
  $('finish-open-session').hidden = !canAdd;
  $('check-pdf-save').hidden = !correct;
  $('check-ok').textContent = complete ? 'Close' : 'OK';
  $('check-download').hidden = !(last || complete) || !savedWork.length;
  const party = $('check-party');
  party.replaceChildren();
  if (correct) {
    const colors = ['#f9cc5a','#ed8ebc','#5dc493','#8bc7fb','#bb9af3'];
    for (let index=0; index<72; index++) {
      const piece = element('span');
      piece.style.setProperty('--party-color',colors[index%colors.length]);
      piece.style.setProperty('--party-left',((index*37)%100)+'%');
      piece.style.setProperty('--party-delay',((index*17)%51)*.018+'s');
      piece.style.setProperty('--party-duration',(1.2+(index%9)*.09)+'s');
      piece.style.setProperty('--party-sway',((index*19)%121-60)+'px');
      party.append(piece);
    }
  }
  if (!dialog.open) dialog.showModal();
  $(next?'check-save':'check-ok').focus();
}
$('check-math').onclick = () => {
  if (!applyProblem() || readyToCheck!==answerKey()) return;
  const result = checkAnswer();
  passedCheck = result.ok ? answerKey() : null;
  updateExerciseActions();
  openCheckDialog(result.ok?'correct':'wrong',result.detail);
  playCheckSound(result.ok);
};
function dismissCheckDialog(detail = '') {
  const dialog = $('check-dialog');
  if (dialog.dataset.outcome==='correct') openCheckDialog('next',detail);
  else {
    const complete = dialog.dataset.outcome==='complete';
    dialog.close();
    if (complete) {
      exerciseDraft.length = 0;
      exerciseCount.value = '';
      renderExerciseInputs(0);
      showMathingHome();
    }
  }
}
$('check-ok').onclick = () => dismissCheckDialog();
$('check-dialog').addEventListener('cancel',event=>{
  if (!['correct','complete'].includes($('check-dialog').dataset.outcome)) return;
  event.preventDefault();
  dismissCheckDialog();
});
$('check-save').onclick = () => finishExercise();
$('finish-open-session').onclick = () => finishExercise(true);
$('check-pdf-save').onclick = () => {
  if (saveExerciseToPdf()) dismissCheckDialog('Saved to your session PDF.');
};
$('check-download').onclick = () => $('download-pdf').click();

updateSession();
updateSessionTime();
setInterval(updateSessionTime,1000);

applyDisplay();
applyScratchZoom();
updateScratchVisibility();
syncSetup();
render();
if (!exerciseQueue || sessionComplete()) showMathingHome();
if (typeof ResizeObserver!=='undefined') {
  new ResizeObserver(()=>{
    syncGridScrollSpace();
    syncPinView();
    syncScratchPanel();
  }).observe($('scroller'));
}
