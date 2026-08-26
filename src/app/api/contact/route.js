import { NextResponse } from 'next/server';
import { createContactPostHandler } from '@/lib/contact/contactHandler.mjs';
import { createContactRateLimiter } from '@/lib/contact/contactRateLimit.mjs';
import { sendContactEmail } from '@/lib/contact/sendContactEmail.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handleContactPost = createContactPostHandler({
  deliver: sendContactEmail,
  rateLimiter: createContactRateLimiter(),
});

export async function POST(request) {
  const result = await handleContactPost(request);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
