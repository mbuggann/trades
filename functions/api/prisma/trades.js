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
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch trades' }), {
      status: 500,
    });
  }
}
