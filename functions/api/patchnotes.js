function cors() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=1800',
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

const WIKI_BASE = 'https://star-wars-droid-tycoon.fandom.com';
const CACHE_KEY = 'patchnotes:cache:v1';
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

async function fetchWikitext(title) {
  const url = `${WIKI_BASE}/api.php?action=query&prop=revisions&titles=${encodeURIComponent(title)}&rvslots=main&rvprop=content&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'DroidTycoonTracker/1.0 (patch notes fetcher)' } });
  if (!res.ok) throw new Error('Wiki fetch failed: ' + res.status);
  const json = await res.json();
  const pages = json && json.query && json.query.pages;
  if (!pages) return '';
  const page = Object.values(pages)[0];
  if (!page || !page.revisions || !page.revisions[0]) return '';
  const rev = page.revisions[0];
  if (rev.slots && rev.slots.main && typeof rev.slots.main['*'] === 'string') return rev.slots.main['*'];
  if (typeof rev['*'] === 'string') return rev['*'];
  return '';
}

function stripWikiMarkup(s) {
  return s
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1') // [[link|text]] -> text
    .replace(/\[\[([^\]]*)\]\]/g, '$1')           // [[text]] -> text
    .replace(/'''''/g, '').replace(/'''/g, '').replace(/''/g, '') // bold/italic
    .replace(/<[^>]+>/g, '')                      // strip html tags
    .replace(/\{\{[^}]*\}\}/g, '')                // strip templates
    .trim();
}

function parseUpdateLog(wikitext) {
  if (!wikitext) return [];
  const lines = wikitext.split('\n');
  const entries = [];
  let current = null;
  for (let raw of lines) {
    const line = raw.trim();
    const headingMatch = line.match(/^={2,3}\s*(.+?)\s*={2,3}$/);
    if (headingMatch) {
      if (current && current.items.length) entries.push(current);
      current = { title: stripWikiMarkup(headingMatch[1]), date: '', items: [] };
      continue;
    }
    const dateMatch = line.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    if (dateMatch && current) {
      current.date = line;
      continue;
    }
    const bulletMatch = line.match(/^\*+\s*(.+)$/);
    if (bulletMatch && current) {
      const text = stripWikiMarkup(bulletMatch[1]);
      if (text) current.items.push(text);
    }
  }
  if (current && current.items.length) entries.push(current);
  return entries.slice(0, 8); // most recent handful
}

function parseEvents(wikitext) {
  if (!wikitext) return [];
  const lines = wikitext.split('\n');
  const entries = [];
  let current = null;
  const dateLineRe = /^\d{1,2}(st|nd|rd|th)?(-\d{1,2}(st|nd|rd|th)?)?\s+\w+,?\s+\d{4}$/;
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (dateLineRe.test(line)) {
      if (current && current.text) entries.push(current);
      current = { date: line, title: '', text: '' };
      continue;
    }
    const headingMatch = line.match(/^={2,4}\s*(.+?)\s*={2,4}$/);
    if (headingMatch && current) {
      current.title = stripWikiMarkup(headingMatch[1]);
      continue;
    }
    if (current && !line.startsWith('[[') && !line.startsWith('{{') && !line.startsWith('|')) {
      const text = stripWikiMarkup(line);
      if (text) current.text += (current.text ? ' ' : '') + text;
    }
  }
  if (current && current.text) entries.push(current);
  return entries.slice(0, 6);
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    if (env.DROID_PROGRESS) {
      const cached = await env.DROID_PROGRESS.get(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = (Date.now() - new Date(parsed.fetchedAt).getTime()) / 1000;
        if (age < CACHE_TTL_SECONDS) {
          return new Response(cached, { headers: cors() });
        }
      }
    }

    const [updateLogWikitext, eventsWikitext] = await Promise.all([
      fetchWikitext('Droid_Tycoon_Update_Log').catch(() => ''),
      fetchWikitext('Events').catch(() => ''),
    ]);

    const updateLog = parseUpdateLog(updateLogWikitext);
    const events = parseEvents(eventsWikitext);

    const payload = {
      fetchedAt: new Date().toISOString(),
      source: 'star-wars-droid-tycoon.fandom.com',
      events: events,
      updateLog: updateLog,
    };
    const body = JSON.stringify(payload);

    if (env.DROID_PROGRESS) {
      context.waitUntil(env.DROID_PROGRESS.put(CACHE_KEY, body));
    }

    return new Response(body, { headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch patch notes: ' + e.message }), { status: 500, headers: cors() });
  }
}
