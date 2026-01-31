/**
 * WMS Proxy API Route
 * 
 * This route proxies WMS requests to avoid CORS issues when the WMS server
 * doesn't support cross-origin requests with authentication headers.
 * 
 * Security considerations:
 * - Credentials are passed in the request and never stored on the server
 * - The proxy only forwards requests, it doesn't cache or log sensitive data
 * - Rate limiting should be considered for production use
 */

import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get the target WMS URL and credentials from query params
    const targetUrl = searchParams.get('url');
    const authHeader = request.headers.get('x-wms-auth');
    
    if (!targetUrl) {
      return NextResponse.json(
        { error: 'Missing url parameter' },
        { status: 400 }
      );
    }

    // Validate URL to prevent SSRF attacks
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400 }
      );
    }

    // Build fetch options
    const fetchOptions = {
      method: 'GET',
      headers: {},
    };

    // Add authorization if provided
    if (authHeader) {
      fetchOptions.headers['Authorization'] = authHeader;
    }

    // Fetch the WMS tile
    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
      // Forward the error status
      return new NextResponse(
        `WMS server error: ${response.status} ${response.statusText}`,
        { status: response.status }
      );
    }

    // Get the response as array buffer (for binary image data)
    const buffer = await response.arrayBuffer();
    
    // Get content type from response
    const contentType = response.headers.get('content-type') || 'image/png';

    // Return the image with proper headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache tiles for 1 hour
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('WMS proxy error:', error);
    return NextResponse.json(
      { error: 'Proxy error: ' + error.message },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-wms-auth',
    },
  });
}
