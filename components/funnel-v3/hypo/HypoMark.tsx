/**
 * HYPO's wordmark and avatar (Konzept Kap. 2): always «HYPO» in capitals; the O is drawn as a
 * smiling face — an element of the funnel's design system, not an emoji. The O alone is the avatar
 * in the chat header and the typing indicator. Forest on Lime, or inverted.
 */

type Tone = "lime" | "forest";

const COLORS: Record<Tone, { ring: string; face: string }> = {
  lime: { ring: "var(--lime-500)", face: "var(--forest-800)" },
  forest: { ring: "var(--forest-800)", face: "var(--lime-500)" },
};

/** The smiling O: a filled disc with two eyes and a smile. */
export function HypoFace({ size = 32, tone = "lime", className, title }: { size?: number; tone?: Tone; className?: string; title?: string }) {
  const c = COLORS[tone];
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <circle cx="16" cy="16" r="15" fill={c.ring} />
      <circle className="v3-hypo-eye" cx="11.4" cy="13" r="2" fill={c.face} />
      <circle className="v3-hypo-eye" cx="20.6" cy="13" r="2" fill={c.face} />
      <path d="M10 18.6c1.4 2.6 3.6 3.9 6 3.9s4.6-1.3 6-3.9" fill="none" stroke={c.face} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** «HYP» set in the display face, the O as the face. */
export function HypoWordmark({ tone = "lime", className }: { tone?: Tone; className?: string }) {
  return (
    <span className={`v3-hypo-word${className ? ` ${className}` : ""}`} role="img" aria-label="HYPO">
      <span aria-hidden="true">HYP</span>
      <HypoFace tone={tone} className="v3-hypo-word-o" />
    </span>
  );
}
