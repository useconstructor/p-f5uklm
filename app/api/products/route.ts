import { NextRequest } from 'next/server';
import { safe, list, mutate } from '@/lib/db';
export const GET=(req:NextRequest)=>safe(()=>list(req));
export const POST=(req:NextRequest)=>safe(()=>mutate(req,'create'));
