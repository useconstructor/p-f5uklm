import branding from '@/branding.json';
export default function manifest(){return {name:branding.logoText,short_name:branding.logoText,start_url:'/',display:'standalone' as const,background_color:branding.backgroundColor,theme_color:branding.primaryColor,icons:[{src:'/brand-mark.svg',sizes:'any',type:'image/svg+xml'}]};}
