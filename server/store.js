import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteName, withScheme } from './status.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const FAVICON_FILE = path.join(DATA_DIR, 'favicon');

export const LAYOUTS = ['cards', 'launcher', 'dashboard', 'minimal'];
const FAVICON_TYPES = ['image/png', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/webp', 'image/gif'];
const FAVICON_MAX_BYTES = 512 * 1024;
const MAX_APPS = 200;

// Erreur de saisie : renvoyée telle quelle au client en 400.
export class InputError extends Error {}

export const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const newSecret = () => crypto.randomBytes(32).toString('hex');

// config.json est relu à chaque appel : une modification à la main est prise en compte sans redémarrer.
// null = premier lancement, l'assistant de configuration doit s'afficher.
export async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Lecture de ${CONFIG_FILE} impossible : ${err.message}`);
  }
}

export async function saveConfig(cfg) {
  await mkdir(DATA_DIR, { recursive: true });
  // Écriture atomique : on ne laisse jamais un config.json à moitié écrit.
  const tmp = `${CONFIG_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  await rename(tmp, CONFIG_FILE);
}

export async function parseSite(body) {
  const title = str(body?.title, 80) || 'Mes apps';
  const layout = LAYOUTS.includes(body?.layout) ? body.layout : 'cards';
  if (!Array.isArray(body?.apps)) throw new InputError('La liste des apps est manquante');
  if (body.apps.length > MAX_APPS) throw new InputError(`${MAX_APPS} apps maximum`);

  const checkHttpUrl = (label, url, field, example) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new InputError(`${label} : ${field} est invalide (exemple : ${example})`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new InputError(`${label} : ${field} doit commencer par http:// ou https://`);
  };

  // En parallèle pour toutes les apps : schéma deviné (https puis http), puis nom du site si le nom est vide.
  const resolved = await Promise.all(
    body.apps.map(async (a, i) => {
      let name = str(a?.name, 80);
      const label = name || `App n°${i + 1}`;
      const rawUrl = str(a?.url, 2000);
      if (!rawUrl) throw new InputError(`${label} : l’URL est obligatoire`);
      const url = await withScheme(rawUrl);
      checkHttpUrl(label, url, 'l’URL', 'http://192.168.1.10:8096');
      const rawCheckUrl = str(a?.checkUrl, 2000);
      // URL interne facultative, utilisée par le serveur seulement (ex. un nom de conteneur Docker).
      const checkUrl = rawCheckUrl && (await withScheme(rawCheckUrl));
      if (checkUrl) checkHttpUrl(label, checkUrl, 'l’URL interne', 'http://jellyfin:8096');
      name ||= await siteName(checkUrl || url);
      const description = str(a?.description, 140).replace(/\s+/g, ' ');
      return { name, url, category: str(a?.category, 40), ...(description && { description }), ...(checkUrl && { checkUrl }) };
    }),
  );

  const seen = new Set();
  const apps = resolved.map((app) => {
    if (seen.has(app.url)) throw new InputError(`${app.name} : cette URL est déjà utilisée par une autre app`);
    seen.add(app.url);
    return app;
  });

  return { title, layout, apps };
}

// input : undefined = inchangé, null = supprimé, data URL = remplacé.
export async function applyFavicon(input, current) {
  if (input === undefined) return current ?? null;
  if (input === null) {
    await rm(FAVICON_FILE, { force: true });
    return null;
  }
  const m = typeof input === 'string' && input.match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !FAVICON_TYPES.includes(m[1])) throw new InputError('Favicon : format non supporté (PNG, SVG, ICO, JPEG, WebP ou GIF)');
  const body = Buffer.from(m[2], 'base64');
  if (body.length > FAVICON_MAX_BYTES) throw new InputError('Favicon trop lourd (512 Ko maximum)');
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FAVICON_FILE, body);
  return { type: m[1], hash: crypto.createHash('sha1').update(body).digest('hex').slice(0, 10) };
}
