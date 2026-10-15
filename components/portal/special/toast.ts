/**
 * The prototype's toast (bottom centre, max. 520 px, 3.8 s): «Spezialfinanzierung … eingereicht»,
 * «Danke! Meldung … ist eingegangen». Plain DOM on purpose: the wizard navigates to the new
 * Case right after showing it, and a toast owned by the wizard's React tree would unmount
 * with it — this one lives on <body> and outlasts the client-side navigation. Used by the
 * Spezialfinanzierung wizard and the support form.
 */

const ID = "hq-portal-toast";
// Motion tokens: reveal 420 ms, ease-out, fade and 10 px up; no bounce, no scaling.
const EASE = "cubic-bezier(.2,.7,.3,1)";

export function showToast(text: string, closeLabel: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(ID)?.remove();

  // Above the phone's bottom navigation, which is shown below the lg breakpoint.
  const phone = typeof window !== "undefined" && window.matchMedia?.("(max-width: 1023px)").matches;
  const wrap = document.createElement("div");
  wrap.id = ID;
  Object.assign(wrap.style, {
    position: "fixed",
    left: "16px",
    right: "16px",
    bottom: `calc(${phone ? 92 : 24}px + env(safe-area-inset-bottom))`,
    zIndex: "70",
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
  } as Partial<CSSStyleDeclaration>);

  const card = document.createElement("div");
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");
  Object.assign(card.style, {
    pointerEvents: "auto",
    width: "100%",
    maxWidth: "520px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 12px 14px 16px",
    borderRadius: "12px",
    background: "#1A2E20",
    border: "1px solid rgba(202,244,118,.55)",
    boxShadow: "0 12px 32px rgba(0,0,0,.35)",
    color: "#fff",
    fontSize: "15px",
    lineHeight: "1.35",
    opacity: "0",
    transform: "translateY(10px)",
    transition: `opacity 420ms ${EASE}, transform 420ms ${EASE}`,
  } as Partial<CSSStyleDeclaration>);

  // Lucide «circle-check», lime on dark.
  card.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CAF476" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
  const span = document.createElement("span");
  span.style.flex = "1";
  span.textContent = text;
  card.appendChild(span);

  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", closeLabel);
  close.textContent = "×";
  Object.assign(close.style, {
    flex: "none",
    width: "32px",
    height: "32px",
    borderRadius: "999px",
    border: "0",
    background: "transparent",
    color: "rgba(255,255,255,.7)",
    fontSize: "20px",
    lineHeight: "1",
    cursor: "pointer",
  } as Partial<CSSStyleDeclaration>);
  card.appendChild(close);
  wrap.appendChild(card);
  document.body.appendChild(wrap);

  const hide = () => {
    card.style.opacity = "0";
    card.style.transform = "translateY(10px)";
    window.setTimeout(() => wrap.remove(), 420);
  };
  close.addEventListener("click", hide);
  window.requestAnimationFrame(() => {
    card.style.opacity = "1";
    card.style.transform = "none";
  });
  window.setTimeout(hide, 3800);
}
