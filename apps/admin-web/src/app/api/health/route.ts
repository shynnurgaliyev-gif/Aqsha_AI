import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    await getDb()`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
