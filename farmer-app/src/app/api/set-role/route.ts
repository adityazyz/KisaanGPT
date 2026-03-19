import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs';

const ROLE = 'farmer';

export async function POST() {
  const { userId, getToken } = auth();

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 1. Stamp Clerk publicMetadata
  await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata: { role: ROLE },
  });

  // 2. Directly update DB — no webhook timing dependency
  try {
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/internal/set-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ role: ROLE }),
    });
  } catch (e) {
    console.error('[set-role] DB sync failed:', e);
  }

  return NextResponse.json({ ok: true, role: ROLE });
}
