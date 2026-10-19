import { AppIcon, Dot, SecretMark, statusDetail, statusOf } from '../apps.jsx';

export default function Cards({ title, apps, summary, actions, dragProps }) {
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
          <a key={app.url} {...dragProps(app)} className="card" href={app.url} target="_blank" rel="noopener noreferrer" title={app.url}>
            <AppIcon app={app} className="favicon" />
            <div className="card-body">
              <div className="card-name">
                {app.name}
                {app.secret && <SecretMark />}
              </div>
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
