import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import { SECTIONS, Section, initialForm, toPayload, validateForm } from './form.jsx';

export default function Editor({ config, onSaved, onLogout, onClose }) {
  const [form, setForm] = useState(() => initialForm(config));
  const [tab, setTab] = useState('apps');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const invalid = validateForm(form, config.auth);
    if (invalid) return setError(invalid);
    setError(null);
    setSaving(true);
    try {
      onSaved(await api('/api/config', { method: 'PUT', body: toPayload(form) }));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title="Modifier la page" onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="tabs" role="tablist">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} className={tab === s.id ? 'active' : ''} onClick={() => setTab(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          <Section id={tab} form={form} setForm={setForm} current={config.auth} />
        </div>

        {error && <div className="error modal-error">{error}</div>}

        <div className="panel-footer modal-footer">
          {config.auth.mode !== 'none' && (
            <button type="button" className="btn btn-ghost logout" onClick={onLogout}>
              Se déconnecter
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
