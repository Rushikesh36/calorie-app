import { NextResponse } from 'next/server';
import { callGemini } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const text = await callGemini(prompt);
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}