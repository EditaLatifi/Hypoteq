import { useEffect, useState, useRef } from "react";
import { THANK_YOU_PATHS, localeFromPath } from "@/components/funnelThankYou";

// ─── Translations ────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  de: {
    eyebrow: "HYPOTEQ",
    title: ["Ihre Dokumente werden", "sicher übertragen"],
    subtitle:
      "Bitte schliessen Sie das Fenster nicht – wir laden Ihre Unterlagen hoch und leiten Sie danach automatisch weiter.",
    steps: [
      "Dateien werden geprüft & komprimiert",
      "Verschlüsselte Übertragung",
      "Anfrage wird abgeschlossen",
    ],
    stepLabels: ["Vorbereitung…", "Verschlüsselte Übertragung…", "Fast fertig…", "Abgeschlossen ✓"],
    notice:
      "Der Upload dauert je nach Dateigrösse 10–30 Sekunden. Sie werden danach automatisch weitergeleitet.",
    noticeStrong: "Kurz innehalten:",
    thankYouPath: THANK_YOU_PATHS.de,
  },
  en: {
    eyebrow: "HYPOTEQ",
    title: ["Your documents are being", "securely transferred"],
    subtitle:
      "Please do not close this window – we are uploading your files and will redirect you automatically.",
    steps: [
      "Files are being checked & compressed",
      "Encrypted transfer in progress",
      "Finalising your request",
    ],
    stepLabels: ["Preparing…", "Encrypted transfer…", "Almost done…", "Complete ✓"],
    notice:
      "The upload may take 10–30 seconds depending on file size. You will be redirected automatically.",
    noticeStrong: "Just a moment:",
    thankYouPath: THANK_YOU_PATHS.en,
  },
  fr: {
    eyebrow: "HYPOTEQ",
    title: ["Vos documents sont en cours", "de transfert sécurisé"],
    subtitle:
      "Veuillez ne pas fermer cette fenêtre – nous chargeons vos fichiers et vous redirigerons automatiquement.",
    steps: [
      "Les fichiers sont vérifiés et compressés",
      "Transfert chiffré en cours",
      "Finalisation de votre demande",
    ],
    stepLabels: ["Préparation…", "Transfert chiffré…", "Presque terminé…", "Terminé ✓"],
    notice:
      "Le téléchargement peut prendre 10 à 30 secondes selon la taille des fichiers. Vous serez redirigé(e) automatiquement.",
    noticeStrong: "Un instant :",
    thankYouPath: THANK_YOU_PATHS.fr,
  },
  it: {
    eyebrow: "HYPOTEQ",
    title: ["I suoi documenti vengono", "trasferiti in modo sicuro"],
    subtitle:
      "Si prega di non chiudere questa finestra – stiamo caricando i suoi file e verrà reindirizzato automaticamente.",
    steps: [
      "I file vengono verificati e compressi",
      "Trasferimento crittografato in corso",
      "Finalizzazione della richiesta",
    ],
    stepLabels: ["Preparazione…", "Trasferimento crittografato…", "Quasi fatto…", "Completato ✓"],
    notice:
      "Il caricamento può richiedere 10–30 secondi a seconda delle dimensioni del file. Verrà reindirizzato automaticamente.",
    noticeStrong: "Un momento:",
    thankYouPath: THANK_YOU_PATHS.it,
  },
};

// ─── Detect language from URL path ──────────────────────────────────────────
function detectLanguage() {
  return localeFromPath(window.location.pathname);
}

// ─── Step icon states ────────────────────────────────────────────────────────
const STEP_ICONS = {
  waiting: "○",
  active: "●",
  done: "✓",
};

// ─── Main Component ──────────────────────────────────────────────────────────
type HypoteqLoadingPopupProps = {
  isOpen: boolean;
  // Parent sets this to true once the real upload + save have actually finished.
  // Until then the bar holds at 90% so we never redirect mid-upload.
  isComplete?: boolean;
  onComplete?: (redirectPath: string) => void;
};

export default function HypoteqLoadingPopup({ isOpen, isComplete, onComplete }: HypoteqLoadingPopupProps) {
  const [progress, setProgress] = useState(0);
  const [stepStatus, setStepStatus] = useState(["active", "waiting", "waiting"]);
  const [stepLabelIndex, setStepLabelIndex] = useState(0);
  const lang = detectLanguage();
  const t = TRANSLATIONS[lang];

  const onCompleteRef = useRef(onComplete);
  const thankYouPathRef = useRef(t.thankYouPath);
  const isCompleteRef = useRef(!!isComplete);
  onCompleteRef.current = onComplete;
  thankYouPathRef.current = t.thankYouPath;
  isCompleteRef.current = !!isComplete;

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      setStepStatus(["active", "waiting", "waiting"]);
      setStepLabelIndex(0);
      return;
    }

    let current = 0;
    let triggered = [false, false, false];
    let finished = false;

    const interval = setInterval(() => {
      // Cap natural progress at 90% — the parent has to signal isComplete
      // before we move past 90 and fire onComplete. This guarantees we never
      // redirect while the real upload is still in flight.
      const cap = isCompleteRef.current ? 100 : 90;
      const speed = current < 60 ? 1.4 : current < 85 ? 0.8 : 0.28;
      current = Math.min(current + speed, cap);
      setProgress(Math.floor(current));

      if (!triggered[0] && current >= 30) {
        triggered[0] = true;
        setStepStatus(["done", "active", "waiting"]);
        setStepLabelIndex(1);
      }
      if (!triggered[1] && current >= 70) {
        triggered[1] = true;
        setStepStatus(["done", "done", "active"]);
        setStepLabelIndex(2);
      }
      if (!finished && isCompleteRef.current && current >= 100) {
        finished = true;
        triggered[2] = true;
        setStepStatus(["done", "done", "done"]);
        setStepLabelIndex(3);
        clearInterval(interval);
        setTimeout(() => {
          if (onCompleteRef.current) {
            onCompleteRef.current(thankYouPathRef.current);
          } else {
            window.location.href = thankYouPathRef.current;
          }
        }, 600);
      }
    }, 60);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <style>{CSS}</style>
      <div className="hq-overlay">
        <div className="hq-card">
          <div className="hq-blob hq-blob-1" />
          <div className="hq-blob hq-blob-2" />

          {/* Spinner */}
          <div className="hq-icon-wrap">
            <div className="hq-ring" />
            <div className="hq-ring-inner" />
            <div className="hq-icon-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
              </svg>
            </div>
          </div>

          {/* Eyebrow */}
          <div className="hq-lp-eyebrow">{t.eyebrow}</div>

          {/* Title */}
          <h2 className="hq-title">
            {t.title[0]}
            <br />
            <span>{t.title[1]}</span>
          </h2>

          {/* Subtitle */}
          <p className="hq-sub">{t.subtitle}</p>

          {/* Progress bar */}
          <div className="hq-progress-wrap">
            <div className="hq-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="hq-progress-label">
            <span>{t.stepLabels[stepLabelIndex]}</span>
            <strong>{progress}%</strong>
          </div>

          {/* Steps */}
          <div className="hq-steps">
            {t.steps.map((label, i) => {
              const status = stepStatus[i];
              return (
                <div key={i} className={`hq-step hq-step--${status}`}>
                  <div className="hq-step-icon">
                    {status === "done" ? "✓" : status === "active" ? "●" : "○"}
                  </div>
                  {label}
                </div>
              );
            })}
          </div>

          {/* Notice */}
          <div className="hq-notice">
            <div className="hq-notice-icon">💡</div>
            <div className="hq-notice-text">
              <strong>{t.noticeStrong}</strong> {t.notice}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Scoped CSS-in-JS ────────────────────────────────────────────────────────
//
// Rewritten onto the brand tokens. It had its own greens (#a8d946, #7db52e), its own
// neutrals and DM Sans — a second palette that happened to be green, which is why this panel
// looked like a different product to the funnel behind it. The blobs, the gradient fill and
// the gloss sweep are gone too: the brand is flat, and none of them told the customer
// anything about their upload.
const CSS = `
  .hq-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 19, 13, 0.72);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
    animation: hqFadeIn 0.35s ease forwards;
  }
  @keyframes hqFadeIn { from { opacity: 0; } to { opacity: 1; } }

  .hq-card {
    background: var(--paper);
    border-radius: var(--radius-xl);
    padding: 44px 40px 40px;
    max-width: 520px;
    width: 100%;
    text-align: center;
    position: relative;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    animation: hqrise 0.32s var(--ease-out) both;
    font-family: var(--font-text);
  }

  /* The decorative blobs are kept in the markup but given no size: removing the elements
     would mean touching the component's JSX for a purely visual decision. */
  .hq-blob { display: none; }

  .hq-icon-wrap {
    position: relative;
    width: 84px; height: 84px;
    margin: 0 auto 22px;
  }
  .hq-ring {
    position: absolute; inset: 0;
    border-radius: 50%;
    border: 3px solid var(--paper-200);
    border-top-color: var(--lime-600);
    animation: hqSpin 1.1s linear infinite;
  }
  .hq-ring-inner { display: none; }
  .hq-icon-center {
    position: absolute; inset: 14px;
    border-radius: 50%;
    background: var(--lime-100);
    color: var(--forest-800);
    display: flex; align-items: center; justify-content: center;
  }
  @keyframes hqSpin { to { transform: rotate(360deg); } }

  /* Text. Named hq-lp-eyebrow, not hq-eyebrow: the design system defines that class
     globally now, and two rules of the same name in different files is how a change in one
     of them silently moves the other. */
  .hq-lp-eyebrow {
    font-size: var(--text-micro);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    color: var(--lime-800);
    margin-bottom: 12px;
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .hq-lp-eyebrow::before, .hq-lp-eyebrow::after {
    content: ''; display: block; width: 28px; height: 1px; background: var(--paper-400);
  }

  .hq-title {
    font-family: var(--font-display);
    font-size: clamp(22px, 4vw, var(--text-title));
    font-weight: var(--weight-bold);
    color: var(--forest-800);
    line-height: var(--leading-snug);
    margin-bottom: 12px;
    letter-spacing: var(--tracking-tight);
  }
  /* lime-800, not the brand lime: #CAF476 on white fails every contrast check, and this is
     the one line the customer is meant to read while waiting. */
  .hq-title span { color: var(--lime-800); }

  .hq-sub {
    font-size: var(--text-body-sm);
    color: var(--on-light-70);
    line-height: var(--leading-relaxed);
    margin-bottom: 26px;
  }

  /* Progress */
  .hq-progress-wrap {
    background: var(--paper-200);
    border-radius: var(--radius-pill);
    height: 8px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .hq-progress-bar {
    height: 100%;
    border-radius: var(--radius-pill);
    background: var(--lime-500);
    transition: width var(--duration-slow) var(--ease-out);
  }
  .hq-progress-label {
    display: flex; justify-content: space-between;
    font-size: var(--text-caption); color: var(--on-light-45);
    margin-bottom: 22px;
  }
  .hq-progress-label strong { color: var(--lime-800); font-weight: var(--weight-semibold); }

  /* Steps */
  .hq-steps { display: flex; flex-direction: column; gap: 8px; text-align: left; margin-bottom: 24px; }
  .hq-step {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 16px;
    border-radius: var(--radius-md);
    background: var(--paper-100);
    border: 1px solid var(--paper-300);
    font-size: var(--text-body-sm); color: var(--on-light-45);
    transition: var(--transition-control);
  }
  .hq-step--done {
    background: var(--lime-100); border-color: var(--lime-300); color: var(--forest-800);
  }
  .hq-step--active {
    background: var(--paper); border-color: var(--forest-800); color: var(--forest-800);
    font-weight: var(--weight-semibold);
  }

  .hq-step-icon {
    width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; flex-shrink: 0;
    background: var(--paper-200); color: var(--on-light-45);
    transition: var(--transition-control);
  }
  .hq-step--done .hq-step-icon { background: var(--lime-500); color: var(--forest-800); }
  .hq-step--active .hq-step-icon { background: var(--lime-500); color: var(--forest-800); }

  /* Notice */
  .hq-notice {
    background: var(--lime-100);
    border: 1px solid var(--lime-300);
    border-radius: var(--radius-md);
    padding: 14px 18px;
    display: flex; align-items: flex-start; gap: 12px; text-align: left;
  }
  .hq-notice-icon { display: none; }
  .hq-notice-text { font-size: var(--text-caption); color: var(--on-light-70); line-height: var(--leading-relaxed); }
  .hq-notice-text strong { font-weight: var(--weight-semibold); color: var(--forest-800); }

  @media (max-width: 560px) {
    .hq-card { padding: 34px 22px 30px; border-radius: var(--radius-lg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .hq-ring { animation: none; }
  }
`;