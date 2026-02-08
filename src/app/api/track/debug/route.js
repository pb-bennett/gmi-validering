import { NextResponse } from 'next/server';

const safeHeader = (headers, key) => {
  const value = headers.get(key);
  if (!value) return null;
  if (key === 'x-forwarded-for') {
    const first = value.split(',')[0]?.trim();
    if (!first) return null;
    const parts = first.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.0.0`;
    }
    return 'redacted';
  }
  return value;
};

export async function GET(request) {
  try {
    const geo = request.geo || {};
    const headers = request.headers;

    const headerKeys = [
      'x-vercel-ip-country',
      'x-vercel-ip-country-region',
      'x-vercel-ip-city',
      'x-vercel-ip-latitude',
      'x-vercel-ip-longitude',
      'x-forwarded-for',
      'cf-ipcountry',
    ];

    const headerValues = Object.fromEntries(
      headerKeys.map((key) => [key, safeHeader(headers, key)])
    );

    return NextResponse.json({
      ok: true,
      geo,
      headers: headerValues,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || error) },
      { status: 500 }
    );
  }
}
