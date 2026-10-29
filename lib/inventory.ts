export type Draft = { name: string; sku: string; quantity: string; price_decimal: string };
export type Product = Draft & { id: string; version: number; sku_key: string; created_at: string; updated_at: string; value: string };
export type Errors = Partial<Record<keyof Draft | 'form', string>>;
export const fields: (keyof Draft)[] = ['name', 'sku', 'quantity', 'price_decimal'];
export const labels = { name: 'Nombre', sku: 'SKU', quantity: 'Cantidad', price_decimal: 'Precio unitario' };
export const skuKey = (s: string) => s.trim().normalize('NFC').toUpperCase();
export function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.name?.trim()) e.name = 'El nombre es obligatorio.';
  if (!d.sku?.trim()) e.sku = 'El SKU es obligatorio.';
  if (!/^\d+$/.test(d.quantity?.trim() || '') || BigInt(d.quantity.trim() || '0') > 9007199254740991n) e.quantity = 'Introduce una cantidad entera entre 0 y 9007199254740991.';
  if (!/^\d+(?:[.,]\d+)?$/.test(d.price_decimal?.trim() || '')) e.price_decimal = 'Introduce un precio no negativo con coma o punto decimal, sin separadores de miles.';
  return e;
}
export function decimal(s: string) { const [a,b=''] = s.replace(',', '.').split('.'); return { coefficient: BigInt(a+b), scale: b.length }; }
export function decimalString(c: bigint, scale: number) { const s=c.toString().padStart(scale+1,'0'); return scale ? s.slice(0,-scale)+'.'+s.slice(-scale) : s; }
export function multiply(p: string, q: string) { const d=decimal(p); return decimalString(d.coefficient*BigInt(q),d.scale); }
export function sum(values: string[]) { let c=0n, scale=0; for(const s of values){const d=decimal(s);const n=Math.max(scale,d.scale);c=c*10n**BigInt(n-scale)+d.coefficient*10n**BigInt(n-d.scale);scale=n;} return decimalString(c,scale); }
export function amount(s: string) { const [a,b='']=s.split('.'); return a+','+b.padEnd(2,'0'); }
