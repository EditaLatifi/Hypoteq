/**
 * HYPOTEQ frame of the Nachreich page, which customers reach from a mail without having seen
 * the funnel: the funnel's dark bar with the logo on top, the mail's contact line below.
 * Plain classes (nachreich.css), so the page's loading and «Link ungültig» states outside the
 * funnel styles carry the same frame.
 */
import "./nachreich.css";

export function NachreichHeader() {
  return (
    <header className="hq-nr-head">
      <div className="hq-nr-bar">
        <img className="hq-nr-logo" src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" />
      </div>
    </header>
  );
}

export function NachreichFooter() {
  return (
    <footer className="hq-nr-foot">
      <div className="hq-nr-bar">
        <span>HYPOTEQ AG</span>
        <a href="tel:+41445544100">+41 44 554 41 00</a>
        <a href="mailto:info@hypoteq.ch">info@hypoteq.ch</a>
        <a href="https://www.hypoteq.ch" target="_blank" rel="noopener noreferrer">
          www.hypoteq.ch
        </a>
      </div>
    </footer>
  );
}
