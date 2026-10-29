'use client';
/* eslint-disable @next/next/no-img-element */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { withBrowserSession } from "@/lib/constructor-browser-session";
import { Plus, Search, Pencil, Trash2, Info, X, Check, ArrowUpRight, RotateCcw, AlertCircle } from 'lucide-react';
import branding from '@/branding.json';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { amount, fields, labels, multiply, validate, type Draft, type Errors, type Product } from '@/lib/inventory';

type Data = {query:string;products:Product[];summary:{products:number;units:string;value:string};seeded:boolean};
type Result = {state:string;operation?:string;product?:Product;previous?:Product;current?:Product;errors?:Errors;message?:string;key?:string;historical?:boolean;recoveredAt?:string};
type Envelope = {url:string;key:string;payload:Record<string,unknown>;original:Product|null;operation:string};
type HistoryEntry = {key:string;result:Result;created_at:string;payload?:{payload?:Partial<Draft>}};
type History = HistoryEntry[];
const empty:Draft={name:'',sku:'',quantity:'',price_decimal:''};
const asDraft=(p:Product):Draft=>({name:p.name,sku:p.sku,quantity:p.quantity,price_decimal:p.price_decimal.replace('.',',')});
const storageKey='almacen-unconfirmed';
async function post(url:string,body:unknown) {const send=async()=>{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();return {res,data};};return url==='/api/session'?withBrowserSession(send):send();}
export default function Inventory() {
 const [data,setData]=useState<Data|null>(null),[q,setQ]=useState(''),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [open,setOpen]=useState(false),[kind,setKind]=useState<'edit'|'delete'|'history'>('edit'),[original,setOriginal]=useState<Product|null>(null),[draft,setDraft]=useState<Draft>(empty),[errors,setErrors]=useState<Errors>({});
 const [submitted,setSubmitted]=useState<Envelope|null>(null);
 const [precision,setPrecision]=useState<Record<string,string[]>>({});
 const [moreBelow,setMoreBelow]=useState(false);
 const [phase,setPhase]=useState('editing'),[current,setCurrent]=useState<Product|null>(null),[message,setMessage]=useState(''),[confirmed,setConfirmed]=useState<Result|null>(null),[history,setHistory]=useState<History>([]),[sessionIssue,setSessionIssue]=useState(false);
 const envelope=useRef<Envelope|null>(null), sequence=useRef(0), query=useRef(''), trigger=useRef<HTMLElement|null>(null), pending=useRef(false), initialFocus=useRef<HTMLInputElement|null>(null),retryRef=useRef<HTMLButtonElement|null>(null),cancelRef=useRef<HTMLButtonElement|null>(null);
 const loadErrorRef=useRef<HTMLDivElement|null>(null);
 useLayoutEffect(()=>{
  if(!loadError||open)return;
  // Keep the complete recovery message reachable without taking focus from search.
  const reveal=()=>loadErrorRef.current?.scrollIntoView({block:'nearest',behavior:'instant'});
  reveal();
  window.addEventListener('resize',reveal);
  window.visualViewport?.addEventListener('resize',reveal);
  return()=>{window.removeEventListener('resize',reveal);window.visualViewport?.removeEventListener('resize',reveal);};
 },[loadError,open]);
 useLayoutEffect(()=>{
  const table=document.querySelector('.inventory-table');if(!table)return;
  const measure=()=>{
   const next:Record<string,string[]>={};
   table.querySelectorAll<HTMLElement>('[data-product-id]').forEach(row=>{
    const overflowing:string[]=[];
    row.querySelectorAll<HTMLElement>('td[data-label]').forEach(cell=>{
     const number=cell.querySelector('.number-measure');if(!number)return;
     const range=document.createRange();range.selectNodeContents(number);
     const style=getComputedStyle(cell);
     const header=table.querySelector<HTMLElement>(cell.dataset.label==='Cantidad'?'thead th:nth-child(3)':cell.dataset.label==='Precio unitario'?'.price-heading':'.value-heading');
     // Measure the fixed numerical rail, so a full-width continuation cannot remove its own overflow state.
     const available=innerWidth>640&&header?header.clientWidth:cell.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-(innerWidth<=640?120:0);
     if(range.getBoundingClientRect().width>available)overflowing.push(cell.dataset.label!);
    });
    if(overflowing.length)next[row.dataset.productId!]=overflowing;
   });
   setPrecision(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  };
  const observer=new ResizeObserver(measure);observer.observe(table);measure();void document.fonts.ready.then(measure);
  return()=>observer.disconnect();
 },[data]);
 useEffect(()=>{
  if(!open)return;
  const scroller=document.querySelector('.editor-scroll');if(!scroller)return;
  const measure=()=>setMoreBelow(scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop>4);
  const observer=new ResizeObserver(measure);observer.observe(scroller);
  for(const child of scroller.children)observer.observe(child);
  scroller.addEventListener('scroll',measure);measure();
  return()=>{observer.disconnect();scroller.removeEventListener('scroll',measure);};
 },[open,phase,kind,history]);
 const refresh=useCallback(async(search:string)=>{const seq=++sequence.current;setLoading(true);try{const r=await fetch('/api/products?q='+encodeURIComponent(search),{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(seq===sequence.current){setData(d);setLoadError(false);}}catch{if(seq===sequence.current)setLoadError(true);}finally{if(seq===sequence.current)setLoading(false);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>{const savedQuery=sessionStorage.getItem('almacen-query')||'';query.current=savedQuery;setQ(savedQuery);void refresh(savedQuery);void post('/api/session',{}).then(({res,data})=>{setSessionIssue(!res.ok);if(res.ok)setHistory(data.results);}).catch(()=>setSessionIssue(true));
  const saved=sessionStorage.getItem(storageKey);if(saved){try{const s=JSON.parse(saved);envelope.current=s.envelope;setSubmitted(s.envelope);setOriginal(s.envelope.original);setDraft(s.draft);setKind(s.envelope.operation==='delete'?'delete':'edit');setPhase('uncertain');setOpen(true);}catch{sessionStorage.removeItem(storageKey);}}
 },0);return ()=>clearTimeout(timer);},[refresh]);
 useEffect(()=>{
  if(open||!confirmed?.product||confirmed.operation==='delete'||confirmed.historical)return;
  const timer=setTimeout(()=>{const target=document.querySelector('.confirmation-band')?.parentElement;if(target){const r=target.getBoundingClientRect();if(r.top<0||r.bottom+8>window.innerHeight)target.scrollIntoView({block:'center',behavior:'instant'});}},0);
  return ()=>clearTimeout(timer);
 },[confirmed,open]);
 useEffect(()=>{
  if(!open||kind==='history')return;
  // Response handlers can run before React commits the recovery controls.
  // Move focus only after the matching state and its refs are mounted.
  if(phase==='conflict'){
   retryRef.current?.focus({preventScroll:true});
   // Reveal both choices together; center them on phones to leave room for the keyboard.
   retryRef.current?.closest('.conflict-actions')?.scrollIntoView({block:window.matchMedia('(max-width: 640px)').matches?'center':'nearest',behavior:'instant'});
  }
  else if(phase==='uncertain'){retryRef.current?.focus({preventScroll:true});document.querySelector('.editor-scroll')?.scrollTo({top:0});}
  else if(phase==='invalid')document.getElementById('field-'+(fields.find(f=>errors[f])||'name'))?.focus();
 },[open,kind,phase,errors]);
 useEffect(()=>{
  if(!open)return;
  const scroller=document.querySelector('.editor-scroll');
  const reveal=()=>{
   const active=document.activeElement;
   const conflictActions=phase==='conflict'&&active?.closest('.conflict-actions');
   const target=conflictActions||(
    phase==='uncertain'&&active?.tagName!=='INPUT'?scroller?.querySelector('[role="alert"]'):active
   );
   if(target&&scroller?.contains(target))target.scrollIntoView({block:conflictActions&&window.matchMedia('(max-width: 640px)').matches?'center':'nearest',behavior:'instant'});
  };
  // Keep focus visible when viewport size or the comparison's overflow hint changes.
  const observer=new ResizeObserver(reveal);if(scroller)observer.observe(scroller);
  const comparison=scroller?.querySelector('.conflict-comparison');if(comparison)observer.observe(comparison);
  window.addEventListener('resize',reveal);
  window.visualViewport?.addEventListener('resize',reveal);
  if(phase==='uncertain')reveal();
  return ()=>{observer.disconnect();window.removeEventListener('resize',reveal);window.visualViewport?.removeEventListener('resize',reveal);};
 },[open,phase]);
 function search(s:string){setQ(s);query.current=s;sessionStorage.setItem('almacen-query',s);void refresh(s);}
 function remember(d:Draft=draft){if(envelope.current)sessionStorage.setItem(storageKey,JSON.stringify({envelope:envelope.current,draft:d}));}
 function clearEnvelope(){envelope.current=null;setSubmitted(null);sessionStorage.removeItem(storageKey);}
 function launch(type:'edit'|'delete',p:Product|null){trigger.current=document.activeElement as HTMLElement;if(envelope.current){const saved=JSON.parse(sessionStorage.getItem(storageKey)||'{}');setOriginal(envelope.current.original);setDraft(saved.draft||draft);setKind(envelope.current.operation==='delete'?'delete':'edit');setPhase('uncertain');setOpen(true);return;}setConfirmed(null);setOriginal(p);setDraft(p?asDraft(p):{...empty});setKind(type);setErrors({});setPhase('editing');setCurrent(null);setMessage('');setOpen(true);(window as Window & {constructorTrack?:(event:string)=>void}).constructorTrack?.('Producto abierto');}
 function close(){if(pending.current)return;setOpen(false);setErrors({});}
 function focusField(field:string){requestAnimationFrame(()=>document.getElementById('field-'+field)?.focus());}
 function focusName(){const input=initialFocus.current;if(input){input.focus({preventScroll:true});input.setSelectionRange(0,0);input.scrollLeft=0;}}
 function invalid(e:Errors){setErrors(e);setPhase('invalid');}
 async function applyResponse(result:Result,env:Envelope,recovering:boolean){
  if(result.state==='confirmed'){
   clearEnvelope();setErrors({});await refresh(query.current);setConfirmed(result);
   const changed=kind==='edit'&&fields.some(f=>String(env.payload[f])!==draft[f]);
   if(recovering&&changed){setOriginal(result.product!);setPhase('reconciled');setMessage('El envío original está confirmado. Tu borrador editado aún no está guardado.');}
   else {setOpen(false);setPhase('editing');}
  }else if(result.state==='conflict'){clearEnvelope();setCurrent(result.current!);setPhase('conflict');setMessage(result.message||'');}
  else if(result.state==='missing'){clearEnvelope();setPhase('missing');setMessage(result.message||'');}
  else if(result.errors){clearEnvelope();invalid(result.errors);}
  else if(result.state==='session_blocked'){clearEnvelope();setSessionIssue(true);setPhase('blocked');setMessage(result.message||'');}
  else if(result.state==='forbidden'){clearEnvelope();setPhase('blocked');setMessage('Este origen no permite guardar cambios. Abre la aplicación desde su dirección autorizada.');}
  else {setPhase('uncertain');remember();}
 }
 async function send(env:Envelope,recovering=false){if(pending.current)return;pending.current=true;setPhase('pending');setErrors({});envelope.current=env;setSubmitted(env);remember();
  try{const {data:result}=await post(env.url,{key:env.key,payload:env.payload});await applyResponse(result,env,recovering);}
  catch{setPhase('uncertain');remember();}finally{pending.current=false;}
 }
 async function save(){if(pending.current||['conflict','uncertain','reconciled','missing'].includes(phase))return;
  if(kind==='edit'){const e=validate(draft);if(Object.keys(e).length){invalid(e);return;}}
  if(sessionIssue){try{const {res}=await post('/api/session',{});if(!res.ok)throw Error();setSessionIssue(false);}catch{setPhase('blocked');setMessage('No se pudo iniciar la sesión. Permite las cookies de la aplicación y vuelve a intentar. La lectura sigue disponible.');return;}}
  const operation=kind==='delete'?'delete':original?'update':'create';
  const payload=kind==='delete'?{version:original!.version}:{...draft,...(original?{version:original.version}:{})};
  await send({url:original?`/api/products/${original.id}/${operation}`:'/api/products',key:crypto.randomUUID(),payload,original,operation});
 }
 function loadCurrent(){setOriginal(current);setDraft(asDraft(current!));setCurrent(null);setPhase('editing');setErrors({});requestAnimationFrame(focusName);}
 function replace(){setOriginal(current);setCurrent(null);setPhase('editing');setMessage('Versión actual cargada. Revisa tu borrador y pulsa Guardar producto para confirmar el reemplazo.');}
 async function showHistory(){trigger.current=document.activeElement as HTMLElement;setKind('history');setOpen(true);setPhase('pending');try{const {res,data}=await post('/api/session',{});if(!res.ok)throw Error();setHistory(data.results);setPhase('editing');}catch{setPhase('blocked');setMessage('No se pudieron recuperar tus resultados. Vuelve a intentarlo.');}}
 const uncertain=phase==='uncertain', busy=phase==='pending', conflict=phase==='conflict';
 const resultText=confirmed?.product?`${confirmed.operation==='delete'?'Producto eliminado':'Producto guardado'}. ${confirmed.product.name} · ${confirmed.product.sku}.`:'';
 return <main className="mx-auto flex min-h-dvh max-w-[1264px] flex-col px-4 pb-6 pt-4 md:px-8 md:pt-10">
  <header className="masthead mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-8">
   <div className="flex min-w-0 items-center gap-3"><img data-brand-logo src={branding.logoImageUrl||'/brand-mark.svg'} alt="" className="h-10 w-10 shrink-0"/><div><h1 className="font-heading text-[28px] leading-8 font-semibold">{branding.logoText}</h1><p className="text-xs leading-[18px] md:mt-1 md:text-sm">Inventario interno compartido</p></div></div>
   <Button onClick={()=>launch('edit',null)} className="primary shrink-0"><Plus size={18}/>Agregar producto</Button>
  </header>
  <div className="mb-4 hidden items-center justify-between md:flex"><p>Consulta, corrige y mantén existencias exactas.</p><span className="text-xs">Los cambios se aplican a todo el equipo.</span></div>
  <section aria-label="Registro de inventario" className="ledger overflow-hidden rounded border border-border border-t-[3px] border-t-primary bg-surface">
   <div aria-label="Resumen global" className={`summary${data&&data.summary.units.length>8?' summary-wide-units':''}${data&&amount(data.summary.value).length>12?' summary-wide-value':''}`}>
    <div className="summary-counts">
    <div className="summary-count"><div className="summary-label">Productos</div><div data-testid="summary-products">{data?.summary.products??'—'}</div></div>
    <div className="summary-count min-w-0"><div className="summary-label">Unidades totales</div><div data-testid="summary-units">{data?<Exact value={data.summary.units} label="Unidades totales"/>:'—'}</div></div>
    </div>
    <div className="summary-total"><div className="summary-label">Valor total del inventario</div><div data-testid="summary-value">{data?<Exact value={amount(data.summary.value)} label="Valor total del inventario"/>:'—'}</div></div>
   </div>
   <div className="search-controls border-b border-border/40 px-3 py-2 md:px-6 md:py-4">
    <label className="mb-1.5 block text-xs font-medium" htmlFor="search">Buscar por nombre o SKU</label>
    <div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search size={18} aria-hidden className="pointer-events-none absolute top-3.5 left-3"/><input id="search" type="search" value={q} onChange={e=>search(e.target.value)} placeholder="Nombre o SKU" className="input pl-10"/></div>{q&&<Button variant="outline" className="secondary" onClick={()=>search('')}>Limpiar<span className="sr-only"> búsqueda</span></Button>}</div>
    <div className="search-count mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span data-testid="count" data-query={data?.query}>{data?`${data.products.length} de ${data.summary.products} productos`: 'Cargando inventario…'}{loading&&data?' · Actualizando…':''}{loadError&&data&&<strong className="stale-results">Resultados anteriores; búsqueda sin actualizar.</strong>}</span><button className="recovery-control" onClick={showHistory}><RotateCcw size={14}/>Recuperar resultados</button></div>
   </div>
   {loadError&&<div ref={loadErrorRef} role="alert" className="notice error m-3 md:mx-6"><AlertCircle size={18}/><div><strong>No se pudo cargar el inventario.</strong><p>Los últimos datos confirmados se conservan.</p><Button className="secondary mt-2" variant="outline" onClick={()=>refresh(q)}>Reintentar carga</Button></div></div>}
   {confirmed&&(confirmed.historical||confirmed.operation==='delete'||!data?.products.some(p=>p.id===confirmed.product?.id&&p.version===confirmed.product.version))&&<div role="status" className="notice m-3 md:mx-6" data-testid="confirmation"><Check size={18}/><div className="min-w-0 flex-1">{confirmed.historical&&confirmed.product?<RecoveredResult result={confirmed}/>:resultText}{!confirmed.historical&&confirmed.operation!=='delete'&&!data?.products.some(p=>p.id===confirmed.product?.id)&&<p>{q?'No aparece porque no coincide con la búsqueda actual.':'El producto no está en el inventario actual.'}</p>}</div><button className="icon-button ml-auto" aria-label="Cerrar confirmación" onClick={()=>setConfirmed(null)}><X size={16}/></button></div>}
   <table className="inventory-table w-full border-collapse text-left"><colgroup><col className="name-col"/><col className="sku-column sku-col"/><col className="quantity-col"/><col className="price-col"/><col className="value-col"/><col className="action-col"/></colgroup><thead><tr><th>Nombre<span className="hidden tablet-sku"> / SKU</span></th><th className="sku-column">SKU</th><th className="numeric">Cantidad</th><th className="numeric price-heading">Precio unitario</th><th className="numeric value-heading">Valor de fila</th><th className="actions-head">Acciones</th></tr></thead><tbody>
    {data?.products.map(p=>{
     const saved=!confirmed?.historical&&confirmed?.product?.id===p.id&&confirmed.product.version===p.version&&confirmed.operation!=='delete';
     return <Fragment key={p.id}><tr data-product-id={p.id} className={saved?'confirmed-row':''}>
      <td className="name-cell"><span className="font-medium">{p.name}</span><span className="mobile-sku mt-1 text-xs">{p.sku}</span></td><td className="sku-column text-sm">{p.sku}</td>
      {(['Cantidad','Precio unitario','Valor de fila'] as const).map((label,i)=>{
       const value=i===0?p.quantity:amount(i===1?p.price_decimal:p.value);
       return <td key={label} className={'numeric '+(i===0?'quantity-cell':i===2?'amount-cell value-cell font-medium':'amount-cell price-cell')+(precision[p.id]?.includes(label)?' precision-mobile':'')} data-label={label}>
        <span className="number-measure" aria-hidden="true">{value}</span>
        {i>0&&<span className="amount-label" aria-hidden="true">{label}</span>}
        <span className="authoritative-amount"><Exact value={value} label={label}/>{saved&&i===2&&<span key={confirmed.key} className="confirmation-band" aria-hidden/>}</span>
       </td>;
      })}
      <td className="actions-cell"><div className="row-actions"><Button variant="outline" className="secondary" aria-label={'Editar '+p.name+', '+p.sku} onClick={()=>launch('edit',p)}><Pencil size={14}/>Editar</Button><Button variant="outline" className="secondary danger-text" aria-label={'Eliminar '+p.name+', '+p.sku} onClick={()=>launch('delete',p)}><Trash2 size={14}/>Eliminar</Button></div></td>
     </tr>{saved&&<tr className="confirmation-detail-row"><td colSpan={6}><div role="status" className="row-detail"><Check size={15}/><span>Producto {confirmed.previous?'actualizado':'agregado'} correctamente.</span>{confirmed.previous&&<Changes previous={confirmed.previous} product={p}/>}</div></td></tr>}</Fragment>;
    })}
   </tbody></table>
   {!data&&!loadError&&<div className="min-h-56 px-6 py-8" role="status">Cargando productos y totales confirmados…</div>}
   {data&&!data.products.length&&(q?<div className="empty-register no-matches"><div className="min-w-0"><h2 className="text-xl font-semibold">Sin coincidencias</h2><p className="mt-2 break-words">No se encontraron productos para “{q}”.</p></div><Button className="secondary shrink-0" variant="outline" onClick={()=>search('')}>Limpiar búsqueda</Button></div>:<div className="empty-register"><div><h2 className="text-xl font-semibold">No hay productos</h2><p className="mt-2">Agrega un producto para comenzar.</p></div><Button className="primary" onClick={()=>launch('edit',null)}><Plus size={18}/>Agregar producto</Button></div>)}
   <aside className="flex items-start gap-3 border-t border-border/40 bg-background/50 px-3 py-4 text-sm md:px-6"><Info size={18} className="mt-0.5 shrink-0 text-primary"/><div><h2 className="font-medium">Inventario compartido.</h2><p className="mt-1 max-w-[1000px]">Todos vemos los mismos productos. Tu sesión anónima permite recuperar tus cambios; no ofrece privacidad individual del inventario.</p><p className="mt-2 text-xs">Inventario inicial con tres productos ficticios.</p></div></aside>
  </section>
  <footer className="mt-6 border-t border-border/40 pt-4 text-xs">{branding.logoText} · Existencias e importes exactos</footer>
  <Dialog open={open} onOpenChange={v=>{if(!v)close();}}><DialogPortal><DialogOverlay className="fixed inset-0 z-40 bg-[#202A24]/40"/><DialogContent className="editor fixed z-50 flex flex-col bg-surface shadow-xl" onOpenAutoFocus={e=>{e.preventDefault();if(phase==='uncertain')retryRef.current?.focus({preventScroll:true});else if(kind==='edit')focusName();else cancelRef.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus({preventScroll:true});}} onEscapeKeyDown={e=>{if(busy&&kind!=='history')e.preventDefault();}} onInteractOutside={e=>e.preventDefault()}>
   <div className="editor-heading flex shrink-0 items-start justify-between gap-3 border-b border-border/40 p-4 md:p-6"><div className="min-w-0"><DialogTitle className="text-xl leading-6 font-semibold">{kind==='history'?'Recuperar resultados':kind==='delete'?'Eliminar producto':original?'Editar producto':'Agregar producto'}</DialogTitle><DialogDescription className="mt-1 break-words text-xs">{kind==='history'?'Resultados de los cambios de tu sesión.':original?kind==='delete'?`Versión ${original.version}`:`${original.sku} · Versión ${original.version}`:'Registra un producto en el inventario compartido.'}</DialogDescription></div>{kind==='edit'?<Button className="primary mobile-save shrink-0" disabled={busy||conflict||uncertain||phase==='reconciled'||phase==='missing'} onClick={save}>{busy?'Guardando…':'Guardar producto'}</Button>:null}<button aria-label="Cerrar editor" disabled={busy&&kind!=='history'} className="icon-button desktop-close shrink-0" onClick={close}><X size={20}/></button></div>
     {kind!=='history'&&!!Object.keys(errors).length&&<div role="alert" className="notice error mx-4 mt-4 shrink-0 md:mx-6" data-testid="validation-summary"><AlertCircle size={20}/><div><strong>Revisa los campos antes de guardar.</strong>{errors.form&&<p>{errors.form}</p>}<div className="mt-1 flex flex-wrap gap-x-4">{fields.filter(f=>errors[f]).map(f=><button key={f} className="min-h-11 text-left underline underline-offset-4" onClick={()=>focusField(f)}>{labels[f]}</button>)}</div></div></div>}
   {kind!=='history'&&busy&&<div role="status" className="notice pending-notice editor-feedback"><span className="pending-dot"/><div><strong>Esperando confirmación…</strong><p>Conservamos los datos del envío.</p></div></div>}
   {kind!=='history'&&uncertain&&<div role="alert" className="notice warning editor-feedback"><AlertCircle size={20}/><div className="min-w-0"><strong>Resultado sin confirmar</strong><p className="mt-1">El envío podría haberse aplicado. Recupera el envío original antes de guardar otro cambio. Tus entradas actuales se conservan.</p><Button ref={retryRef} variant="outline" className="secondary mt-3" onClick={()=>envelope.current&&send(envelope.current,true)}>Recuperar envío original</Button></div></div>}
   {kind!=='history'&&conflict&&<div role="alert" className="notice error editor-feedback"><AlertCircle size={20}/><div className="min-w-0 flex-1"><strong>Este producto cambió.</strong><p>Tu borrador se conserva.</p></div></div>}
   <div className="editor-scroll min-h-0 overflow-y-auto p-4 md:p-6">
    {kind==='history'?<div>{busy?<p role="status">Recuperando resultados…</p>:phase==='blocked'?<div role="alert" className="notice error"><p>{message}</p><Button className="secondary" onClick={showHistory}>Reintentar</Button></div>:history.length?<div className="history-ledger">{history.map(h=><div key={h.key} className="history-row"><p className="history-identity font-medium">{historyIdentity(h)}</p><div className="history-outcome text-xs"><p>{h.result.state==='confirmed'?(h.result.operation==='delete'?'Eliminación confirmada':'Guardado confirmado'):h.result.state==='conflict'?'Conflicto de versiones':h.result.state==='duplicate'?'SKU duplicado':'Datos rechazados'}</p><time dateTime={h.created_at}>{new Date(h.created_at).toLocaleString('es')}</time></div><div className="history-tools">{h.result.state==='confirmed'&&<Button variant="outline" className="secondary history-action" onClick={()=>{setConfirmed({...h.result,historical:true,recoveredAt:h.created_at});setOpen(false);void refresh(query.current);}}>Ver resultado<ArrowUpRight size={14}/></Button>}<details className="history-details"><summary className="min-h-11 cursor-pointer content-center text-xs underline underline-offset-4">Detalles del cambio</summary>{h.result.product&&<Snapshot p={h.result.product}/>}<p className="text-xs">{h.result.product?`Versión ${h.result.product.version}`:h.result.message||Object.values(h.result.errors||{}).join(' ')}</p>{h.result.previous&&<div className="mt-3"><h3 className="text-xs font-medium">Antes del cambio</h3><Snapshot p={h.result.previous}/></div>}{h.result.current&&<div className="mt-3"><h3 className="text-xs font-medium">Versión actual al responder</h3><Snapshot p={h.result.current}/></div>}</details></div></div>)}</div>:<p>No hay cambios registrados en esta sesión.</p>}</div>:
    <>
     {conflict&&original&&current&&<ConflictComparison original={original} current={current} draft={kind==='edit'?draft:null} actions={<div className="conflict-actions"><Button ref={retryRef} variant="outline" className="secondary" onClick={loadCurrent}>Cargar valores actuales</Button><Button variant="outline" className="secondary" onClick={replace}>Reemplazar con mi borrador</Button></div>}/>}
     {uncertain&&<div className="mb-5 border-b border-border/40 pb-4 text-sm"><h3 className="font-medium">Envío original</h3><p className="break-words">{String(submitted?.payload.name||original?.name)} · {String(submitted?.payload.sku||original?.sku)}</p>{kind==='edit'&&<p className="break-words">Cantidad: {String(submitted?.payload.quantity)} · Precio: {String(submitted?.payload.price_decimal)}</p>}</div>}
     {kind==='edit'&&<form id="product-form" noValidate onSubmit={e=>{e.preventDefault();void save();}}><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{fields.map((f,i)=><div key={f} className={i<2?'sm:col-span-2':''}><label className="mb-1.5 block text-sm font-medium" htmlFor={'field-'+f}>{labels[f]}</label><input ref={f==='name'?initialFocus:undefined} id={'field-'+f} className="input" value={draft[f]} inputMode={f==='quantity'?'numeric':f==='price_decimal'?'decimal':undefined} autoComplete="off" readOnly={busy} aria-invalid={!!errors[f]} aria-describedby={[errors[f]?'error-'+f:'',f==='price_decimal'?'price-help':''].filter(Boolean).join(' ')||undefined} onChange={e=>{const d={...draft,[f]:e.target.value};setDraft(d);if(envelope.current)remember(d);}}/>{errors[f]&&<p id={'error-'+f} className="mt-1 text-sm text-destructive">{errors[f]}</p>}{f==='price_decimal'&&<p id="price-help" className="mt-1.5 text-xs">Coma o punto decimal. Sin símbolo de moneda.</p>}</div>)}</div></form>}
     {kind==='delete'&&<div><p className="break-words text-lg font-medium">{original?.name}</p><p className="mt-1 break-words text-sm">SKU: {original?.sku}</p><p className="mt-4">Esta acción es irreversible. El producto se eliminará del inventario de todo el equipo.</p></div>}
     {phase==='reconciled'&&<div role="status" className="notice mt-5"><Check size={20}/><div><strong>Envío original confirmado.</strong><p>{message}</p><Button className="secondary mt-3" variant="outline" onClick={()=>{setPhase('editing');setMessage('');}}>Continuar con borrador editado</Button></div></div>}
     {['blocked','missing'].includes(phase)&&<div role="alert" className="notice error mt-5"><AlertCircle size={20}/><p>{message}</p></div>}
     {phase==='editing'&&message&&<p role="status" className="mt-4 text-sm">{message}</p>}
    </>}
   </div>
   {moreBelow&&<p className="shrink-0 border-t border-border/30 bg-background px-4 py-1 text-right text-xs" aria-hidden="true">Más contenido abajo ↓</p>}
   <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/40 p-4 md:px-6"><Button ref={cancelRef} variant="outline" className="secondary" onClick={close} disabled={busy&&kind!=='history'}>{kind==='history'?'Cerrar':uncertain?'Cerrar y conservar envío':'Cancelar'}</Button>{kind!=='history'&&<Button className={`${kind==='delete'?'destructive':'primary desktop-save'}`} onClick={save} disabled={busy||conflict||uncertain||phase==='reconciled'||phase==='missing'}>{busy?'Esperando confirmación…':kind==='delete'?'Eliminar producto':'Guardar producto'}</Button>}</div>
  </DialogContent></DialogPortal></Dialog>
 </main>;
}
function Snapshot({p}:{p:Product|null}){return p?<dl className="mt-1 break-words text-sm"><dt className="sr-only">Nombre y SKU</dt><dd>{p.name} · {p.sku}</dd><dt className="mt-1">Cantidad: {p.quantity}</dt><dt>Precio unitario: {amount(p.price_decimal)}</dt><dt>Valor: {amount(p.value)}</dt></dl>:null;}

function RecoveredResult({result}:{result:Result}) {
 const p=result.product!;
 return <div className="recovered-result">
  <div className="recovered-outcome"><strong>Resultado recuperado · {result.operation==='delete'?'Eliminación confirmada':'Guardado confirmado'}</strong>{result.recoveredAt&&<time dateTime={result.recoveredAt}>{new Date(result.recoveredAt).toLocaleString('es')}</time>}</div>
  <p className="mt-2 break-words font-medium">{p.name} · {p.sku}</p>
  <dl className="recovered-values" aria-label="Valores en ese cambio">{[['Cantidad',p.quantity],['Precio unitario',amount(p.price_decimal)],['Valor',amount(p.value)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd><Exact value={value} label={label}/></dd></div>)}</dl>
  <p className="recovered-clarification">El inventario muestra los valores actuales.</p>
 </div>;
}

function historyIdentity(h:HistoryEntry) {
 const p=h.result.product||h.payload?.payload||h.result.current;
 return [typeof p?.name==='string'?p.name.trim():'',typeof p?.sku==='string'?p.sku.trim():''].filter(Boolean).join(' · ')||'Cambio sin aplicar';
}

function ConflictComparison({original,current,draft,actions}:{original:Product;current:Product;draft:Draft|null;actions:ReactNode}) {
 const scrollRef=useRef<HTMLDivElement>(null),[edges,setEdges]=useState({overflow:false,start:false,end:false});
 useEffect(()=>{
  const el=scrollRef.current;if(!el)return;
  const measure=()=>{const next={overflow:el.scrollWidth>el.clientWidth+1,start:el.scrollLeft>1,end:el.scrollLeft+el.clientWidth<el.scrollWidth-1};setEdges(old=>old.overflow===next.overflow&&old.start===next.start&&old.end===next.end?old:next);};
  const observer=new ResizeObserver(measure);observer.observe(el);if(el.firstElementChild)observer.observe(el.firstElementChild);
  el.addEventListener('scroll',measure,{passive:true});measure();void document.fonts.ready.then(measure);
  return()=>{observer.disconnect();el.removeEventListener('scroll',measure);};
 },[]);
 const sharedIdentity=original.name===current.name&&original.sku===current.sku;
 const comparedFields=(sharedIdentity?['quantity','price_decimal','value']:['quantity','name','sku','price_decimal','value']) as (keyof Pick<Product,'name'|'sku'|'quantity'|'price_decimal'|'value'>)[];
 const validDraft=draft&&!Object.keys(validate(draft)).length;
 return <section className="conflict-comparison" aria-label="Comparación de versiones" tabIndex={-1}>
  {sharedIdentity&&<p className="comparison-identity" data-testid="conflict-identity">{original.name} · {original.sku}</p>}
  <div ref={scrollRef} className="comparison-scroll" role={edges.overflow?'region':undefined} aria-label={edges.overflow?'Valores de las versiones':undefined} aria-describedby={edges.overflow?'comparison-scroll-help':undefined} tabIndex={edges.overflow?0:undefined} onKeyDown={e=>{
   if(e.target!==e.currentTarget)return;
   if(e.key==='Home'||e.key==='End'){e.preventDefault();e.currentTarget.scrollLeft=e.key==='Home'?0:e.currentTarget.scrollWidth;}
   else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.currentTarget.scrollLeft+=e.key==='ArrowRight'?160:-160;}
  }}>
  <div className="comparison-fields">
  {comparedFields.map(field=>{
   const label=field==='value'?'Valor':labels[field],unchanged=original[field]===current[field];
   const formatted=(p:Product)=>field==='price_decimal'||field==='value'?amount(p[field]):p[field];
   const numeric=field!=='name'&&field!=='sku';
   const draftValue=draft?(field==='value'?(validDraft?amount(multiply(draft.price_decimal,draft.quantity)):'Revisa los campos'):field==='price_decimal'?draft[field].replace('.',','):draft[field]):null;
   const shared=unchanged&&(draftValue===null||draftValue===formatted(current)||field==='price_decimal'&&draftValue===current.price_decimal.replace('.',','));
   return <Fragment key={field}><section className={'comparison-field'+(shared?' comparison-unchanged':'')} data-field={field} aria-label={field==='quantity'?'Cantidad antes de decidir':label+' antes de decidir'}>
    <h3>{label}{shared&&<span className="font-normal"> · Sin cambios</span>}</h3>
    <dl className={draft?'comparison-three':'comparison-two'}>
     {shared?<div className="comparison-shared"><dt className="sr-only">Al abrir y actual</dt><dd data-version="both">{numeric?<Exact value={formatted(current)} label={label}/>:formatted(current)}</dd></div>:[['Al abrir',formatted(original),'original'],['Actual',formatted(current),'current'],...(draft?[['Tu borrador',draftValue!,'draft']]:[])].map(([heading,value,version])=><div key={version}><dt>{heading}</dt><dd data-version={version}>{numeric?<Exact value={value} label={heading+', '+label}/>:value}</dd></div>)}
    </dl>
   </section></Fragment>;
  })}
  </div>
  </div>
  {edges.overflow&&<p id="comparison-scroll-help" className="comparison-scroll-help">{edges.start&&'← '}Desplaza la comparación para ver todas las versiones.{edges.end&&' →'}</p>}
  <p className="comparison-versions">Al abrir · versión {original.version} · Actual · versión {current.version}</p>
  {actions}
 </section>;
}

function Exact({value,label}:{value:string;label:string}) {
 const ref=useRef<HTMLSpanElement>(null),[edges,setEdges]=useState({overflow:false,start:false,end:false});
 useEffect(()=>{const el=ref.current;if(!el)return;const measure=()=>{const next={overflow:el.scrollWidth>el.clientWidth+1,start:el.scrollLeft>1,end:el.scrollLeft+el.clientWidth<el.scrollWidth-1};setEdges(old=>old.overflow===next.overflow&&old.start===next.start&&old.end===next.end?old:next);};const observer=new ResizeObserver(measure);observer.observe(el);el.addEventListener('scroll',measure,{passive:true});el.scrollLeft=0;measure();void document.fonts.ready.then(measure);return()=>{observer.disconnect();el.removeEventListener('scroll',measure);};},[value]);
 return <span className={`exact-wrap${edges.overflow?' has-overflow':''}`} data-more-start={edges.start||undefined} data-more-end={edges.end||undefined}><span ref={ref} className="exact-number" tabIndex={edges.overflow?0:undefined} role={edges.overflow?'region':undefined} aria-label={edges.overflow?`${label}: ${value}. Desplaza horizontalmente para ver todas las cifras.`:undefined} onKeyDown={e=>{if(edges.overflow&&(e.key==='Home'||e.key==='End')){e.preventDefault();e.currentTarget.scrollLeft=e.key==='Home'?0:e.currentTarget.scrollWidth;}}}>{value}</span>{edges.overflow&&<span className="overflow-hint" aria-hidden="true">{edges.start&&'← '}Desplaza para ver todas las cifras{edges.end&&' →'}</span>}</span>;
}
function Changes({previous,product}:{previous:Product;product:Product}) {
 return <span className="changed-fields">{(['name','sku','quantity','price_decimal','value'] as const).filter(f=>previous[f]!==product[f]).map(f=>{
  const identity=f==='name'||f==='sku';
  const label=f==='value'?'Valor':labels[f];
  const before=f==='price_decimal'||f==='value'?amount(previous[f]):previous[f];
  const after=f==='price_decimal'||f==='value'?amount(product[f]):product[f];
  return <span key={f} className={identity?'identity-change':''}>
   {/* Announce one continuous change; the mobile before/after grid is its visual presentation. */}
   {identity&&<span className="sr-only">{label}: {before} → {after}</span>}
   <span className="change-label" aria-hidden={identity||undefined}>{label}: </span>
   <span className="change-before" aria-hidden={identity||undefined}><span className="change-caption">Antes: </span>{before}</span>
   <span className="change-arrow" aria-hidden={identity||undefined}> → </span>
   <span className="change-after" aria-hidden={identity||undefined}><span className="change-caption">Ahora: </span>{after}</span>
  </span>;
 })}</span>;
}
