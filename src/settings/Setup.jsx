import { useState } from 'react';
import { api } from '../api.js';
import { SECTIONS, Section, initialForm, toPayload, validateForm } from './form.jsx';

const INTROS = {
  site: 'Donne un nom à ta page et, si tu veux, une icône pour l’onglet.',
  layout: 'Choisis l’apparence de la page. Tu pourras en changer quand tu veux.',
  apps: 'Ajoute les apps à afficher. Leur statut sera vérifié toutes les 30 secondes.',
  auth: 'Dernière étape : protège la modification de la page.',
};

export default function Setup({ onDone, actions }) {
  const [form, setForm] = useState(() => initialForm(null));
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const section = SECTIONS[step];
  const last = step === SECTIONS.length - 1;

  const next = async (e) => {
    e.preventDefault();
    setError(null);
    if (!last) return setStep(step + 1);
    const invalid = validateForm(form, null);
    if (invalid) return setError(invalid);
    setSaving(true);
    try {
      onDone(await api('/api/setup', { method: 'POST', body: toPayload(form) }));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page setup">
      <header className="header">
        <div>
          <h1>Bienvenue 👋</h1>
          <p className="summary">Configurons ta page en {SECTIONS.length} étapes. Tout reste modifiable plus tard avec le crayon ✎.</p>
        </div>
        {actions}
      </header>

      <ol className="stepper">
        {SECTIONS.map((s, i) => (
          <li key={s.id} className={i === step ? 'current' : i < step ? 'done' : ''}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="step-num">{i < step ? '✓' : i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      <form className="panel" onSubmit={next}>
        <h2>{section.label}</h2>
        <p className="muted">{INTROS[section.id]}</p>
        <Section id={section.id} form={form} setForm={setForm} />

        {error && <div className="error">{error}</div>}

        <div className="panel-footer">
          {step > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              ← Retour
            </button>
          )}
          <span className="spacer" />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {last ? (saving ? 'Enregistrement…' : 'Terminer') : 'Suivant →'}
          </button>
        </div>
      </form>
    </div>
  );
}
