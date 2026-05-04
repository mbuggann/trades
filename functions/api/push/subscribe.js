export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const subscription = body?.subscription;
    if (!subscription || !subscription.endpoint) {
      return new Response(JSON.stringify({ error: 'Missing subscription' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const key = subscription.endpoint;
    await context.env.PUSH_SUBSCRIPTIONS.put(key, JSON.stringify(subscription));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
