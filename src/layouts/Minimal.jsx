import { useEffect, useMemo, useState } from 'react';
import { groupByCategory, keyboardIsFree, statusOf } from '../apps.jsx';

// Attribue à chaque app une touche unique : une lettre de son nom si possible, sinon un chiffre.
function assignShortcuts(apps) {
  const used = new Set();
  const keys = new Map();
  for (const app of apps) {
    const letters = [...app.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')];
    const key = letters.find((c) => !used.has(c)) ?? [...'0123456789'].find((c) => !used.has(c));
    if (key) {
      used.add(key);
      keys.set(app.url, key);
    }
  }
  return keys;
}

export default function Minimal({ title, apps, actions }) {
  const shortcuts = useMemo(() => assignShortcuts(apps), [apps]);
  const [now, setNow] = useState(() => new Date());
  const upCount = apps.filter((a) => a.status === 'up').length;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (!keyboardIsFree(e)) return;
      const app = apps.find((a) => shortcuts.get(a.url) === e.key.toLowerCase());
      if (app) window.open(app.url, '_blank', 'noopener');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apps, shortcuts]);

  return (
    <div className="l-minimal">
      <div className="prompt">
        <span>
          <b>~/{title.toLowerCase().replace(/\s+/g, '-')}</b> $ status — {upCount}/{apps.length} up ·{' '}
          {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {actions}
      </div>
      <div className="cols">
        {groupByCategory(apps).map((group) => (
          <section key={group.name || '_'}>
            <h2>## {(group.name || 'apps').toLowerCase()}</h2>
            {group.apps.map((app) => {
              const status = statusOf(app);
              return (
                <a key={app.url} href={app.url} target="_blank" rel="noopener noreferrer" title={app.description ? `${app.description}\n${app.url}` : app.url}>
                  <span className="k">{shortcuts.get(app.url) ?? ' '}</span>
                  <span className={`st st-${status}`}>{status === 'down' ? '○' : '●'}</span>
                  <span className="n">{app.name.toLowerCase()}</span>
                  {app.description && <span className="d"># {app.description.toLowerCase()}</span>}
                  <span className="ms">
                    {status === 'pending' ? '…' : status === 'down' ? 'down' : `${app.responseTime}ms`}
                  </span>
                </a>
              );
            })}
          </section>
        ))}
      </div>
      <p className="hint">Tape la lettre à gauche d’une app pour l’ouvrir.</p>
    </div>
  );
}
