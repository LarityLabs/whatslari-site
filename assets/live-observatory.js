import { mountBinaryOcean } from './binary-ocean.js';
const root = document.querySelector('[data-research-observatory]');
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
    const eyebrow=detail.querySelector('.eyebrow'),link=detail.querySelector('a');
    if(eyebrow)eyebrow.textContent='Selected record · '+(record.status||'approved')+' · '+(record.verificationStatus||'verification unavailable');if(link){link.href=`/research/experiments/${encodeURIComponent(record.id)}/`;link.textContent='Open this approved record →';}
  };
  nodeButtons.forEach(button=>button.addEventListener('click',()=>selectNode(button)));
  if(nodeButtons[0])selectNode(nodeButtons[0]);
  root.addEventListener('research-snapshot-updated',event=>{
    const next=event.detail;if(!next)return;
    records=next.experiments.map(({id,title,status,verificationStatus,researchArea,relationships})=>({id,title,status,verificationStatus,researchArea,relationships:relationships||[]}));
    milestones=[...next.milestones].sort((a,b)=>String(b.measuredAt||'').localeCompare(String(a.measuredAt||'')));
    root.dataset.records=JSON.stringify(records);root.dataset.milestones=JSON.stringify(milestones);
    const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const related=(row)=> (row.relationships||[]).filter(item=>item.type==='related'&&records.some(record=>record.id===item.recordId)).map(item=>item.recordId);
    const positions=records.map((row,i)=>({row,x:18+(i%3)*31,y:27+Math.floor(i/3)*28}));
    const nodeList=root.querySelector('.network-node-list');
    if(nodeList){nodeList.replaceChildren(...positions.map(({row},i)=>{const button=document.createElement('button');button.type='button';button.className='observatory-node';button.dataset.networkNode=row.id;button.dataset.links=related(row).join('|');button.setAttribute('aria-pressed',String(i===0));const index=document.createElement('span');index.className='observatory-node-mark';index.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=row.title;small.textContent=row.researchArea||'Unclassified';label.append(strong,small);button.append(index,label);button.addEventListener('click',()=>{nodeButtons.splice(0,nodeButtons.length,...root.querySelectorAll('[data-network-node]'));selectNode(button);});return button;}));}
    const edges=root.querySelector('.network-edges'),dots=root.querySelector('.network-dots');
    if(edges&&dots){edges.replaceChildren();dots.replaceChildren();for(const {row,x,y} of positions){const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.dataset.dot=row.id;dot.setAttribute('cx',`${x}%`);dot.setAttribute('cy',`${y}%`);dot.setAttribute('r','6');dots.append(dot);for(const id of related(row)){if(row.id>=id)continue;const target=positions.find(item=>item.row.id===id);if(!target)continue;const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.dataset.edge=`${row.id} ${id}`;line.setAttribute('x1',`${x}%`);line.setAttribute('y1',`${y}%`);line.setAttribute('x2',`${target.x}%`);line.setAttribute('y2',`${target.y}%`);edges.append(line);}}}
    const journey=root.querySelector('.journey-list');if(journey)journey.replaceChildren(...milestones.map((row,i)=>{const li=document.createElement('li');li.className='journey-item';const number=document.createElement('span');number.className='journey-index';number.textContent=String(i+1).padStart(2,'0');const content=document.createElement('div'),eyebrow=document.createElement('p'),heading=document.createElement('h3'),summary=document.createElement('p'),date=document.createElement('small');eyebrow.className='eyebrow';eyebrow.textContent=`Reviewed public milestone · ${row.verificationStatus||'status unavailable'}`;heading.textContent=row.title;summary.textContent=row.summary;date.textContent=`Measured ${row.measuredAt||'date unavailable'} · Published ${row.publishedAt||'date unavailable'}`;const links=(row.relatedExperimentIds||[]).map(id=>records.find(record=>record.id===id)).filter(Boolean);content.append(eyebrow,heading);if(!links.length)content.append(summary);content.append(date);if(links.length){const p=document.createElement('p');p.textContent='Evidence: ';for(const record of links){const a=document.createElement('a');a.href=`/research/experiments/${encodeURIComponent(record.id)}/`;a.textContent='Open supporting record →';p.append(a,document.createTextNode(' '));}content.append(p);}li.append(number,content);return li;}));
    const snapshotLabel=root.querySelector('[data-live-snapshot]');if(snapshotLabel)snapshotLabel.textContent=next.snapshotId||'snapshot unavailable';const count=root.querySelectorAll('[data-stat-value]');if(count.length===3){count[0].textContent=String(records.length).padStart(2,'0');count[1].textContent=String(milestones.length).padStart(2,'0');count[2].textContent=String(next.metrics?.length||0).padStart(2,'0');}
    const first=root.querySelector('.network-node-list [data-network-node]');if(first)selectNode(first);
  });
}
