import { useEffect, useState, useRef } from "react";

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
    thankYouPath: "/de/danke",
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
    thankYouPath: "/en/thank-you",
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
    thankYouPath: "/fr/merci",
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
    thankYouPath: "/it/grazie",
  },
};

// ─── Detect language from URL path ──────────────────────────────────────────
function detectLanguage() {
  const path = window.location.pathname;
  if (path.startsWith("/fr")) return "fr";
  if (path.startsWith("/it")) return "it";
  if (path.startsWith("/en")) return "en";
  return "de"; // default
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
            <div className="hq-icon-center">📤</div>
          </div>

          {/* Eyebrow */}
          <div className="hq-eyebrow">{t.eyebrow}</div>

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
const CSS = `
  .hq-overlay {
    position: fixed;
    inset: 0;
    background: rgba(20, 26, 14, 0.72);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
    animation: hqFadeIn 0.35s ease forwards;
  }
  @keyframes hqFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .hq-card {
    background: #fff;
    border-radius: 28px;
    padding: 52px 48px 48px;
    max-width: 520px;
    width: 100%;
    text-align: center;
    position: relative;
    overflow: hidden;
    box-shadow: 0 40px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(168,217,70,0.15);
    animation: hqSlideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  @keyframes hqSlideUp {
    from { transform: translateY(30px) scale(0.97); opacity: 0; }
    to   { transform: translateY(0)    scale(1);    opacity: 1; }
  }

  .hq-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 5px;
    background: linear-gradient(90deg, #7db52e, #a8d946, #c8ea6e, #a8d946);
    background-size: 200% 100%;
    animation: hqShimmer 2s linear infinite;
  }
  @keyframes hqShimmer {
    0%   { background-position: 0% 0%; }
    100% { background-position: 200% 0%; }
  }

  .hq-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.1;
    pointer-events: none;
  }
  .hq-blob-1 { width: 260px; height: 260px; background: #a8d946; top: -80px; right: -60px; }
  .hq-blob-2 { width: 200px; height: 200px; background: #7db52e; bottom: -60px; left: -40px; }

  /* Spinner */
  .hq-icon-wrap {
    width: 96px; height: 96px;
    margin: 0 auto 28px;
    position: relative;
  }
  .hq-ring {
    position: absolute; inset: 0;
    border-radius: 50%;
    border: 3px solid transparent;
    border-top-color: #a8d946;
    border-right-color: #7db52e;
    animation: hqSpin 1.1s linear infinite;
  }
  .hq-ring-inner {
    position: absolute; inset: 10px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: #e8f5c8;
    border-left-color: #a8d946;
    animation: hqSpin 0.7s linear infinite reverse;
  }
  .hq-icon-center {
    position: absolute; inset: 18px;
    border-radius: 50%;
    background: #e8f5c8;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px;
    animation: hqPulse 1.5s ease-in-out infinite;
  }
  @keyframes hqSpin  { to { transform: rotate(360deg); } }
  @keyframes hqPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }

  /* Text */
  .hq-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #7db52e;
    margin-bottom: 12px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .hq-eyebrow::before, .hq-eyebrow::after {
    content: ''; display: block; width: 28px; height: 1px;
    background: #a8d946; opacity: 0.6;
  }

  .hq-title {
    font-size: clamp(20px, 4vw, 26px);
    font-weight: 700;
    color: #1a1f14;
    line-height: 1.25;
    margin-bottom: 14px;
    letter-spacing: -0.02em;
  }
  .hq-title span { color: #7db52e; }

  .hq-sub {
    font-size: 14px;
    color: #6b7a5c;
    line-height: 1.6;
    margin-bottom: 28px;
    font-weight: 300;
  }

  /* Progress */
  .hq-progress-wrap {
    background: #eef2e6;
    border-radius: 100px;
    height: 10px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .hq-progress-bar {
    height: 100%;
    border-radius: 100px;
    background: linear-gradient(90deg, #7db52e, #a8d946, #c8ea6e);
    transition: width 0.35s ease;
    position: relative;
  }
  .hq-progress-bar::after {
    content: '';
    position: absolute; top: 0; right: 0;
    width: 40px; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5));
    animation: hqGloss 1.2s ease-in-out infinite;
  }
  @keyframes hqGloss { 0%,100% { opacity: 0; } 50% { opacity: 1; } }

  .hq-progress-label {
    display: flex; justify-content: space-between;
    font-size: 12px; color: #8a9878;
    margin-bottom: 24px;
  }
  .hq-progress-label strong { color: #7db52e; font-weight: 600; }

  /* Steps */
  .hq-steps { display: flex; flex-direction: column; gap: 10px; text-align: left; margin-bottom: 28px; }

  .hq-step {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #fafcf6;
    border: 1px solid #e8f0d8;
    font-size: 14px; color: #7a8a6a;
    font-weight: 300;
    transition: all 0.4s ease;
  }
  .hq-step--done   { background: #e8f5c8; border-color: #a8d946; color: #3d4a2e; font-weight: 400; }
  .hq-step--active { background: #fff; border-color: #7db52e; color: #1a1f14; font-weight: 600;
                     box-shadow: 0 2px 12px rgba(125,181,46,0.18); }

  .hq-step-icon {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; flex-shrink: 0;
    background: #e8f0d8; transition: all 0.4s ease;
  }
  .hq-step--done   .hq-step-icon { background: #7db52e; color: #fff; }
  .hq-step--active .hq-step-icon {
    background: #a8d946;
    animation: hqStepPulse 1s ease-in-out infinite;
  }
  @keyframes hqStepPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(168,217,70,0.6); }
    50%      { box-shadow: 0 0 0 6px rgba(168,217,70,0); }
  }

  /* Notice */
  .hq-notice {
    background: linear-gradient(135deg, #f0f7e0, #e6f2d0);
    border: 1px solid #a8d946;
    border-radius: 14px;
    padding: 16px 20px;
    display: flex; align-items: flex-start; gap: 12px; text-align: left;
  }
  .hq-notice-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
  .hq-notice-text { font-size: 13px; color: #3d4a2e; line-height: 1.5; font-weight: 300; }
  .hq-notice-text strong { font-weight: 600; color: #1a1f14; }

  @media (max-width: 560px) {
    .hq-card { padding: 40px 24px 36px; border-radius: 20px; }
  }
`;