function cors() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    if (!env.DROID_PROGRESS) {
      return new Response(JSON.stringify({ error: 'KV namespace not bound. Bind DROID_PROGRESS in Pages settings.' }), { status: 500, headers: cors() });
    }
    const url = new URL(request.url);
    const rawUsername = (url.searchParams.get('username') || '').trim().toLowerCase();
    const username = rawUsername.replace(/[^a-z0-9_-]/g, '');
    if (!username) {
      return new Response(JSON.stringify({ error: 'Missing username.' }), { status: 400, headers: cors() });
    }
    const raw = await env.DROID_PROGRESS.get('progress:' + username);
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No saved progress found for that username.' }), { status: 404, headers: cors() });
    }
    return new Response(raw, { headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error: ' + e.message }), { status: 500, headers: cors() });
  }
}
