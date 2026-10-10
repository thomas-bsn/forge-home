import { useState } from 'react';
import { AppIcon, Dot, statusOf } from '../apps.jsx';

const DOWN_FILTER = '__down__';

function since(ts) {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `depuis ${min} min`;
  return `depuis ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

function History({ checks = [] }) {
  const max = Math.max(1, ...checks.filter((c) => c.status === 'up').map((c) => c.responseTime));
  return (
    <span className="bars" aria-label={`${checks.length} dernières vérifications`}>
      {checks.map((c, i) => (
        <i
          key={i}
          className={c.status === 'down' ? 'bar-down' : ''}
          style={{ height: c.status === 'down' ? '100%' : `${Math.max(15, (c.responseTime / max) * 100)}%` }}
          title={c.status === 'down' ? 'hors ligne' : `${c.responseTime} ms`}
        />
      ))}
    </span>
  );
}

export default function Dashboard({ title, apps, lastCheck, actions }) {
  const [filter, setFilter] = useState(null);
  const categories = [...new Set(apps.map((a) => a.category).filter(Boolean))];
  const down = apps.filter((a) => a.status === 'down');
  const upApps = apps.filter((a) => a.status === 'up');
  const avg = upApps.length ? Math.round(upApps.reduce((s, a) => s + a.responseTime, 0) / upApps.length) : null;

  const shown = apps
    .filter((a) => !filter || (filter === DOWN_FILTER ? a.status === 'down' : a.category === filter))
    // Les apps hors ligne en premier ; le tri est stable, l'ordre choisi est conservé pour le reste.
    .sort((a, b) => (b.status === 'down') - (a.status === 'down'));

  const chip = (value, label) => (
    <button key={label} type="button" className={`chip ${filter === value ? 'on' : ''}`} onClick={() => setFilter(value)}>
      {label}
    </button>
  );

  return (
    <div className="l-dashboard">
      <div className="top">
        <h1>{title}</h1>
        {actions}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="k">En ligne</div>
          <div className="v up">
            {upApps.length}
            <small> / {apps.length}</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">Hors ligne</div>
          <div className={`v ${down.length ? 'down' : ''}`}>{down.length}</div>
        </div>
        <div className="stat">
          <div className="k">Temps de réponse moyen</div>
          <div className="v">{avg === null ? '–' : `${avg} ms`}</div>
        </div>
        <div className="stat">
          <div className="k">Dernière vérification</div>
          <div className="v">{lastCheck ? lastCheck.toLocaleTimeString('fr-FR') : '–'}</div>
        </div>
      </div>

      {down.length > 0 && (
        <div className="alert" role="status">
          <Dot status="down" />
          <span>
            {down.map((a, i) => (
              <span key={a.url}>
                {i > 0 && (i === down.length - 1 ? ' et ' : ', ')}
                <b>{a.name}</b>
              </span>
            ))}{' '}
            {down.length > 1 ? 'ne répondent plus' : 'ne répond plus'}
            {down.length === 1 && down[0].downSince ? ` ${since(down[0].downSince)}` : ''}.
          </span>
        </div>
      )}

      {(categories.length > 0 || down.length > 0) && (
        <div className="filters">
          {chip(null, 'Toutes')}
          {categories.map((c) => chip(c, c))}
          {down.length > 0 && chip(DOWN_FILTER, '⚠ Hors ligne')}
        </div>
      )}

      <div className="table">
        <div className="row head">
          <span />
          <span>App</span>
          <span>Catégorie</span>
          <span className="right">Réponse</span>
          <span>Historique</span>
        </div>
        {shown.map((app) => {
          const status = statusOf(app);
          return (
            <a key={app.url} className="row" href={app.url} target="_blank" rel="noopener noreferrer" title={app.description ? app.url : undefined}>
              <AppIcon app={app} />
              <span className="ellipsis">
                <span className="name">{app.name}</span>
                <span className="url">{app.description || app.url.replace(/^https?:\/\//, '')}</span>
              </span>
              <span className="cat">{app.category || '–'}</span>
              <span className={`ms right ms-${status}`}>
                {status === 'pending' ? '…' : status === 'down' ? app.error || 'hors ligne' : `${app.responseTime} ms`}
              </span>
              <History checks={app.history} />
            </a>
          );
        })}
      </div>
    </div>
  );
}
