import { useState } from 'react';

const SLOW_MS = 1000;

// up | slow | down | pending (pas encore vérifiée)
export function statusOf(app) {
  if (!app.status) return 'pending';
  if (app.status === 'down') return 'down';
  return app.responseTime > SLOW_MS ? 'slow' : 'up';
}

export const STATUS_LABEL = { up: 'en ligne', slow: 'lente', down: 'hors ligne', pending: 'vérification…' };

export function statusDetail(app) {
  if (!app.status) return 'vérification…';
  if (app.code) return `HTTP ${app.code} · ${app.responseTime} ms`;
  return app.error || 'injoignable';
}

// Regroupe les apps par catégorie, dans l'ordre d'apparition. Les apps sans catégorie vont à la fin.
export function groupByCategory(apps) {
  const groups = new Map();
  for (const app of apps) {
    const key = app.category || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(app);
  }
  const named = [...groups].filter(([k]) => k);
  const fallback = groups.get('');
  const result = named.map(([name, list]) => ({ name, apps: list }));
  if (fallback) result.push({ name: named.length ? 'Autres' : '', apps: fallback });
  return result;
}

function colorFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 48%)`;
}

export function AppIcon({ app, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (failed || !app.favicon) {
    return (
      <span className={`app-icon app-icon-fallback ${className}`} style={{ background: colorFor(app.name) }}>
        {app.name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img className={`app-icon ${className}`} src={app.favicon} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function Dot({ status, className = '' }) {
  return <span className={`dot dot-${status} ${className}`} aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} />;
}

// Un raccourci clavier n'est jamais actif pendant la saisie ou quand une fenêtre est ouverte.
export function keyboardIsFree(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return false;
  return !document.querySelector('.modal-backdrop');
}
