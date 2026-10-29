import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import branding from '@/branding.json';
import fontAssets from '@/lib/font-assets.json';
import './globals.css';
export const metadata: Metadata = { title: `${branding.logoText} · Inventario compartido`, description: 'Consulta, agrega y corrige productos en un inventario compartido. Existencias legibles e importes exactos.', manifest:'/manifest.webmanifest' };
export default function RootLayout({children}:{children:React.ReactNode}) {
 const styles={'--brand-background':branding.backgroundColor,'--brand-surface':branding.secondaryColor,'--brand-primary':branding.primaryColor,'--brand-accent':branding.accentColor,'--brand-text':branding.textColor,'--brand-font-heading':`"${branding.fontHeading}"`,'--brand-font-body':`"${branding.fontBody}"`} as CSSProperties;
 const collector=`${process.env.NEXT_PUBLIC_CONSTRUCTOR_API}/v1/projects/${process.env.NEXT_PUBLIC_PROJECT_ID}/analytics`;
 // Restrict the collector to public route labels and origin-only referrers.
 // Install synchronously before the host's deferred collector can execute.
 // Its authentic script remains unchanged; inventory requests are untouched.
 const privacy=`(()=>{const endpoint=${JSON.stringify(collector+'/events')};const original=window.fetch;window.fetch=function(input,init){if(String(input)===endpoint&&init&&typeof init.body==='string'){try{const b=JSON.parse(init.body);let referrer='';try{referrer=b.referrer?new URL(b.referrer).origin+'/':''}catch{}init={...init,body:JSON.stringify({visitor:b.visitor,session:b.session,path:b.path==='/'?'/':'/[unavailable]',referrer,event:b.event==='Producto abierto'?'Producto abierto':'pageview'})}}catch{}}return original.call(this,input,init)}})();`;
 return <html lang="es"><head><script id="analytics-privacy" dangerouslySetInnerHTML={{__html:privacy}}/><style>{branding.brandbook.fontFaces.map(f=>`@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url('${(fontAssets as Record<string,string>)[f.url]||f.url}') format('truetype')}`).join('\n')}</style></head><body style={styles}>{children}<script src="/constructor-editor.js" defer></script><script src={"https://constructor-api-prod.vercel.app/v1/projects/P-F5UKLM/analytics/script.js"} defer></script></body></html>;
}
