import 'server-only';
import { createInitializer } from './initialize.cjs';
import { createClient, type Row } from '@libsql/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { multiply, sum, skuKey, validate, type Draft, type Product } from './inventory';

export const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'bigint' });
export const initialize = createInitializer(db);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function trusted(req:NextRequest) {
  const allowed=[process.env.APP_ORIGIN,process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}`:undefined].filter(Boolean).map(s=>new URL(s!).origin);
  return !!req.headers.get('origin') && allowed.includes(req.headers.get('origin')!);
}
export async function owner(req:NextRequest) {
  const token=req.cookies.get('almacen_session')?.value;
  if(!token) return null;
  const r=await db.execute({sql:'SELECT id FROM anonymous_sessions WHERE token_hash=?',args:[hash(token)]});return r.rows[0]?.id?.toString()||null;
}
export function product(r:Row):Product {
 return {id:String(r.id),name:String(r.name),sku:String(r.sku),sku_key:String(r.sku_key),quantity:String(r.quantity),price_decimal:String(r.price_decimal),version:Number(r.version),created_at:String(r.created_at),updated_at:String(r.updated_at),value:multiply(String(r.price_decimal),String(r.quantity))};
}
export async function session(req:NextRequest) {
 if(!trusted(req)) return json({state:'forbidden',message:'Origen no permitido.'},403);
 await initialize(); const body=await req.json().catch(()=>({}));let id=await owner(req);let token:string|undefined;
 if(body.key&&!id)return json({state:'unauthorized',message:'Inicia una sesión para recuperar tus resultados.'},401);
 if(!id){id=randomUUID();token=randomBytes(32).toString('hex');await db.execute({sql:'INSERT INTO anonymous_sessions(id,token_hash,created_at) VALUES (?,?,?)',args:[id,hash(token),new Date().toISOString()]});}
 const rows=await db.execute(body.key ? {sql:'SELECT idempotency_key, operation, product_id, payload, response_json, http_status, created_at FROM mutations WHERE session_id=? AND idempotency_key=?',args:[id,String(body.key)]}:{sql:'SELECT idempotency_key, operation, product_id, payload, response_json, http_status, created_at FROM mutations WHERE session_id=? ORDER BY created_at DESC LIMIT 30',args:[id]});
 if(body.key&&!rows.rows.length) return json({state:'not_found',message:'No hay un resultado registrado para este envío.'},404);
 const response=json({state:'ready',results:rows.rows.map(r=>({key:r.idempotency_key,operation:r.operation,product_id:r.product_id,payload:JSON.parse(String(r.payload)),result:JSON.parse(String(r.response_json)),status:Number(r.http_status),created_at:r.created_at}))});
 if(token){const secure=new URL(process.env.APP_ORIGIN!).protocol==='https:';response.cookies.set('almacen_session',token,{httpOnly:true,secure,sameSite:secure?'none':'lax',partitioned:secure,path:'/',maxAge:60*60*24*365});}return response;
}
export async function list(req:NextRequest) {
 await initialize();const q=(req.nextUrl.searchParams.get('q')||'').trim().normalize('NFC');const escaped=q.replace(/[\\%_]/g,'\\$&');
 const results=await db.batch([{sql:`SELECT * FROM products WHERE name LIKE ? ESCAPE '\\' OR sku_key LIKE ? ESCAPE '\\' ORDER BY created_at,id`,args:[`%${escaped}%`,`%${skuKey(escaped)}%`]},'SELECT quantity,price_decimal FROM products'],'read');
 const all=results[1].rows;return json({query:q,products:results[0].rows.map(product),summary:{products:all.length,units:all.reduce((v,r)=>v+BigInt(String(r.quantity)),0n).toString(),value:sum(all.map(r=>multiply(String(r.price_decimal),String(r.quantity))))},seeded:true});
}
export async function mutate(req:NextRequest,operation:'create'|'update'|'delete',id?:string) {
 if(!trusted(req))return json({state:'forbidden',message:'Origen no permitido.'},403);
 await initialize();const sessionId=await owner(req);if(!sessionId)return json({state:'session_blocked',message:'No se puede guardar sin una sesión. Permite las cookies de la aplicación o ábrela fuera del marco.'},401);
 const body=await req.json().catch(()=>null);
 if(!body||typeof body.key!=='string'||!body.key||body.key.length>200||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return json({state:'invalid',errors:{form:'Falta el sobre de envío: clave y datos.'}},400);
 const p=body.payload;const allowed=operation==='delete'?['version']:operation==='create'?['name','sku','quantity','price_decimal']:['name','sku','quantity','price_decimal','version'];
 if(Object.keys(body).some(k=>!['key','payload'].includes(k))||Object.keys(p).some(k=>!allowed.includes(k)))return json({state:'invalid',errors:{form:'El envío contiene campos no permitidos.'}},400);
 const canonical=JSON.stringify({operation,id:id||null,payload:Object.fromEntries(Object.keys(p).sort().map(k=>[k,p[k]]))}); const fingerprint=hash(canonical);
 const tx=await db.transaction('write');
 try {
  const previous=(await tx.execute({sql:'SELECT payload_hash,http_status,response_json FROM mutations WHERE session_id=? AND idempotency_key=?',args:[sessionId,body.key]})).rows[0];
  if(previous){await tx.rollback();return previous.payload_hash===fingerprint?json(JSON.parse(String(previous.response_json)),Number(previous.http_status)):json({state:'key_conflict',message:'Esta clave pertenece a otro envío. Recupera el envío original.'},409);}
  let status=200; let result:Record<string,unknown>={}; let target=id||null;
  const errors=operation==='delete'?{}:validate(Object.fromEntries(['name','sku','quantity','price_decimal'].map(k=>[k,typeof p[k]==='string'?p[k]:''])) as Draft);
  if(operation!=='create'&&(!Number.isSafeInteger(p.version)||p.version<1))Object.assign(errors,{form:'La versión debe ser un entero positivo.'});
  if(Object.keys(errors).length){status=400;result={state:'invalid',errors};}
  else {
   const current=id?(await tx.execute({sql:'SELECT * FROM products WHERE id=?',args:[id]})).rows[0]:undefined;
   if(id&&!current){status=404;result={state:'missing',message:'Este producto fue eliminado. Tu borrador se conserva.'};}
   else if(current&&Number(current.version)!==p.version){status=409;result={state:'conflict',message:'Este producto cambió desde que lo abriste.',current:product(current)};}
   else {
    const duplicate=operation!=='delete'?(await tx.execute({sql:'SELECT id FROM products WHERE sku_key=? AND id<>?',args:[skuKey(p.sku),id||'']})).rows[0]:undefined;
    if(duplicate){status=409;result={state:'duplicate',errors:{sku:'Este SKU ya existe. Introduce un SKU único.'}};}
    else {
     const now=new Date().toISOString();
     if(operation==='create'){target=randomUUID();await tx.execute({sql:'INSERT INTO products(id,name,sku,sku_key,quantity,price_decimal,version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)',args:[target,p.name.trim(),p.sku.trim(),skuKey(p.sku),BigInt(p.quantity.trim()),p.price_decimal.trim().replace(',','.'),now,now]});status=201;}
     else if(operation==='update')await tx.execute({sql:'UPDATE products SET name=?,sku=?,sku_key=?,quantity=?,price_decimal=?,version=version+1,updated_at=? WHERE id=? AND version=?',args:[p.name.trim(),p.sku.trim(),skuKey(p.sku),BigInt(p.quantity.trim()),p.price_decimal.trim().replace(',','.'),now,id!,p.version]});
     else await tx.execute({sql:'DELETE FROM products WHERE id=? AND version=?',args:[id!,p.version]});
     const saved=operation==='delete'?current!:(await tx.execute({sql:'SELECT * FROM products WHERE id=?',args:[target!]})).rows[0];
     result={state:'confirmed',operation,product:product(saved),previous:current?product(current):null,key:body.key};
    }
   }
  }
  await tx.execute({sql:'INSERT INTO mutations(id,session_id,idempotency_key,operation,product_id,payload,payload_hash,state,http_status,response_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',args:[randomUUID(),sessionId,body.key,operation,target,canonical,fingerprint,String(result.state),status,JSON.stringify(result),new Date().toISOString(),new Date().toISOString()]});
  await tx.commit();return json(result,status);
 } catch(e){await tx.rollback();throw e;} finally {tx.close();}
}
export async function safe(fn:()=>Promise<NextResponse>) {try{return await fn();}catch(e){console.error('Inventory request failed:', e instanceof Error?e.name:'unknown');return json({state:'recoverable',message:'No se pudo confirmar la respuesta. Conserva el envío y vuelve a intentarlo.'},503);}}
