import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const reportSchema = z.object({
  kind: z.enum(['police', 'hazard', 'closure', 'camera']),
  note: z.string().max(500).optional(),
  coordinate: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  })
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid report payload' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    report: {
      id: crypto.randomUUID(),
      ...parsed.data,
      createdAt: new Date().toISOString()
    }
  });
}
