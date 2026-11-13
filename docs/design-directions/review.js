const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const state = { direction: params.get('direction') === 'split' ? 'split' : 'fieldnotes', appearance: params.get('appearance') === 'dark' ? 'dark' : 'light', screen: params.get('screen') || 'today', toast: '', tab: 'meals', search: '', portion: 1, selectedDay: 2, picking: false, added: [], foods: [], quantities: [300,150,10], mealName: 'Chicken & rice', logs: {breakfast: {portion:1}}, activeSlot: 'snack', undo: null, extra: null, openChoice: null };
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 today:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-12 5 3 3 5-5"/>',
 week:'<path d="M5 20V11m7 9V4m7 16v-6"/>',
 library:'<path d="M4 5h6v15H4zm10 0h6v15h-6M4 9h6m4 0h6"/>',
 schedules:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="9" cy="18" r="2" fill="currentColor"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const btn = (label, action, cls='primary', attrs='') => `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
function header(title, eyebrow, back){return `<header class="app-header"><div>${back ? btn('‹ Back',back,'back') : `<span class="eyebrow">${eyebrow}</span>`}<h2>${title}</h2></div>${!back ? (title==='Today'?btn('Settings','settings','settings-link'):`<img class="header-mark" src="assets/quick-q-icon.svg" alt="Quick Calories">`):''}</header>`;}
function nav(){return `<nav class="tabs" aria-label="App navigation">${['today','week','library','schedules'].map(s=>`<button data-screen="${s}" class="${state.screen === s?'active':''}" ${state.screen === s?'aria-current="page"':''}>${icon(s)}${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}</nav>`;}
// Local sample-day model. These values never leave the review prototype.
const targets = {kcal:3800,c:638,p:164,f:66};
const slots = [
  {id:'breakfast',time:'09:00',name:'Breakfast',recipe:'Base breakfast',kcal:726,c:105,p:43,f:13},
  {id:'snack',time:'11:30',name:'Pre-lunch snack',recipe:'Banana + apple',kcal:294,c:75,p:3,f:1},
  {id:'lunch',time:'13:00',name:'Lunch',recipe:'Lunch box',kcal:683,c:90,p:45,f:14},
  {id:'dinner',time:'18:30',name:'Dinner',recipe:'Open meal',open:true},
  {id:'evening',time:'20:00',name:'Evening snack',recipe:'Skyr + granola',kcal:474,c:62,p:33,f:10},
];
function dayTotals() {
  const eaten={kcal:0,c:0,p:0,f:0}, planned={kcal:0,c:0,p:0,f:0};
  for (const slot of slots) {
    const log=state.logs[slot.id];
    if (slot.open && !log) continue;
    const source=slot.open?log.choice:slot;
    for (const key of Object.keys(targets)) (log?eaten:planned)[key] += source[key]*(log?log.portion:1);
  }
  if(state.extra)for(const key of Object.keys(targets))eaten[key]+=state.extra.choice[key]*state.extra.portion;
  const remaining={}, projected={};
  for(const key of Object.keys(targets)){projected[key]=eaten[key]+planned[key];remaining[key]=targets[key]-projected[key];}
  return {eaten,planned,remaining,projected};
}
function nextMeal() {
  const next=slots.find(s=>!s.open&&!state.logs[s.id]);
  if(!next)return `<section class="next-meal"><div class="eyebrow">All planned meals logged</div><h3>Your plan is up to date.</h3><p>Open any meal below to make a change.</p></section>`;
  return `<section class="next-meal"><div class="row"><span class="eyebrow">${next.time<='12:10'?'Ready to log':'Up next'}</span><span class="small muted">${next.time}</span></div><h3>${next.name}</h3><p>${next.recipe} · ${next.kcal} kcal</p><div class="actions">${btn('✓ Ate as planned','confirm','primary',`data-slot="${next.id}"`)}${btn('Adjust','open-slot','plain',`data-slot="${next.id}"`)}</div></section>`;
}
function summary() {
  const d=dayTotals(), remaining=d.remaining.kcal;
  return `<section class="daily-budget" aria-label="Available today after planned meals">
    <div class="row"><h3>Available today</h3>${btn('+ Log food','extra','plain')}</div>
    <div class="budget-value numeral">${fmt(Math.abs(remaining))}<span> kcal${remaining<0?' over target':''}</span></div>
    <p class="budget-caption">${remaining<0?'Eaten and planned meals exceed your target.':'After your planned meals'}</p>
    <div class="remaining-macros">${[['Carbs','c'],['Protein','p'],['Fat','f']].map(([name,key])=>`<div><span>${name}</span><strong class="numeral">${fmt(Math.abs(d.remaining[key]))}<small> g${d.remaining[key]<0?' over':' left'}</small></strong></div>`).join('')}</div>
    <div class="budget-track" role="img" aria-label="${fmt(d.eaten.kcal)} kcal eaten, ${fmt(d.planned.kcal)} still planned, ${fmt(remaining)} available, ${targets.kcal} target"><span class="consumed-segment" style="width:${Math.min(100,d.eaten.kcal/38)}%"></span><span class="planned-segment" style="width:${Math.max(0,Math.min(100-d.eaten.kcal/38,d.planned.kcal/38))}%"></span></div>
    <div class="budget-ledger"><span><i class="eaten-dot"></i><b>${fmt(d.eaten.kcal)}</b> eaten</span><span><i class="planned-dot"></i><b>${fmt(d.planned.kcal)}</b> planned</span><span><b>3,800</b> target</span></div>
    <details class="day-details"><summary>Day details</summary><div class="macro-progress-list">${[['Carbs','c'],['Protein','p'],['Fat','f']].map(([name,key])=>{
      const scale=Math.max(targets[key],d.projected[key])*1.04;
      return `<section class="macro-progress macro-${key}"><div class="row"><strong>${name}</strong><span>${targets[key]} g target</span></div><div class="macro-track" role="img" aria-label="${name}: ${fmt(d.eaten[key])} grams eaten, ${fmt(d.planned[key])} grams still planned, ${targets[key]} grams target"><span class="macro-planned" style="width:${d.projected[key]/scale*100}%"></span><span class="macro-eaten" style="width:${d.eaten[key]/scale*100}%"></span><span class="macro-target" style="left:${targets[key]/scale*100}%"></span></div><div class="macro-track-labels"><span><i class="solid-key"></i>${fmt(d.eaten[key])} g eaten</span><span><i class="soft-key"></i>${fmt(d.planned[key])} g planned</span>${d.remaining[key]<0?`<span>${fmt(-d.remaining[key])} g over</span>`:''}</div></section>`;
    }).join('')}</div><p>${fmt(d.projected.kcal)} kcal projected. Target includes +200 kcal from earlier days; it is fixed for today.</p></details>
  </section>`;
}
function today() {
  return header('Today','Wednesday 11 Nov · Q4 training')+`<div class="content">${state.toast?`<div class="toast" role="status">${escape(state.toast)}${state.undo?btn('Undo','undo',''):''}</div>`:''}${nextMeal()}${summary()}
    <div class="section-heading"><h3>Your day</h3><span class="small muted">${Object.keys(state.logs).length} of 5 logged</span></div>
    ${slots.map(slot=>{const log=state.logs[slot.id];return `<button class="timeline-row slot-link" data-action="open-slot" data-slot="${slot.id}" aria-label="${log?'Edit':'Log'} ${slot.name}"><time>${slot.time}</time><span class="grow"><strong>${slot.name}</strong><small>${log&&slot.open?escape(log.choice.name):slot.recipe}</small></span><span class="state">${log?'✓ Logged':slot.open?'Log meal':'Planned'} <span aria-hidden="true">›</span></span></button>`;}).join('')}
    ${state.extra?`<button class="timeline-row slot-link" data-action="extra"><time>12:10</time><span class="grow"><strong>Extra food</strong><small>${escape(state.extra.choice.name)}</small></span><span class="state">✓ Logged ›</span></button>`:''}</div>`+nav();
}
function rememberDay(){state.undo={logs:structuredClone(state.logs),extra:structuredClone(state.extra)};}
function saveSlot(id,portion,choice) {
  rememberDay();
  if(id==='extra')state.extra={portion,choice};else state.logs[id]={portion,...(choice?{choice}:{})};
  const slot=slots.find(s=>s.id===id);
  state.toast=`${slot?slot.name:'Extra food'} logged · ${fmt((choice||slot).kcal*portion)} kcal`;
  state.screen='today';render();
}
function openSlot(id) {
  state.activeSlot=id;
  const existing=id==='extra'?state.extra:state.logs[id];
  state.portion=existing?.portion||1;
  state.openChoice=existing?.choice||null;
  navigate('log-slot');
}
function activeEntry(){return state.openChoice||slots.find(s=>s.id===state.activeSlot);}
function afterLogging() {
  const d=dayTotals(), slot=slots.find(s=>s.id===state.activeSlot);
  const existing=state.activeSlot==='extra'?state.extra:state.logs[state.activeSlot];
  const old=existing?(existing.choice||slot).kcal*existing.portion:(slot&&!slot.open?slot.kcal:0);
  return d.remaining.kcal+old-activeEntry().kcal*state.portion;
}
function logSlot() {
  const slot=slots.find(s=>s.id===state.activeSlot), open=!slot||slot.open;
  const title=slot?slot.name:'Extra food';
  let body='';
  if(open&&!state.openChoice){
    body=`<div class="notice">${fmt(dayTotals().remaining.kcal)} kcal available after planned meals.</div><h3 class="small">Choose a saved meal or food</h3>${[...meals,...state.foods,...foods].filter(f=>['c','p','f'].every(k=>Number.isFinite(f[k]))).map(f=>`<div class="library-item"><span class="grow"><strong>${escape(f.name)}</strong><small>${escape(f.detail)}</small></span><span class="value">${f.kcal}</span>${btn('+','choose-log-food','icon-button',`data-name="${escape(f.name)}" aria-label="Choose ${escape(f.name)}"`)}</div>`).join('')}`;
  }else{
    const entry=activeEntry();
    body=`<div class="eyebrow">${slot?slot.time+' · ':''}${escape(entry.name||entry.recipe)}</div><div class="meal-total"><b class="numeral" id="adjust-total">${fmt(entry.kcal*state.portion)}</b> kcal<div class="macro-inline" id="logging-macros">Carbs ${fmt(entry.c*state.portion)} g / Protein ${fmt(entry.p*state.portion)} g / Fat ${fmt(entry.f*state.portion)} g</div></div><label for="portion">${open?'Servings / reference amounts':'Portion of the planned meal'}</label><div class="quantity">${btn('−','less','', 'aria-label="Decrease portion"')}<input id="portion" aria-label="Portion multiplier" type="number" min="0.1" max="10" step="0.1" value="${state.portion}"><span>×</span>${btn('+','more','', 'aria-label="Increase portion"')}</div><div class="notice">Available after this: <b id="adjust-budget">${fmt(afterLogging())}</b> kcal<br>Other planned meals remain reserved.</div>${btn('Save what I ate','save-log','primary full')}${open?btn('Choose another food','clear-choice','plain full'):''}<p class="small muted">Changes apply to today only.</p>`;
  }
  return header(title,'','today')+`<div class="content">${body}</div>`;
}
const meals = [{name:'Base breakfast',detail:'Oats, skyr, banana · 1 serving',kcal:726,letter:'B',c:105,p:43,f:13}, {name:'Lunch box',detail:'Your weekday staple · 1 serving',kcal:683,letter:'L',c:90,p:45,f:14}, {name:'Salmon & potatoes',detail:'Family dinner · 1 serving',kcal:824,letter:'S',c:96,p:47,f:28}, {name:'Evening snack',detail:'Skyr + granola · 1 serving',kcal:474,letter:'E',c:62,p:33,f:10}];
const originalMeals = meals.map(m => ({...m}));
const foods = [{name:'Banana',detail:'Per piece · C 27 · P 1.3 · F 0.4',kcal:107,letter:'B',c:27,p:1.3,f:.4}, {name:'Apple',detail:'Per piece · C 21 · P 0.4 · F 0.2',kcal:80,letter:'A',c:21,p:.4,f:.2}, {name:'Oats',detail:'Per 100 g · C 60 · P 13 · F 7',kcal:370,letter:'O',c:60,p:13,f:7}, {name:'Skyr natural',detail:'Per 100 g · C 4 · P 11 · F 0.2',kcal:63,letter:'S',c:4,p:11,f:.2}, {name:'Rice, cooked',detail:'Per 100 g · C 28 · P 2.7 · F 0.3',kcal:130,letter:'R',c:28,p:2.7,f:.3}];
function libraryRows(){let data = state.tab==='meals'?meals:[...state.foods,...foods];data=data.filter(f=>f.name.toLowerCase().includes(state.search.toLowerCase()));return data.length?data.map(f=>`<div class="library-item"><span class="initial" aria-hidden="true">${escape(f.letter)}</span><div class="grow"><strong>${escape(f.name)}</strong><small>${escape(f.detail)}</small></div><div class="value numeral">${f.kcal}<small>kcal</small></div>${btn(state.picking?'+':'↗',state.picking?'pick-item':'edit-item','icon-button',`aria-label="${state.picking?'Add':'Open'} ${escape(f.name)}" data-name="${escape(f.name)}" data-kcal="${f.kcal}"`)}</div>`).join(''):`<div class="notice">No matches. ${btn('Create this food →','food','plain')}</div>`;}
function library(){return header(state.picking?'Add an ingredient':'Your library', 'Made by you. Ready to repeat.',state.picking?'meal':null)+`<div class="content">${state.toast?`<div class="notice" role="status">${escape(state.toast)}</div>`:''}<input class="search" id="search" type="search" placeholder="Search your ${state.tab}" aria-label="Search your library" value="${escape(state.search)}"><div class="segments" aria-label="Library type" ${state.picking?'hidden':''}><button class="${state.tab==='meals'?'selected':''}" data-tab="meals" aria-pressed="${state.tab==='meals'}">Meals</button><button class="${state.tab==='foods'?'selected':''}" data-tab="foods" aria-pressed="${state.tab==='foods'}">Foods</button></div><div class="row"><span class="eyebrow">${state.search?'Search results':'Your staples'}</span>${btn('+ '+(state.tab==='meals'?'Meal':'Food'),state.tab==='meals'?'meal':'food','plain')}</div><div id="library-rows">${libraryRows()}</div><div class="notice">Your meals and foods, ready whenever you need them.</div></div>`+nav();}
const ingredients=[{name:'Rice, cooked',factor:1.3,c:.28,p:.027,f:.003},{name:'Chicken breast',factor:1.1,c:0,p:.23,f:.015},{name:'Olive oil',factor:8.8,c:0,p:0,f:1}];
function mealNutrition(){return ingredients.reduce((v,i,k)=>({kcal:v.kcal+i.factor*state.quantities[k],c:v.c+i.c*state.quantities[k],p:v.p+i.p*state.quantities[k],f:v.f+i.f*state.quantities[k]}),{kcal:state.added.reduce((v,i)=>v+i.kcal,0),c:state.added.reduce((v,i)=>v+(i.c||0),0),p:state.added.reduce((v,i)=>v+(i.p||0),0),f:state.added.reduce((v,i)=>v+(i.f||0),0)});}
function meal(){let n=mealNutrition();return header('Build a meal','', 'library')+`<div class="content"><label for="meal-name">Meal name</label><input id="meal-name" value="${escape(state.mealName)}" autocomplete="off"><div class="meal-total"><span class="eyebrow">Whole meal</span><br><b class="numeral" id="recipe-kcal">${fmt(n.kcal)}</b> kcal<div class="macro-inline" id="recipe-macros">Carbs ${fmt(n.c)} g / Protein ${fmt(n.p)} g / Fat ${fmt(n.f)} g</div></div><div class="section-heading"><h3>Ingredients</h3><span class="small muted">${3+state.added.length} foods</span></div>${ingredients.map((item,i)=>`<div class="ingredient"><div class="row"><div><strong>${item.name}</strong><div class="small muted" style="margin-top:7px"><span id="ingredient-kcal-${i}">${fmt(item.factor*state.quantities[i])}</span> kcal</div></div><div class="row"><input class="ingredient-quantity" data-quantity="${i}" aria-label="${item.name} grams" type="number" min="0" step="1" value="${state.quantities[i]}"><span class="small muted">g</span></div></div></div>`).join('')}${state.added.map(f=>`<div class="ingredient"><div class="row"><strong>${escape(f.name)}</strong><small>${f.kcal} kcal</small></div><div class="small muted">1 reference amount</div></div>`).join('')}${btn('+ Add ingredient','pick','secondary full')}${btn('Save meal to library','save-meal','primary full')}<p class="small muted">Saving a recipe won’t log it as eaten.</p></div>`;}

function food() {
  const input=(id,name,unit,placeholder='0')=>`<div class="unit-input"><input id="${id}" name="${name}" type="number" min="0" step="any" placeholder="${placeholder}" required><span>${unit}</span></div>`;
  return header('New food','','library')+`<div class="content"><form id="food-form" class="original-food-layout">
    <label for="food-name">Name</label><input id="food-name" name="name" required placeholder="Oats" value="${escape(state.search)}" maxlength="80">
    <label id="measured-label">Measured in</label><div class="unit-segments" role="group" aria-labelledby="measured-label">${['g','ml','piece','slice','serving'].map(u=>`<button type="button" data-unit="${u}" aria-pressed="${u==='g'}">${u}</button>`).join('')}</div><input type="hidden" name="unit" id="unit" value="g">
    <label for="amount">Values below are per</label><div class="unit-input"><input id="amount" name="amount" type="number" min="0.1" step="any" value="100" required><span id="amount-unit">g</span></div>
    <section class="food-nutrition"><div class="eyebrow" id="per-label">Per 100 g</div><label for="kcal">Calories</label>${input('kcal','kcal','kcal','')}
    <div class="original-macro-row">${['Carbs','Protein','Fat'].map(n=>`<div><label for="${n}">${n}</label>${input(n,n,'g')}</div>`).join('')}</div>
    <div id="macro-hint" class="macro-hint" role="status" hidden><span id="macro-hint-text"></span><button type="button" class="secondary" data-action="use-macro-kcal" id="use-macro-kcal"></button></div></section>
    <button class="primary full" type="submit">${state.picking?'Add food & use in meal':'Add food'}</button>
  </form></div>`;
}
function updateFoodHint(){
  $('#per-label').textContent=`Per ${$('#amount').value||'…'} ${$('#unit').value}`;
  const values=['Carbs','Protein','Fat'].map(n=>$('#'+n).value);
  const total=Math.round(Number(values[0])*4+Number(values[1])*4+Number(values[2])*9);
  const show=values.every(v=>v!=='')&&total>0&&($('#kcal').value===''||Math.abs(Number($('#kcal').value)-total)>Math.max(10,total*.1));
  $('#macro-hint').hidden=!show;
  $('#macro-hint-text').textContent=`These macros add up to about ${fmt(total)} kcal.`;
  $('#use-macro-kcal').textContent=`Use ${fmt(total)}`;
  $('#use-macro-kcal').dataset.kcal=total;
}
function week(){return header('This week','9–15 November · Q4 training')+`<div class="content"><div class="meal-total"><span class="eyebrow">Balance · completed days</span><br><b class="numeral">−400</b> kcal<div class="macro-inline">Below plan · being added to future targets</div></div><div class="notice">Today is fixed at 3,800 kcal. Future targets are previews.</div>${[['Mon','3,300 eaten','3,500 target',83],['Tue','3,750 eaten','3,950 target',94],['Wed',fmt(dayTotals().eaten.kcal)+' eaten','3,800 target',95],['Thu','3,800 plan','3,900 preview',98],['Fri','3,300 plan','3,400 preview',85],['Sat','3,100 plan','3,100 preview',78],['Sun','3,100 plan','3,100 preview',78]].map(([d,e,t,w],i)=>`<div class="week-row ${i===2?'today':''}"><div class="row"><strong>${d}</strong><span class="muted">${e}</span><span>${t}</span></div><div class="track" aria-label="${d}: ${e}; ${t}"><div class="bar" style="width:${w}%"></div></div></div>`).join('')}<p class="small muted">Body weight this week: 82.0 kg<br>Last week's Apple Health average</p></div>`+nav();}
function schedules(){let names=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];let cals=[3500,3950,3600,3800,3300,3100,3100];return header('Schedules','A plan for the way you eat')+`<div class="content"><section class="schedule-card"><span class="eyebrow">● Active schedule</span><h3>Q4 training</h3><p class="small muted">7 days · Maintain weekly balance</p><div class="schedule-days">${['M','T','W','T','F','S','S'].map((d,i)=>`<button data-day="${i}" class="${state.selectedDay===i?'selected':''}" aria-label="${names[i]}" aria-pressed="${state.selectedDay===i}">${d}</button>`).join('')}</div></section><div class="row"><h3 style="font-size:19px">${names[state.selectedDay]}</h3><b class="numeral">${fmt(cals[state.selectedDay])} kcal</b></div>${[['09:00','Breakfast','Base breakfast'],['11:30','Snack','Banana + apple'],['13:00','Lunch','Lunch box'],['18:30','Dinner','Open meal'],['20:00','Evening snack','Skyr + granola']].map(([t,n,d])=>`<div class="timeline-row"><time>${t}</time><div class="grow"><strong>${n}</strong><small>${d}</small></div></div>`).join('')}<details class="small" style="padding:20px 0"><summary>Weekly distribution</summary><p>Maintenance · no planned deficit or surplus. Detailed editing would open a focused native screen.</p></details><section class="schedule-card"><span class="eyebrow">Other schedules</span><h3>Holiday</h3><p class="small muted">7 days · Flexible meals</p></section></div>`+nav();}
function settings(){
  const group=(name,rows)=>`<section class="settings-group"><h3>${name}</h3><dl>${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></section>`;
  return header('Settings','','today')+`<div class="content settings-preview"><p class="small muted">Design preview · sample settings shown for reference.</p>
    ${group('Macro targets',[['Protein target / floor','2.0 / 1.6 g/kg'],['Fat target / floor','0.8 / 0.8 g/kg'],['Carb floor','4.0 g/kg']])}
    ${group('Weekly corrections',[['Maximum daily change','15%'],['Fallback body weight','82 kg']])}
    ${group('Reminders',[['Evening reminder','21:00'],['Next-morning reminder','08:00'],['Meal reminders','At each slot’s time']])}
    ${group('Apple Health',[['Weight access','Read-only'],['Weight used','Previous week’s average']])}
    ${group('Account',[['Account & sign out','In the connected app']])}
    <p class="small muted">Editing, permissions and sign-out remain in the app’s existing Settings screen.</p></div>`;
}
function render(){if(!['today','library','meal','food','week','schedules','settings','log-slot'].includes(state.screen))state.screen='today';$('#phone').className=`phone ${state.direction} ${state.appearance}`;$('#app').innerHTML=({today,library,meal,food,week,schedules,settings,'log-slot':logSlot})[state.screen]();$('#direction').value=state.direction;$('#appearance').value=state.appearance;$('#screen').value=['log-slot'].includes(state.screen)?'today':state.screen;const split=state.direction==='split';$('#direction-number').textContent=split?'DIRECTION 02':'DIRECTION 01';$('#direction-title').textContent=split?'Split':'Fieldnotes';$('#direction-description').textContent=split?'A precise instrument for a training day. Strong alignment, measured contrast, and one clear signal for the next action.':'The quiet confidence of a well-used notebook. Warm paper, evergreen ink, and a daily rhythm you can see at a glance.';$('#character').textContent=split?'Direct. Athletic. Exact.':'Warm. Personal. Deliberate.';$('#priority').textContent=split?'Confirm the next meal. Read the numbers. Move on.':'Confirm your plan. See what is still available.';$('#swatches').innerHTML=(split?['#1d2027','#d8ee4b','#f3f4f6']:['#2c5540','#a4b69a','#f8f6ef']).map(c=>`<span style="background:${c}"></span>`).join('');}
function navigate(screen){state.screen=screen;state.toast='';state.undo=null;render();}
$('#direction').addEventListener('change', e=>{state.direction=e.target.value;render();});
$('#appearance').addEventListener('change', e=>{state.appearance=e.target.value;render();});
$('#screen').addEventListener('change', e=>{state.picking=false;navigate(e.target.value);});
$('#reset').addEventListener('click',()=>{meals.splice(0,meals.length,...originalMeals.map(m=>({...m})));Object.assign(state,{screen:'today',portion:1,toast:'',added:[],foods:[],search:'',picking:false,quantities:[300,150,10],mealName:'Chicken & rice',logs:{breakfast:{portion:1}},extra:null,undo:null,openChoice:null,activeSlot:'snack'});render();});
$('#app').addEventListener('input', e=>{if(e.target.id==='meal-name')state.mealName=e.target.value;if(e.target.dataset.quantity!==undefined){const i=Number(e.target.dataset.quantity);state.quantities[i]=Math.max(0,Number(e.target.value)||0);const n=mealNutrition();$('#recipe-kcal').textContent=fmt(n.kcal);$('#recipe-macros').textContent=`Carbs ${fmt(n.c)} g / Protein ${fmt(n.p)} g / Fat ${fmt(n.f)} g`;$('#ingredient-kcal-'+i).textContent=fmt(ingredients[i].factor*state.quantities[i]);}if(e.target.id==='search'){state.search=e.target.value;$('#library-rows').innerHTML=libraryRows();}if(e.target.closest('#food-form'))updateFoodHint();if(e.target.id==='portion'){state.portion=Math.min(10,Math.max(.1,Number(e.target.value)||.1));const entry=activeEntry();$('#adjust-total').textContent=fmt(entry.kcal*state.portion);$('#adjust-budget').textContent=fmt(afterLogging());$('#logging-macros').textContent=`Carbs ${fmt(entry.c*state.portion)} g / Protein ${fmt(entry.p*state.portion)} g / Fat ${fmt(entry.f*state.portion)} g`;}});

$('#app').addEventListener('submit',e=>{if(e.target.id!=='food-form')return;e.preventDefault();const f=new FormData(e.target);const name=f.get('name').trim();if(!name)return;const item={name,kcal:Number(f.get('kcal')),detail:`Per ${f.get('amount')} ${f.get('unit')} · C ${f.get('Carbs')} · P ${f.get('Protein')} · F ${f.get('Fat')}`,letter:name[0].toUpperCase(),c:Number(f.get('Carbs')),p:Number(f.get('Protein')),f:Number(f.get('Fat'))};state.foods.unshift(item);state.search='';state.tab='foods';if(state.picking){state.added.push(item);state.picking=false;state.screen='meal';}else{state.screen='library';state.toast='Saved to your library';}render();});
$('#app').addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;if(el.dataset.screen){state.picking=false;navigate(el.dataset.screen);return;}if(el.dataset.tab){state.tab=el.dataset.tab;state.search='';render();return;}if(el.dataset.day){state.selectedDay=Number(el.dataset.day);render();return;}if(el.dataset.unit){const old=$('#unit').value,next=el.dataset.unit;const defaultAmount=u=>['g','ml'].includes(u)?100:1;if(Number($('#amount').value)===defaultAmount(old))$('#amount').value=defaultAmount(next);$('#unit').value=next;$('#amount-unit').textContent=next;document.querySelectorAll('[data-unit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.unit===next)));updateFoodHint();return;}
const action=el.dataset.action;
if(action==='confirm'){saveSlot(el.dataset.slot,1);}
else if(action==='undo'){if(state.undo){state.logs=state.undo.logs;state.extra=state.undo.extra;}state.undo=null;state.toast='';render();}
else if(action==='open-slot'){openSlot(el.dataset.slot);}
else if(action==='extra'){openSlot('extra');}
else if(action==='choose-log-food'){state.openChoice=[...meals,...state.foods,...foods].find(f=>f.name===el.dataset.name);state.portion=1;render();}
else if(action==='clear-choice'){state.openChoice=null;render();}
else if(action==='less'||action==='more'){state.portion=Math.round(Math.min(10,Math.max(.1,state.portion+(action==='more'?.1:-.1)))*10)/10;render();}
else if(action==='save-log'){saveSlot(state.activeSlot,state.portion,state.openChoice);}
else if(action==='use-macro-kcal'){$('#kcal').value=el.dataset.kcal;updateFoodHint();}
else if(action==='pick'){state.picking=true;state.tab='foods';state.search='';navigate('library');}else if(action==='pick-item'){state.added.push([...state.foods,...foods].find(f=>f.name===el.dataset.name)||{name:el.dataset.name,kcal:Number(el.dataset.kcal)});state.picking=false;navigate('meal');}else if(action==='edit-item'){state.toast=`${el.dataset.name} · This study demonstrates creation; existing-item editing stays in the current app.`;render();}else if(action==='save-meal'){let name=$('#meal-name').value.trim()||'Chicken & rice';meals.unshift({name,detail:'Your recipe · 1 serving',kcal:Math.round(mealNutrition().kcal),c:mealNutrition().c,p:mealNutrition().p,f:mealNutrition().f,letter:name[0].toUpperCase()});state.added=[];state.quantities=[300,150,10];state.mealName='Chicken & rice';state.tab='meals';state.search='';state.screen='library';state.toast='Meal saved to your library';render();}else if(['today','library','meal','food','settings'].includes(action)){navigate(action);}});
const identities=[['quick-q','01 / Quick Q','An open Q, with a small forward move. Quiet, recognisable, and at home in Fieldnotes.'],['split-lanes','02 / Split lanes','Parallel tracks turning forward. The rhythm of a repeat meal; the precision of a training tool.'],['daily-tally','03 / Daily tally','Two entries and a check. A direct expression of the app’s most useful action: done.']];
$('#identity-grid').innerHTML=identities.map(([id,title,description])=>`<article class="identity-card"><img class="logo" src="assets/${id}-logo.svg" alt="${title} Quick Calories logo"><div class="icon-sizes"><img src="assets/${id}-icon.svg" alt="${title} app icon"><img src="assets/${id}-icon.svg" alt="48 pixel icon preview"><img src="assets/${id}-icon.svg" alt="24 pixel icon preview"></div><h3>${title}</h3><p>${description}</p><a href="assets/${id}-icon.svg">App icon master ↗</a> &nbsp; <a href="assets/${id}-logo.svg">Logo ↗</a></article>`).join('');
render();
