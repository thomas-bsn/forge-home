export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const LAYOUTS = [
  { id: 'cards', label: 'Cartes', desc: 'Une grille de cartes simple et propre.' },
  { id: 'launcher', label: 'Lanceur', desc: 'Grosses icônes, horloge et recherche, comme l’écran d’un téléphone.' },
  { id: 'dashboard', label: 'Tableau de bord', desc: 'Chiffres clés, alertes et historique des temps de réponse.' },
  { id: 'minimal', label: 'Minimal', desc: 'Style terminal, dense, avec un raccourci clavier par app.' },
];

export const DISCORD_CALLBACK_PATH = '/api/auth/discord/callback';

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
