import { mountBinaryOcean } from './binary-ocean.js';
const root = document.querySelector('[data-live-observatory]');
if (root) {
  let records = JSON.parse(root.dataset.records || '[]');
  let milestones = JSON.parse(root.dataset.milestones || '[]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = root.querySelector('[data-observatory-canvas]');
  const fallbackCanvas = root.querySelector('[data-observatory-fallback]');
  const state = root.querySelector('[data-observatory-state]');
  const motionButton = root.querySelector('[data-observatory-motion]');
  mountBinaryOcean({canvas, fallbackCanvas, state, motionButton});
  const nodeButtons=[...root.querySelectorAll('[data-network-node]')];
  const detail=root.querySelector('[data-network-detail]');
  const selectNode=button=>{
    nodeButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    const record=records.find(item=>item.id===button.dataset.networkNode);if(!record||!detail)return;
    const allowed=new Set([record.id,...(button.dataset.links||'').split('|').filter(Boolean)]);
    root.querySelectorAll('[data-dot]').forEach(dot=>dot.classList.toggle('is-active',allowed.has(dot.dataset.dot)));
    root.querySelectorAll('.network-edges line').forEach(line=>line.classList.toggle('is-active',line.dataset.edge.split(' ').every(id=>allowed.has(id))));
    const title=detail.querySelector('h3'),eyebrow=detail.querySelector('.eyebrow'),copy=detail.querySelector('p:not(.eyebrow)'),link=detail.querySelector('a');
    if(title)title.textContent=record.title;if(eyebrow)eyebrow.textContent=record.researchArea||'Approved research record';if(copy)copy.textContent=record.summary;if(link){link.href=`/live/experiments/${encodeURIComponent(record.id)}/`;link.textContent='Read the approved evidence →';}
  };
  nodeButtons.forEach(button=>button.addEventListener('click',()=>selectNode(button)));
  if(nodeButtons[0])selectNode(nodeButtons[0]);
  root.querySelectorAll('[data-observatory-anchor]').forEach(button=>button.addEventListener('click',()=>{const target=root.querySelector(`[data-network-node="${CSS.escape(button.dataset.observatoryAnchor)}"]`);if(target){target.click();root.querySelector('#live-network')?.scrollIntoView({behavior:reduced.matches?'auto':'smooth',block:'start'});}}));

  let recapIndex=0, recapTimer=0;
  const recapTitle=root.querySelector('[data-recap-title]'),recapLink=root.querySelector('[data-recap-link]'),recapSummary=root.querySelector('[data-recap-summary]'),recapLimits=root.querySelector('[data-recap-limits]'),recapCount=root.querySelector('[data-recap-count]'),recapUpdate=root.querySelector('[data-recap-update]');
  const visitKey='lari-live-last-seen-v1';
  let prior=0,hasNewSinceVisit=false;try{prior=Number(localStorage.getItem(visitKey)||0);localStorage.setItem(visitKey,String(Date.now()));}catch{}
  const renderRecap=()=>{if(!records.length)return;const row=records[recapIndex%records.length];if(recapTitle)recapTitle.textContent=hasNewSinceVisit?'Since your last visit':'The story so far';if(recapLink){recapLink.href=`/live/experiments/${encodeURIComponent(row.id)}/`;recapLink.textContent=`${row.title} ↗`;}if(recapSummary)recapSummary.textContent=row.summary;if(recapLimits)recapLimits.textContent=row.limitations||'No additional limitation supplied.';if(recapCount)recapCount.textContent=`${String((recapIndex%records.length)+1).padStart(2,'0')} / ${String(records.length).padStart(2,'0')}`;};
  if(prior){const newer=records.filter(row=>Date.parse(row.publishedAt||'')>prior);if(newer.length){hasNewSinceVisit=true;recapIndex=records.indexOf(newer[0]);if(recapUpdate)recapUpdate.textContent=`${newer.length} approved record${newer.length===1?'':'s'} published since your previous visit, based on this browser’s saved timestamp.`;}else if(recapUpdate)recapUpdate.textContent='No approved records have been published since your previous visit. Showing the approved story so far.';}
  renderRecap();
  const shift=delta=>{if(!records.length)return;recapIndex=(recapIndex+delta+records.length)%records.length;renderRecap();};
  root.querySelector('[data-recap-prev]')?.addEventListener('click',()=>shift(-1));root.querySelector('[data-recap-next]')?.addEventListener('click',()=>shift(1));
  root.querySelector('[data-recap-replay]')?.addEventListener('click',()=>{clearInterval(recapTimer);recapIndex=0;renderRecap();if(!reduced.matches&&records.length>1)recapTimer=setInterval(()=>shift(1),4300);});
  root.addEventListener('live-snapshot-updated',event=>{
    const next=event.detail;if(!next)return;
    records=[...next.experiments].sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
    milestones=[...next.milestones].sort((a,b)=>String(b.measuredAt||'').localeCompare(String(a.measuredAt||'')));
    root.dataset.records=JSON.stringify(records);root.dataset.milestones=JSON.stringify(milestones);if(prior&&records.some(row=>Date.parse(row.publishedAt||'')>prior))hasNewSinceVisit=true;renderRecap();
    const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const related=(row)=> (row.relationships||[]).filter(item=>item.type==='related'&&records.some(record=>record.id===item.recordId)).map(item=>item.recordId);
    const positions=records.map((row,i)=>({row,x:18+(i%3)*31,y:27+Math.floor(i/3)*28}));
    const nodeList=root.querySelector('.network-node-list');
    if(nodeList){nodeList.replaceChildren(...positions.map(({row},i)=>{const button=document.createElement('button');button.type='button';button.className='observatory-node';button.dataset.networkNode=row.id;button.dataset.links=related(row).join('|');button.setAttribute('aria-pressed',String(i===0));const index=document.createElement('span');index.className='observatory-node-mark';index.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=row.title;small.textContent=row.researchArea||'Unclassified';label.append(strong,small);button.append(index,label);button.addEventListener('click',()=>{nodeButtons.splice(0,nodeButtons.length,...root.querySelectorAll('[data-network-node]'));selectNode(button);});return button;}));}
    const edges=root.querySelector('.network-edges'),dots=root.querySelector('.network-dots');
    if(edges&&dots){edges.replaceChildren();dots.replaceChildren();for(const {row,x,y} of positions){const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.dataset.dot=row.id;dot.setAttribute('cx',`${x}%`);dot.setAttribute('cy',`${y}%`);dot.setAttribute('r','6');dots.append(dot);for(const id of related(row)){if(row.id>=id)continue;const target=positions.find(item=>item.row.id===id);if(!target)continue;const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.dataset.edge=`${row.id} ${id}`;line.setAttribute('x1',`${x}%`);line.setAttribute('y1',`${y}%`);line.setAttribute('x2',`${target.x}%`);line.setAttribute('y2',`${target.y}%`);edges.append(line);}}}
    const journey=root.querySelector('.journey-list');if(journey)journey.replaceChildren(...milestones.map((row,i)=>{const li=document.createElement('li');li.className='journey-item';const number=document.createElement('span');number.className='journey-index';number.textContent=String(i+1).padStart(2,'0');const content=document.createElement('div'),eyebrow=document.createElement('p'),heading=document.createElement('h3'),summary=document.createElement('p'),date=document.createElement('small');eyebrow.className='eyebrow';eyebrow.textContent=`Reviewed public milestone · ${row.verificationStatus||'status unavailable'}`;heading.textContent=row.title;summary.textContent=row.summary;date.textContent=`Measured ${row.measuredAt||'date unavailable'} · Published ${row.publishedAt||'date unavailable'}`;content.append(eyebrow,heading,summary,date);const links=(row.relatedExperimentIds||[]).map(id=>records.find(record=>record.id===id)).filter(Boolean);if(links.length){const p=document.createElement('p');p.textContent='Evidence: ';for(const record of links){const a=document.createElement('a');a.href=`/live/experiments/${encodeURIComponent(record.id)}/`;a.textContent=`${record.title} ↗`;p.append(a,document.createTextNode(' '));}content.append(p);}li.append(number,content);return li;}));
    const count=root.querySelectorAll('.observatory-data span');if(count.length===3){count[0].textContent=String(records.length).padStart(2,'0');count[1].textContent=String(milestones.length).padStart(2,'0');count[2].textContent=String(next.metrics?.length||0).padStart(2,'0');}
    const first=root.querySelector('.network-node-list [data-network-node]');if(first)selectNode(first);
  });
}
