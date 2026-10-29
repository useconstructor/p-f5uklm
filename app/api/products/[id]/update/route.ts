import { NextRequest } from 'next/server';
import { safe, mutate } from '@/lib/db';
export const POST=async(req:NextRequest,ctx:{params:Promise<{id:string}>})=>safe(async()=>mutate(req,'update',(await ctx.params).id));
