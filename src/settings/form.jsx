import { useRef, useState } from 'react';
import { DISCORD_CALLBACK_PATH, LAYOUTS, readFileAsDataUrl } from '../api.js';

export const SECTIONS = [
  { id: 'site', label: 'Page' },
  { id: 'layout', label: 'Interface' },
  { id: 'apps', label: 'Apps' },
  { id: 'auth', label: 'Protection' },
];

// crypto.randomUUID n'existe pas en HTTP hors localhost (ex. http://192.168.1.10) : simple compteur.
let lastKey = 0;
const newKey = () => ++lastKey;

export function initialForm(config) {
  return {
    title: config?.title ?? '',
    layout: config?.layout ?? 'cards',
    favicon: { preview: config?.favicon ?? null, change: undefined },
    apps: (config?.apps ?? []).map((a) => ({ ...a, checkUrl: a.checkUrl ?? '', key: newKey() })),
    auth: {
      mode: config?.auth?.mode ?? 'none',
      password: '',
      password2: '',
      clientId: config?.auth?.clientId ?? '',
      clientSecret: '',
    },
  };
}

// current : bloc auth de la config existante (absent au premier lancement).
export function validateForm(form, current) {
  const incomplete = form.apps.find((a) => !a.name.trim() || !a.url.trim());
  if (incomplete) return 'Chaque app doit avoir un nom et une URL (ou supprime la ligne vide).';
  const { auth } = form;
  if (auth.mode === 'password') {
    const keeping = current?.mode === 'password' && !auth.password;
    if (!keeping && auth.password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
    if (!keeping && auth.password !== auth.password2) return 'Les deux mots de passe ne correspondent pas.';
  }
  if (auth.mode === 'discord') {
    if (!auth.clientId.trim()) return 'Renseigne le Client ID Discord.';
    const keeping = current?.mode === 'discord' && current.clientId === auth.clientId.trim();
    if (!keeping && !auth.clientSecret.trim()) return 'Renseigne le Client secret Discord.';
  }
  return null;
}

export function toPayload(form) {
  const { auth } = form;
  return {
    title: form.title,
    layout: form.layout,
    ...(form.favicon.change !== undefined && { favicon: form.favicon.change }),
    apps: form.apps.map(({ name, url, category, checkUrl }) => ({ name, url, category, checkUrl })),
    auth: {
      mode: auth.mode,
      ...(auth.mode === 'password' && { password: auth.password }),
      ...(auth.mode === 'discord' && {
        clientId: auth.clientId.trim(),
        clientSecret: auth.clientSecret.trim(),
        redirectUri: window.location.origin + DISCORD_CALLBACK_PATH,
      }),
    },
  };
}

// --- Sections ----------------------------------------------------------------

export function SiteSection({ form, setForm }) {
  const fileRef = useRef(null);
  const [error, setError] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 512 * 1024) return setError('Image trop lourde (512 Ko maximum).');
    setError(null);
    const dataUrl = await readFileAsDataUrl(file);
    setForm((f) => ({ ...f, favicon: { preview: dataUrl, change: dataUrl } }));
  };

  return (
    <div className="form-section">
      <label className="field">
        <span>Titre de la page</span>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Mes apps"
          maxLength={80}
          autoFocus
        />
        <small>Affiché en haut de la page et dans l’onglet du navigateur.</small>
      </label>

      <div className="field">
        <span>Favicon (facultatif)</span>
        <div className="favicon-picker">
          <span className="favicon-preview">
            <img src={form.favicon.preview || '/favicon.svg'} alt="" />
          </span>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {form.favicon.preview ? 'Changer' : 'Choisir une image'}
          </button>
          {form.favicon.preview && (
            <button type="button" className="btn btn-ghost" onClick={() => setForm((f) => ({ ...f, favicon: { preview: null, change: null } }))}>
              Retirer
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/x-icon,image/jpeg,image/webp,image/gif,.ico" hidden onChange={onFile} />
        </div>
        <small>{error || 'L’icône de l’onglet. PNG, SVG ou ICO, carré de préférence. Sans image, l’icône par défaut est utilisée.'}</small>
      </div>
    </div>
  );
}

function Thumb({ id }) {
  const boxes = (n, cls) => Array.from({ length: n }, (_, i) => <i key={i} className={cls} />);
  return (
    <span className={`thumb thumb-${id}`} aria-hidden="true">
      {id === 'cards' && boxes(6, 'box')}
      {id === 'launcher' && (
        <>
          <i className="clock" />
          {boxes(8, 'sq')}
        </>
      )}
      {id === 'dashboard' && (
        <>
          {boxes(3, 'stat')}
          {boxes(4, 'line')}
        </>
      )}
      {id === 'minimal' && boxes(8, 'txt')}
    </span>
  );
}

export function LayoutSection({ form, setForm }) {
  return (
    <div className="form-section">
      <div className="layout-grid" role="radiogroup" aria-label="Interface">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={form.layout === l.id}
            className={`layout-option ${form.layout === l.id ? 'selected' : ''}`}
            onClick={() => setForm((f) => ({ ...f, layout: l.id }))}
          >
            <Thumb id={l.id} />
            <b>{l.label}</b>
            <small>{l.desc}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppsSection({ form, setForm }) {
  const categories = [...new Set(form.apps.map((a) => a.category?.trim()).filter(Boolean))];
  const setApps = (fn) => setForm((f) => ({ ...f, apps: fn(f.apps) }));
  const update = (key, field, value) => setApps((apps) => apps.map((a) => (a.key === key ? { ...a, [field]: value } : a)));
  const move = (index, delta) =>
    setApps((apps) => {
      const next = [...apps];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });

  return (
    <div className="form-section">
      {form.apps.length === 0 && <p className="empty">Aucune app pour l’instant. Ajoute la première ci-dessous (tu pourras en ajouter d’autres plus tard).</p>}

      <div className="apps-editor">
        {form.apps.map((app, i) => (
          <div key={app.key} className="app-row">
            <label className="app-field f-name">
              <span>Nom</span>
              <input value={app.name} onChange={(e) => update(app.key, 'name', e.target.value)} placeholder="ex. Jellyfin" maxLength={80} />
            </label>
            <label className="app-field f-url">
              <span>URL (ouverte au clic)</span>
              <input value={app.url} onChange={(e) => update(app.key, 'url', e.target.value)} placeholder="ex. https://jellyfin.mondomaine.fr" inputMode="url" />
            </label>
            <label className="app-field f-cat">
              <span>Catégorie (facultatif)</span>
              <input value={app.category} onChange={(e) => update(app.key, 'category', e.target.value)} placeholder="ex. Médias" list="categories" maxLength={40} />
            </label>
            <label className="app-field f-check">
              <span>URL interne (facultatif)</span>
              <input value={app.checkUrl} onChange={(e) => update(app.key, 'checkUrl', e.target.value)} placeholder="ex. http://jellyfin:8096" inputMode="url" />
            </label>
            <div className="row-actions">
              <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter" title="Monter">
                ↑
              </button>
              <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === form.apps.length - 1} aria-label="Descendre" title="Descendre">
                ↓
              </button>
              <button type="button" className="icon-btn danger" onClick={() => setApps((apps) => apps.filter((a) => a.key !== app.key))} aria-label="Supprimer" title="Supprimer">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <datalist id="categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <button type="button" className="btn" onClick={() => setApps((apps) => [...apps, { key: newKey(), name: '', url: '', category: '', checkUrl: '' }])}>
        + Ajouter une app
      </button>
      <small className="muted">
        L’<b>URL</b> est celle qu’ouvre le navigateur au clic. L’<b>URL interne</b>, facultative, sert uniquement au serveur pour vérifier le
        statut et récupérer l’icône : par exemple un nom de conteneur (<code>http://jellyfin:8096</code>) si la homepage est sur le même réseau
        Docker. Les catégories regroupent les apps dans les interfaces Lanceur, Tableau de bord et Minimal.
      </small>
    </div>
  );
}

const AUTH_MODES = [
  { id: 'none', label: 'Aucune', desc: 'Tout le monde peut modifier la page. Convient si elle n’est accessible que chez toi.' },
  { id: 'password', label: 'Mot de passe', desc: 'Le crayon demande un mot de passe avant toute modification.' },
  { id: 'discord', label: 'Discord', desc: 'Connexion avec ton compte Discord : seul le propriétaire peut modifier.' },
];

export function AuthSection({ form, setForm, current }) {
  const { auth } = form;
  const set = (field, value) => setForm((f) => ({ ...f, auth: { ...f.auth, [field]: value } }));
  const callbackUrl = window.location.origin + DISCORD_CALLBACK_PATH;
  const keepsPassword = current?.mode === 'password';
  const keepsDiscord = current?.mode === 'discord' && current.clientId === auth.clientId.trim();

  return (
    <div className="form-section">
      <p className="muted">Qui peut modifier la page avec le crayon ✎ ? Tout le monde peut toujours la consulter.</p>
      <div className="auth-options" role="radiogroup" aria-label="Protection">
        {AUTH_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={auth.mode === m.id}
            className={`auth-option ${auth.mode === m.id ? 'selected' : ''}`}
            onClick={() => set('mode', m.id)}
          >
            <b>{m.label}</b>
            <small>{m.desc}</small>
          </button>
        ))}
      </div>

      {auth.mode === 'password' && (
        <div className="auth-details">
          <label className="field">
            <span>{keepsPassword ? 'Nouveau mot de passe' : 'Mot de passe'}</span>
            <input
              type="password"
              value={auth.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
              placeholder={keepsPassword ? 'Laisser vide pour garder l’actuel' : '8 caractères minimum'}
            />
          </label>
          <label className="field">
            <span>Confirmation</span>
            <input type="password" value={auth.password2} onChange={(e) => set('password2', e.target.value)} autoComplete="new-password" />
          </label>
        </div>
      )}

      {auth.mode === 'discord' && (
        <div className="auth-details">
          {current?.mode === 'discord' && current.ownerName && (
            <p className="note">
              Propriétaire actuel : <b>{current.ownerName}</b>
            </p>
          )}
          <ol className="steps-help">
            <li>
              Va sur{' '}
              <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer">
                discord.com/developers/applications
              </a>{' '}
              et clique sur <b>New Application</b> (le nom n’a pas d’importance).
            </li>
            <li>
              Dans l’onglet <b>OAuth2</b>, section <b>Redirects</b>, ajoute exactement cette adresse :
              <input className="copy" readOnly value={callbackUrl} onFocus={(e) => e.target.select()} />
              Ouvre toujours ta homepage avec cette même adresse : Discord refuse les autres.
            </li>
            <li>
              Toujours dans <b>OAuth2</b>, copie le <b>Client ID</b> et le <b>Client Secret</b> ici.
            </li>
          </ol>
          <label className="field">
            <span>Client ID</span>
            <input value={auth.clientId} onChange={(e) => set('clientId', e.target.value)} inputMode="numeric" placeholder="123456789012345678" />
          </label>
          <label className="field">
            <span>Client Secret</span>
            <input
              type="password"
              value={auth.clientSecret}
              onChange={(e) => set('clientSecret', e.target.value)}
              autoComplete="off"
              placeholder={keepsDiscord ? 'Laisser vide pour garder l’actuel' : ''}
            />
          </label>
          {!keepsDiscord && (
            <p className="note">
              En validant, tu seras redirigé vers Discord. <b>Le premier compte qui se connecte devient le propriétaire</b> de la page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function Section({ id, ...props }) {
  if (id === 'site') return <SiteSection {...props} />;
  if (id === 'layout') return <LayoutSection {...props} />;
  if (id === 'apps') return <AppsSection {...props} />;
  return <AuthSection {...props} />;
}
