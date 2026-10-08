import express from 'express';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkApp, resolveFavicon } from './status.js';
import { DATA_DIR, FAVICON_FILE, InputError, applyFavicon, loadConfig, newSecret, parseSite, saveConfig } from './store.js';
import {
  authIdentityChanged,
  checkPassword,
  clearSession,
  discordAuthorizeUrl,
  discordIdentify,
  isAdmin,
  parseAuth,
  parseCookies,
  setSession,
} from './auth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const HISTORY_LENGTH = 20;
const OAUTH_COOKIE = 'hp_oauth_state';

// Ce que le navigateur a le droit de voir de la config (jamais les secrets).
function publicConfig(cfg, canEdit) {
  const { auth } = cfg;
  return {
    configured: true,
    title: cfg.title,
    layout: cfg.layout,
    favicon: cfg.favicon ? `/api/site-favicon?v=${cfg.favicon.hash}` : null,
    apps: cfg.apps,
    auth: {
      mode: auth.mode,
      ...(auth.mode === 'discord' && { ready: Boolean(auth.ownerId) }),
      ...(auth.mode === 'discord' && canEdit && { clientId: auth.clientId, redirectUri: auth.redirectUri, ownerName: auth.ownerName }),
    },
    canEdit,
  };
}

// Historique des vérifications, en mémoire : il repart de zéro au redémarrage.
const history = new Map();

function record(url, check) {
  const entry = history.get(url) ?? { checks: [], downSince: null };
  entry.checks = [...entry.checks, { status: check.status, responseTime: check.responseTime }].slice(-HISTORY_LENGTH);
  entry.downSince = check.status === 'down' ? (entry.downSince ?? Date.now()) : null;
  history.set(url, entry);
  return entry;
}

// Limite les essais de mot de passe : 5 par minute et par IP.
const loginAttempts = new Map();

function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.reset < now) {
    loginAttempts.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  return ++entry.count > 5;
}

const app = express();
app.disable('x-powered-by');
// Derrière un reverse proxy (Traefik, Nginx…) sur le réseau local, pour connaître le vrai protocole et l'IP.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(express.json({ limit: '1mb' }));

app.get('/api/config', async (req, res) => {
  const cfg = await loadConfig();
  res.set('cache-control', 'no-store');
  if (!cfg) return res.json({ configured: false });
  res.json(publicConfig(cfg, isAdmin(req, cfg)));
});

// Premier lancement uniquement : refusé dès qu'une config existe.
app.post('/api/setup', async (req, res) => {
  if (await loadConfig()) return res.status(409).json({ error: 'La page est déjà configurée' });
  const site = parseSite(req.body);
  const auth = await parseAuth(req.body?.auth);
  const favicon = await applyFavicon(req.body?.favicon ?? undefined, null);
  const cfg = { version: 1, ...site, favicon, auth, secret: newSecret() };
  await saveConfig(cfg);
  if (auth.mode === 'password') setSession(req, res, cfg.secret, 'password');
  res.json(publicConfig(cfg, auth.mode !== 'discord'));
});

app.put('/api/config', async (req, res) => {
  const cfg = await loadConfig();
  if (!cfg) return res.status(409).json({ error: 'La page n’est pas encore configurée' });
  if (!isAdmin(req, cfg)) return res.status(401).json({ error: 'Connexion requise' });

  const site = parseSite(req.body);
  const auth = req.body?.auth ? await parseAuth(req.body.auth, cfg.auth) : cfg.auth;
  const favicon = await applyFavicon(req.body?.favicon, cfg.favicon);
  // Changer de protection déconnecte tout le monde ; celui qui vient de définir un mot de passe reste connecté.
  const rotate = authIdentityChanged(cfg.auth, auth);
  const next = { ...cfg, ...site, favicon, auth, secret: rotate ? newSecret() : cfg.secret };
  await saveConfig(next);

  let canEdit = true;
  if (rotate) {
    if (auth.mode === 'password') setSession(req, res, next.secret, 'password');
    canEdit = auth.mode !== 'discord';
  }
  res.json(publicConfig(next, canEdit));
});

app.post('/api/login', async (req, res) => {
  const cfg = await loadConfig();
  if (cfg?.auth.mode !== 'password') return res.status(400).json({ error: 'Pas de mot de passe sur cette page' });
  if (tooManyAttempts(req.ip)) return res.status(429).json({ error: 'Trop d’essais, réessaie dans une minute' });
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!(await checkPassword(password, cfg.auth))) return res.status(401).json({ error: 'Mot de passe incorrect' });
  setSession(req, res, cfg.secret, 'password');
  res.sendStatus(204);
});

app.post('/api/logout', (req, res) => {
  clearSession(res);
  res.sendStatus(204);
});

app.get('/api/auth/discord', async (req, res) => {
  const cfg = await loadConfig();
  if (cfg?.auth.mode !== 'discord') return res.redirect('/');
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(OAUTH_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 10 * 60_000, path: '/api/auth' });
  res.redirect(discordAuthorizeUrl(cfg.auth, state));
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const done = (result) => res.redirect(`/?login=${result}`);
  const cfg = await loadConfig();
  if (cfg?.auth.mode !== 'discord') return done('error');

  const state = parseCookies(req)[OAUTH_COOKIE];
  res.clearCookie(OAUTH_COOKIE, { path: '/api/auth' });
  if (typeof req.query.code !== 'string' || !state || req.query.state !== state) return done('error');

  let user;
  try {
    user = await discordIdentify(cfg.auth, req.query.code);
  } catch (err) {
    console.error(`Connexion Discord : ${err.message}`);
    return done('error');
  }

  if (!cfg.auth.ownerId) {
    // Première connexion : ce compte Discord devient le propriétaire de la page.
    cfg.auth = { ...cfg.auth, ownerId: user.id, ownerName: user.name };
    await saveConfig(cfg);
  } else if (cfg.auth.ownerId !== user.id) {
    return done('refused');
  }
  setSession(req, res, cfg.secret, `discord:${user.id}`);
  done('ok');
});

app.get('/api/apps', async (req, res) => {
  const cfg = await loadConfig();
  const apps = cfg?.apps ?? [];
  const results = await Promise.all(
    apps.map(async (a) => {
      const check = await checkApp(a);
      const { checks, downSince } = record(a.url, check);
      return {
        ...a,
        favicon: `/api/favicon?url=${encodeURIComponent(a.url)}`,
        ...check,
        history: checks,
        downSince,
      };
    }),
  );
  const urls = new Set(apps.map((a) => a.url));
  for (const url of history.keys()) if (!urls.has(url)) history.delete(url);
  res.set('cache-control', 'no-store').json(results);
});

app.get('/api/favicon', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  // Anti-SSRF : on ne proxifie que les URLs des apps configurées.
  const cfg = await loadConfig();
  if (!cfg?.apps.some((a) => a.url === url)) return res.sendStatus(404);

  const img = await resolveFavicon(url);
  if (!img) return res.set('cache-control', 'public, max-age=300').sendStatus(404);
  res
    .set('content-type', img.type)
    .set('cache-control', 'public, max-age=3600')
    .set('x-content-type-options', 'nosniff')
    .set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
    .send(img.body);
});

// Favicon de la page elle-même, envoyé au setup ou via le crayon.
app.get('/api/site-favicon', async (req, res) => {
  const cfg = await loadConfig();
  if (!cfg?.favicon) return res.sendStatus(404);
  let body;
  try {
    body = await readFile(FAVICON_FILE);
  } catch {
    return res.sendStatus(404);
  }
  res
    .set('content-type', cfg.favicon.type)
    .set('cache-control', 'public, max-age=31536000, immutable')
    .set('x-content-type-options', 'nosniff')
    .set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
    .send(body);
});

app.use('/api', (req, res) => res.sendStatus(404));

if (process.env.NODE_ENV === 'production') {
  if (!existsSync(DIST_DIR)) {
    console.error('dist/ introuvable : lance `npm run build` avant `npm start`.');
    process.exit(1);
  }
  app.use(express.static(DIST_DIR));
  app.use((req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err instanceof InputError) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Envoi trop volumineux' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`API prête sur http://localhost:${PORT} (données : ${DATA_DIR})`);
});
