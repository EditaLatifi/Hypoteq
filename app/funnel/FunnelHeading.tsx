"use client";

/**
 * The heading every funnel step wears in the mockups: a short lime rule, the display
 * heading, and an optional lead paragraph.
 *
 * One component rather than the same three elements pasted into six files. The rule is 44×3
 * and the type is display-3 on every artboard in the canvas, so a step that drifts from that
 * is a mistake — and six copies is six chances to make it.
 *
 * Left-aligned, as the mockups are. The old funnel centred its titles over left-aligned
 * content, which reads as a heading borrowed from another page.
 */
export default function FunnelHeading({
  title,
  lead,
  leadSize = "lead",
}: {
  title: string;
  /** Optional. A step whose question is its own explanation does not need one. */
  lead?: string;
  /** The mockups use the larger lead on steps 1 and 4, body on the denser ones. */
  leadSize?: "lead" | "body";
}) {
  return (
    <div className="flex flex-col gap-3 mb-8 md:mb-10">
      <span
        style={{
          width: "var(--rule-length)",
          height: "var(--rule-weight)",
          background: "var(--lime-600)",
        }}
      />
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-display-3)",
          lineHeight: "var(--leading-snug)",
          letterSpacing: "var(--tracking-tight)",
          color: "var(--forest-800)",
          fontWeight: "var(--weight-bold)" as any,
          textWrap: "pretty" as any,
        }}
      >
        {title}
      </h1>
      {lead && (
        <p
          style={{
            margin: 0,
            fontSize: leadSize === "lead" ? "var(--text-lead)" : "var(--text-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--on-light-70)",
            maxWidth: leadSize === "lead" ? "52ch" : "56ch",
          }}
        >
          {lead}
        </p>
      )}
    </div>
  );
}
