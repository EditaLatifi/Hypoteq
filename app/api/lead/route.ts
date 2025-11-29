import { NextResponse } from 'next/server'
export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log('[hypoteq-lead] incoming payload:', JSON.stringify(body, null, 2))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Bad Request' }, { status: 400 })
  }
}