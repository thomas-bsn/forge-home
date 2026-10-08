import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

export default function Login({ auth, onSuccess, onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api('/api/login', { method: 'POST', body: { password } });
      onSuccess();
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <Modal title="Connexion" onClose={onClose}>
      {auth.mode === 'password' ? (
        <form className="modal-body form-section" onSubmit={submit}>
          <p className="muted">Entre le mot de passe pour modifier la page.</p>
          <label className="field">
            <span>Mot de passe</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={sending || !password}>
            {sending ? 'Vérification…' : 'Se connecter'}
          </button>
        </form>
      ) : (
        <div className="modal-body form-section">
          <p className="muted">
            {auth.ready
              ? 'Seul le propriétaire de la page peut la modifier.'
              : 'La page n’a pas encore de propriétaire : le premier compte Discord qui se connecte le devient.'}
          </p>
          <a className="btn btn-discord" href="/api/auth/discord">
            Se connecter avec Discord
          </a>
        </div>
      )}
    </Modal>
  );
}
