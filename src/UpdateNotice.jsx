import { useEffect, useState } from 'react';
import { api } from './api.js';

const UPDATE_COMMAND = 'git pull && docker compose up -d --build';
const DISMISSED_KEY = 'dismissedUpdate';

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

// Pop-up en haut à gauche, visible seulement par l'admin connecté, quand une nouvelle release existe.
export default function UpdateNotice({ canEdit }) {
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canEdit) return setUpdate(null);
    api('/api/update')
      .then(setUpdate)
      .catch(() => setUpdate(null));
  }, [canEdit]);

  const latest = update?.latest;
  if (!latest || dismissed === latest.version) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, latest.version);
    } catch {}
    setDismissed(latest.version);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(UPDATE_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <aside className="update-notice" role="status">
      <div className="update-head">
        <b>Nouvelle version v{latest.version}</b>
        <button type="button" className="icon-btn" onClick={dismiss} aria-label="Masquer jusqu’à la prochaine version">
          ✕
        </button>
      </div>
      <p>
        Tu as la v{update.current}.{' '}
        <a href={latest.url} target="_blank" rel="noopener noreferrer">
          Voir les nouveautés
        </a>
      </p>
      <p>Pour mettre à jour, lance sur le serveur :</p>
      <button type="button" className="update-command" onClick={copy} title="Copier la commande">
        <code>{UPDATE_COMMAND}</code>
        <span>{copied ? '✓' : '⧉'}</span>
      </button>
    </aside>
  );
}
