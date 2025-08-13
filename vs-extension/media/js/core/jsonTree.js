export function renderJSONTree(container, obj){
  container.classList.add('json'); container.innerHTML='';
  function esc(s){ return String(s).replace(/[&<>]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
  function kv(k,v,indent){
    const row=document.createElement('div'); row.className='jrow'; row.style.marginLeft=indent+'px';
    const key=document.createElement('span'); key.innerHTML='<span class="jk">"'+esc(k)+'"</span>: '; row.appendChild(key);
    row.appendChild(renderVal(v, indent)); return row;
  }
  function renderVal(v, indent){
    if(v===null){ const s=document.createElement('span'); s.className='jv-null'; s.textContent='null'; return s; }
    if(Array.isArray(v)){ return foldable('[ '+v.length+' ]', v, indent, true); }
    if(typeof v==='object'){ return foldable('{ '+Object.keys(v).length+' }', v, indent, false); }
    const s=document.createElement('span');
    if(typeof v==='number'){ s.className='jv-num'; s.textContent=v; }
    else if(typeof v==='boolean'){ s.className='jv-bool'; s.textContent=v; }
    else { s.className='jv-str'; s.textContent='"'+esc(v)+'"'; }
    return s;
  }
  function foldable(headText, value, indent, isArray){
    const box=document.createElement('span'); const head=document.createElement('span'); head.className='fold';
    const icon=document.createElement('span'); icon.className='fn'; icon.textContent='▸'; head.appendChild(icon);
    head.appendChild(document.createTextNode(' '+headText+' ')); box.appendChild(head);
    const body=document.createElement('div'); body.style.display='none'; box.appendChild(body);
    head.addEventListener('click',()=>{ const open=body.style.display==='none'; body.style.display=open?'block':'none'; icon.textContent=open?'▾':'▸'; });
    if(isArray){ value.forEach((vv)=> body.appendChild(kv('', vv, indent+14))); }
    else { Object.keys(value).forEach(k=> body.appendChild(kv(k, value[k], indent+14))); }
    return box;
  }
  const root=document.createElement('div'); root.className='jrow'; root.textContent=''; container.appendChild(root);
  if(typeof obj==='object' && obj){ Object.keys(obj).forEach(k=> container.appendChild(kv(k, obj[k], 0))); }
  else { container.appendChild(renderVal(obj,0)); }
}
