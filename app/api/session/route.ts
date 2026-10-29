import { NextRequest } from 'next/server';
import { safe, session } from '@/lib/db';
export const POST=(req:NextRequest)=>safe(()=>session(req));
