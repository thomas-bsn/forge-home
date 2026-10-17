import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Cards from './layouts/Cards.jsx';
import Launcher from './layouts/Launcher.jsx';
import Dashboard from './layouts/Dashboard.jsx';
import Minimal from './layouts/Minimal.jsx';
import Setup from './settings/Setup.jsx';
import Editor from './settings/Editor.jsx';
import Login from './settings/Login.jsx';
import UpdateNotice from './UpdateNotice.jsx';

const REFRESH_MS = 30_000;
const LAYOUT_COMPONENTS = { cards: Cards, launcher: Launcher, dashboard: Dashboard, minimal: Minimal };

const LOGIN_NOTICES = {
  refused: 'Ce compte Discord n’est pas le propriétaire de cette page.',
  error: 'La connexion Discord a échoué. Vérifie le Client ID, le Client Secret et l’adresse de redirection déclarée sur Discord.',
};

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

// Titre de l'onglet et favicon choisis dans la configuration.
function useSiteHead(config) {
  useEffect(() => {
    document.title = config?.configured ? config.title : 'Bienvenue';
    const link = document.querySelector('link[rel="icon"]');
    if (link) {
      link.href = config?.favicon || '/favicon.svg';
      link.removeAttribute('type');
    }
  }, [config]);
}

// Résultat d'un retour de connexion Discord (?login=ok|refused|error), lu une seule fois.
function takeLoginResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('login');
  if (result) window.history.replaceState(null, '', window.location.pathname);
  return result;
}

// Glisser-déposer natif : l'app attrapée prend la place de celle sur laquelle on la lâche.
function dragPropsFor(onMove) {
  return (app) => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', app.url);
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e) => {
      e.preventDefault();
      onMove(e.dataTransfer.getData('text/plain'), app.url);
    },
  });
}

function useAppStatuses(enabled) {
  const [statuses, setStatuses] = useState(null);
  const [error, setError] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatuses(await api('/api/apps'));
      setError(null);
      setLastCheck(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, load]);

  return { statuses, error, lastCheck, loading, load };
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [modal, setModal] = useState(null); // 'editor' | 'login' | null
  const [notice, setNotice] = useState(null);
  const configured = Boolean(config?.configured);
  const { statuses, error, lastCheck, loading, load } = useAppStatuses(configured);

  useSiteHead(config);

  useEffect(() => {
    const loginResult = takeLoginResult();
    api('/api/config')
      .then((cfg) => {
        setConfig(cfg);
        if (loginResult === 'ok' && cfg.canEdit) setModal('editor');
        else if (LOGIN_NOTICES[loginResult]) setNotice(LOGIN_NOTICES[loginResult]);
      })
      .catch((err) => setConfigError(err.message));
  }, []);

  // Après le choix de Discord, il faut se connecter une première fois pour devenir propriétaire.
  const applyConfig = (cfg) => {
    if (cfg.auth.mode === 'discord' && !cfg.canEdit) {
      window.location.href = '/api/auth/discord';
      return;
    }
    setConfig(cfg);
    setModal(null);
    load();
  };

  const openEditor = async () => {
    // On revérifie la session : elle a pu expirer depuis le chargement de la page.
    const cfg = await api('/api/config').catch(() => config);
    setConfig(cfg);
    setModal(cfg.canEdit ? 'editor' : 'login');
  };

  const logout = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    setModal(null);
    setConfig(await api('/api/config'));
  };

  // Admin : glisser une app sur une autre la place à cet endroit (et dans sa catégorie si les apps sont groupées).
  const moveApp = async (fromUrl, toUrl) => {
    if (fromUrl === toUrl) return;
    const list = [...config.apps];
    const from = list.findIndex((a) => a.url === fromUrl);
    const to = list.findIndex((a) => a.url === toUrl);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    const grouped = config.layout === 'launcher' || config.layout === 'minimal';
    const target = list[from < to ? to - 1 : to];
    const next = { ...moved, ...(grouped && { category: target.category || '' }) };
    if (!next.category) delete next.category;
    list.splice(to, 0, next);
    const previous = config;
    setConfig({ ...config, apps: list });
    try {
      const body = { title: config.title, layout: config.layout, apps: list };
      setConfig(await api('/api/config', { method: 'PUT', body }));
    } catch (err) {
      setConfig(previous);
      setNotice(`Déplacement impossible : ${err.message}`);
    }
  };

  const themeButton = (
    <button onClick={toggleTheme} aria-label="Changer de thème" title="Changer de thème">
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );

  if (configError) {
    return (
      <div className="page">
        <div className="error">Erreur : {configError}</div>
      </div>
    );
  }
  if (!config) return <div className="page" />;
  if (!configured) return <Setup onDone={applyConfig} actions={<div className="actions">{themeButton}</div>} />;

  // Statut connu des apps, fusionné avec la config pour qu'une modification s'affiche tout de suite.
  const byUrl = new Map((statuses ?? []).map((s) => [s.url, s]));
  const apps = config.apps.map((a) => ({
    favicon: `/api/favicon?url=${encodeURIComponent(a.url)}`,
    ...byUrl.get(a.url),
    ...a,
  }));
  const upCount = apps.filter((a) => a.status === 'up').length;
  const summary = statuses
    ? `${upCount}/${apps.length} en ligne${lastCheck ? ` · vérifié à ${lastCheck.toLocaleTimeString('fr-FR')}` : ''}`
    : 'Vérification…';

  const actions = (
    <div className="actions">
      <button onClick={load} disabled={loading} aria-label="Rafraîchir" title="Rafraîchir">
        <span className={loading ? 'spin' : ''}>↻</span>
      </button>
      {themeButton}
      <button onClick={openEditor} aria-label="Modifier la page" title="Modifier la page">
        ✎
      </button>
    </div>
  );

  const Layout = LAYOUT_COMPONENTS[config.layout] ?? Cards;

  return (
    <div className={`page page-${config.layout}`}>
      <UpdateNotice canEdit={config.canEdit} />
      {notice && (
        <div className="error notice">
          <span>{notice}</span>
          <button type="button" className="icon-btn" onClick={() => setNotice(null)} aria-label="Fermer">
            ✕
          </button>
        </div>
      )}
      {error && <div className="error">Erreur : {error}</div>}

      {apps.length === 0 ? (
        <>
          <header className="header">
            <h1>{config.title}</h1>
            {actions}
          </header>
          <div className="empty-state">
            <p>Aucune app pour l’instant.</p>
            <button className="btn btn-primary" onClick={openEditor}>
              ✎ Ajouter des apps
            </button>
          </div>
        </>
      ) : (
        <Layout
          title={config.title}
          apps={apps}
          summary={summary}
          lastCheck={lastCheck}
          actions={actions}
          dragProps={config.canEdit ? dragPropsFor(moveApp) : () => ({})}
        />
      )}

      {modal === 'editor' && <Editor config={config} onSaved={applyConfig} onLogout={logout} onClose={() => setModal(null)} />}
      {modal === 'login' && (
        <Login
          auth={config.auth}
          onClose={() => setModal(null)}
          onSuccess={async () => {
            setConfig(await api('/api/config'));
            setModal('editor');
          }}
        />
      )}
    </div>
  );
}
