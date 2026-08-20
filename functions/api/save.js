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

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.DROID_PROGRESS) {
      return new Response(JSON.stringify({ error: 'KV namespace not bound. Bind DROID_PROGRESS in Pages settings.' }), { status: 500, headers: cors() });
    }
    const body = await request.json();
    const rawUsername = (body.username || '').trim().toLowerCase();
    const username = rawUsername.replace(/[^a-z0-9_-]/g, '');
    if (!username || username.length < 2 || username.length > 32) {
      return new Response(JSON.stringify({ error: 'Username must be 2-32 characters (letters, numbers, - and _ only).' }), { status: 400, headers: cors() });
    }
    const record = {
      data: body.data || {},
      updatedAt: new Date().toISOString(),
    };
    await env.DROID_PROGRESS.put('progress:' + username, JSON.stringify(record));
    return new Response(JSON.stringify({ ok: true, updatedAt: record.updatedAt }), { headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error: ' + e.message }), { status: 500, headers: cors() });
  }
}
