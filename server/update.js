import { readFileSync } from 'node:fs';

// Version installée : celle du package.json embarqué dans l'image.
export const CURRENT_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const REPO = process.env.UPDATE_REPO || 'thomas-bsn/forge-home';
const ENABLED = process.env.UPDATE_CHECK !== 'false';
// L'API GitHub sans jeton accepte 60 requêtes/heure par IP : une vérification toutes les 6 h suffit.
const CHECK_EVERY_MS = 6 * 60 * 60_000;

let cache = { at: 0, release: null };

const parts = (v) => v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);

function isNewer(latest, current) {
  const [a, b] = [parts(latest), parts(current)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

async function fetchLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'forge-home' },
    signal: AbortSignal.timeout(5000),
  });
  // 404 : le dépôt n'a encore publié aucune release.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub a répondu HTTP ${res.status}`);
  const { tag_name, html_url, published_at } = await res.json();
  return { version: tag_name.replace(/^v/, ''), url: html_url, publishedAt: published_at };
}

// Dernière release publiée sur GitHub si elle est plus récente que la version installée, sinon null.
export async function availableUpdate() {
  if (!ENABLED) return null;
  if (Date.now() - cache.at > CHECK_EVERY_MS) {
    try {
      cache = { at: Date.now(), release: await fetchLatestRelease() };
    } catch (err) {
      // GitHub injoignable : on réessaiera dans 10 minutes, en gardant le dernier résultat connu.
      cache.at = Date.now() - CHECK_EVERY_MS + 10 * 60_000;
      console.warn(`Vérification des mises à jour impossible : ${err.message}`);
    }
  }
  const { release } = cache;
  return release && isNewer(release.version, CURRENT_VERSION) ? release : null;
}
