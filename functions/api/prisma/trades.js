const API_URL = 'https://api.prismagroup.online/api/trades/recent?limit=100&period=today';

export async function onRequest() {
  try {
    const res = await fetch(API_URL, {
      headers: { Accept: 'application/json' },
    });

    const body = await res.text();

    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
