import { createWfsProxyHandler, rejectWfsMethod } from '../../../lib/gemini-wfs/wfsProxyHandler.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createWfsProxyHandler();

// Explicit denials keep safe JSON/cache headers, including for Next's default
// HEAD/OPTIONS handling. These methods never invoke the upstream handler.
export const GET = rejectWfsMethod;
export const HEAD = rejectWfsMethod;
export const OPTIONS = rejectWfsMethod;
export const PUT = rejectWfsMethod;
export const PATCH = rejectWfsMethod;
export const DELETE = rejectWfsMethod;
