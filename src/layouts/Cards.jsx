import { AppIcon, Dot, statusDetail, statusOf } from '../apps.jsx';

export default function Cards({ title, apps, summary, actions }) {
  return (
    <>
      <header className="header">
        <div>
          <h1>{title}</h1>
          <p className="summary">{summary}</p>
        </div>
        {actions}
      </header>

      <main className="grid">
        {apps.map((app) => (
          <a key={app.url} className="card" href={app.url} target="_blank" rel="noopener noreferrer" title={app.url}>
            <AppIcon app={app} className="favicon" />
            <div className="card-body">
              <div className="card-name">{app.name}</div>
              {app.description && <div className="card-desc">{app.description}</div>}
              <div className="card-meta">{statusDetail(app)}</div>
            </div>
            <Dot status={statusOf(app)} />
          </a>
        ))}
      </main>
    </>
  );
}
