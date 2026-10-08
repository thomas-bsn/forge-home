import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { InputError, str } from './store.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'hp_session';
const SESSION_MAX_AGE = 30 * 24 * 3600 * 1000;
const DISCORD_TIMEOUT_MS = 10_000;

// --- Mots de passe -----------------------------------------------------------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return { salt, hash };
}

export async function checkPassword(password, { salt, hash }) {
  const candidate = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

// Construit le bloc `auth` de config.json à partir du formulaire.
// En modification, un mot de passe ou un secret Discord laissé vide conserve l'ancien.
export async function parseAuth(input, current) {
  const mode = input?.mode;

  if (mode === 'none') return { mode: 'none' };

  if (mode === 'password') {
    const password = typeof input.password === 'string' ? input.password : '';
    if (!password) {
      if (current?.mode === 'password') return current;
      throw new InputError('Choisis un mot de passe');
    }
    if (password.length < 8) throw new InputError('Le mot de passe doit faire au moins 8 caractères');
    return { mode: 'password', ...(await hashPassword(password)) };
  }

  if (mode === 'discord') {
    const clientId = str(input.clientId, 40);
    if (!/^\d{5,30}$/.test(clientId)) throw new InputError('Client ID Discord invalide (une suite de chiffres)');
    const sameApp = current?.mode === 'discord' && current.clientId === clientId;
    const clientSecret = str(input.clientSecret, 200) || (sameApp ? current.clientSecret : '');
    if (!clientSecret) throw new InputError('Client secret Discord manquant');
    const redirectUri = str(input.redirectUri, 500);
    if (!/^https?:\/\/[^/]+\/api\/auth\/discord\/callback$/.test(redirectUri)) throw new InputError('URL de redirection Discord invalide');
    return {
      mode: 'discord',
      clientId,
      clientSecret,
      redirectUri,
      // Le premier compte Discord qui se connecte devient le propriétaire.
      ownerId: sameApp ? current.ownerId : null,
      ownerName: sameApp ? current.ownerName : null,
    };
  }

  throw new InputError('Mode de protection inconnu');
}

// Faut-il invalider les sessions existantes après ce changement ?
export function authIdentityChanged(prev, next) {
  if (prev.mode !== next.mode) return true;
  if (next.mode === 'password') return prev.hash !== next.hash;
  if (next.mode === 'discord') return prev.ownerId !== next.ownerId;
  return false;
}

// --- Sessions (cookie signé HMAC, sans stockage serveur) ---------------------

const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {}
    }
  }
  return out;
}

function readSession(req, secret) {
  const [data, sig] = (parseCookies(req)[SESSION_COOKIE] || '').split('.');
  if (!data || !sig) return null;
  const expected = sign(data, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(data, 'base64url').toString());
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function setSession(req, res, secret, sub) {
  const data = Buffer.from(JSON.stringify({ sub, exp: Date.now() + SESSION_MAX_AGE })).toString('base64url');
  res.cookie(SESSION_COOKIE, `${data}.${sign(data, secret)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export const clearSession = (res) => res.clearCookie(SESSION_COOKIE, { path: '/' });

export function isAdmin(req, cfg) {
  const auth = cfg.auth;
  if (auth.mode === 'none') return true;
  const session = readSession(req, cfg.secret);
  if (!session) return false;
  if (auth.mode === 'password') return session.sub === 'password';
  if (auth.mode === 'discord') return Boolean(auth.ownerId) && session.sub === `discord:${auth.ownerId}`;
  return false;
}

// --- Discord OAuth2 ----------------------------------------------------------

export function discordAuthorizeUrl(auth, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: auth.clientId,
    scope: 'identify',
    redirect_uri: auth.redirectUri,
    state,
    prompt: 'none',
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export async function discordIdentify(auth, code) {
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: auth.redirectUri,
    }),
    signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
  });
  if (!tokenRes.ok) throw new Error(`Discord a refusé l’échange du code (HTTP ${tokenRes.status})`);
  const { access_token: token } = await tokenRes.json();

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
  });
  if (!userRes.ok) throw new Error(`Profil Discord illisible (HTTP ${userRes.status})`);
  const user = await userRes.json();
  return { id: user.id, name: user.global_name || user.username };
}
