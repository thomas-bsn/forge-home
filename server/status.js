const TIMEOUT_MS = 3000;
const USER_AGENT = 'Mozilla/5.0 (compatible; homepage-status/1.0)';

function timedFetch(url, init = {}) {
  return fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT, ...init.headers },
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function checkApp(app) {
  const start = performance.now();
  try {
    const res = await timedFetch(app.url);
    const responseTime = Math.round(performance.now() - start);
    res.body?.cancel().catch(() => {});
    return {
      // Une 401/403 (app derrière auth) reste joignable : seules les 5xx comptent comme down.
      status: res.status < 500 ? 'up' : 'down',
      code: res.status,
      responseTime,
    };
  } catch (err) {
    return {
      status: 'down',
      code: null,
      responseTime: Math.round(performance.now() - start),
      error: err.name === 'TimeoutError' ? 'timeout' : err.cause?.code || err.message,
    };
  }
}

// --- Favicon -----------------------------------------------------------------

function getAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

// Renvoie les href des <link rel="icon"> par ordre de préférence.
function findIconLinks(html, baseUrl) {
  const head = html.slice(0, 200_000);
  const icons = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (getAttr(tag, 'rel') || '').toLowerCase().split(/\s+/);
    const href = getAttr(tag, 'href');
    if (!href) continue;
    let priority;
    if (rel.includes('icon')) priority = 0;
    else if (rel.includes('apple-touch-icon')) priority = 1;
    else continue;
    try {
      icons.push({ priority, url: href.startsWith('data:') ? href : new URL(href, baseUrl).href });
    } catch {}
  }
  return icons.sort((a, b) => a.priority - b.priority).map((i) => i.url);
}

function decodeDataUri(uri) {
  const m = uri.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
  if (!m) return null;
  const body = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  return { type: m[1] || 'image/png', body };
}

const isImage = (type) => /^image\/|application\/octet-stream/i.test(type || '');

async function fetchImage(url) {
  if (url.startsWith('data:')) return decodeDataUri(url);
  const res = await timedFetch(url, { headers: { accept: 'image/*,*/*;q=0.8' } });
  const type = res.headers.get('content-type');
  // Beaucoup de SPA renvoient index.html en 200 pour /favicon.ico : on vérifie le type.
  if (!res.ok || !isImage(type)) {
    res.body?.cancel().catch(() => {});
    return null;
  }
  const body = Buffer.from(await res.arrayBuffer());
  return body.length ? { type: type || 'image/x-icon', body } : null;
}

export async function resolveFavicon(appUrl) {
  const candidates = [];
  try {
    const res = await timedFetch(appUrl, { headers: { accept: 'text/html' } });
    if ((res.headers.get('content-type') || '').includes('html')) {
      candidates.push(...findIconLinks(await res.text(), res.url || appUrl));
    } else {
      res.body?.cancel().catch(() => {});
    }
  } catch {}
  candidates.push(new URL('/favicon.ico', appUrl).href);

  for (const url of candidates) {
    try {
      const img = await fetchImage(url);
      if (img) return img;
    } catch {}
  }
  return null;
}
