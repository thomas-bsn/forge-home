import { useEffect, useRef, useState } from 'react';
import { AppIcon, Dot, STATUS_LABEL, groupByCategory, keyboardIsFree, statusOf } from '../apps.jsx';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Launcher({ title, apps, summary, actions }) {
  const now = useClock();
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  // « / » place le curseur dans la recherche, comme sur GitHub ou YouTube.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && keyboardIsFree(e)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const visible = q ? apps.filter((a) => a.name.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q)) : apps;
  const hour = now.getHours();
  const greeting = hour >= 5 && hour < 18 ? 'Bonjour' : 'Bonsoir';

  const onSearchKey = (e) => {
    if (e.key === 'Enter' && visible[0]) {
      window.open(visible[0].url, '_blank', 'noopener');
      setQuery('');
    } else if (e.key === 'Escape') {
      setQuery('');
      e.currentTarget.blur();
    }
  };

  return (
    <div className="l-launcher">
      <div className="l-launcher-actions">{actions}</div>
      <div className="hero">
        <div className="clock">{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="hello">
          {greeting} · {title} · {summary}
        </div>
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Rechercher une app…"
            aria-label="Rechercher une app"
          />
          <kbd>/</kbd>
        </label>
      </div>

      {visible.length === 0 && <p className="summary center">Aucune app ne correspond à « {query} ».</p>}

      {groupByCategory(visible).map((group) => (
        <section key={group.name || '_'} className="group">
          {group.name && <h2>{group.name}</h2>}
          <div className="tiles">
            {group.apps.map((app) => {
              const status = statusOf(app);
              return (
                <a
                  key={app.url}
                  className={`tile ${status === 'down' ? 'is-down' : ''}`}
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${app.url} · ${STATUS_LABEL[status]}${app.responseTime && status !== 'down' ? ` · ${app.responseTime} ms` : ''}`}
                >
                  <span className="tile-icon">
                    <AppIcon app={app} />
                    <Dot status={status} />
                  </span>
                  <span className="label">{app.name}</span>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
