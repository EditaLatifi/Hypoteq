"use client";

import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect } from "react";

interface Props {
  step: number;
}

/**
 * The funnel's shell, rebuilt to the HYPOTEQ funnel mockups.
 *
 * Five groups rather than the four this showed before, because the mockup gives Unterlagen a
 * step of its own — which is right: it is where the customer does the most work and the only
 * one they may come back to. The internal step numbers are untouched; the pages map their
 * own step onto these five. This is presentation, and the funnel's navigation and validation
 * have too much hard-won behaviour in them to be rewritten for a visual change.
 *
 * Deliberately NOT clickable, unlike the mockup. Jumping to step 4 from step 1 would skip
 * the validation each step runs on the way out, and the mockup is a picture of a finished
 * flow rather than a claim about which of them may be entered early.
 *
 * The mockup's footer line "Automatisch gespeichert" is also missing on purpose: the store
 * has no persistence, so a refresh loses the lot. Printing that promise would be a lie told
 * in the brand's own typeface. It belongs here the day the store actually persists.
 */
export default function FunnelSidebar({ step }: Props) {
  const { t } = useTranslation();
  const { borrowers } = useFunnelStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const steps = [
    { id: 1, label: mounted ? t("funnel.stepGeneral" as any) : "" },
    { id: 2, label: mounted ? t("funnel.stepProjectObject" as any) : "" },
    { id: 3, label: mounted ? t("funnel.stepCalculator" as any) : "" },
    { id: 4, label: mounted ? t("funnel.stepDocuments" as any) : "" },
    { id: 5, label: mounted ? t("funnel.stepCompletion" as any) : "" },
  ];

  if (!mounted) return null;

  const current = steps.find((s) => s.id === step);

  /**
   * The real logo asset, not a wordmark rebuilt out of a bordered span.
   *
   * The recreation had to guess the border weight, the corner cut and where the ® sits, and
   * it guessed them slightly wrong at every size. HYPOTEQ already ships a white logo for dark
   * grounds — using it means the funnel's mark is the same file as the one in the header of
   * every other page, and it cannot drift from the brand when the brand changes.
   */
  const Wordmark = ({ size }: { size: "sm" | "lg" }) => (
    <img
      src="/images/HYPOTEQ_layout_logo_white.png"
      alt="HYPOTEQ"
      style={{ height: size === "lg" ? 34 : 26, width: "auto", display: "block" }}
    />
  );

  return (
    <>
      {/* MOBILE HEADER */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50"
        style={{ background: "var(--forest-800)" }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-3.5">
          <a href="/" className="cursor-pointer">
            <Wordmark size="sm" />
          </a>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: "var(--text-caption)", color: "var(--on-dark-70)" }}>
              {current?.label} · {step}/{steps.length}
            </span>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1"
              style={{ color: "var(--on-dark-70)" }}
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* One bar per step: position without a paragraph about it. */}
        <div className="flex gap-1 px-5 pt-3.5 pb-3">
          {steps.map((s) => (
            <span
              key={s.id}
              className="flex-1"
              style={{
                height: 3,
                borderRadius: 999,
                background: step >= s.id ? "var(--lime-500)" : "rgba(255,255,255,.18)",
              }}
            />
          ))}
        </div>
      </div>

      {/* MOBILE DROPDOWN */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed top-[86px] left-0 right-0 z-40"
          style={{ background: "var(--forest-700)", borderBottom: "var(--border-on-dark)" }}
        >
          <div className="px-5 py-4 flex flex-col gap-1">
            {steps.map((s) => {
              const active = s.id === step;
              const done = step > s.id;
              return (
                <div key={s.id} className="flex items-center gap-3.5 py-2">
                  <span
                    className="flex items-center justify-center flex-none"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      fontSize: "var(--text-body-sm)",
                      fontWeight: "var(--weight-semibold)" as any,
                      background: active ? "var(--lime-500)" : "transparent",
                      color: active
                        ? "var(--forest-800)"
                        : done
                          ? "var(--lime-500)"
                          : "var(--on-dark-45)",
                      border: active ? "1px solid transparent" : "1px solid var(--on-dark-14)",
                    }}
                  >
                    {done ? "✓" : s.id}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--text-body-sm)",
                      fontWeight: "var(--weight-semibold)" as any,
                      color: active ? "#fff" : "var(--on-dark-45)",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <aside
        className="hidden lg:flex flex-col self-stretch"
        style={{
          width: 288,
          flex: "0 0 288px",
          background: "var(--forest-800)",
          padding: "36px 28px 28px",
          gap: 44,
        }}
      >
        <div className="flex flex-col gap-1.5">
          <a href="/" className="cursor-pointer">
            <Wordmark size="lg" />
          </a>
          <span
            style={{
              fontSize: "var(--text-micro)",
              letterSpacing: "var(--tracking-label)",
              textTransform: "uppercase",
              color: "var(--on-dark-45)",
              paddingLeft: 2,
            }}
          >
            {t("funnel.sidebarEyebrow" as any)}
          </span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {steps.map((s) => {
            const active = s.id === step;
            const done = step > s.id;
            return (
              <div
                key={s.id}
                className="flex items-center"
                style={{
                  gap: 14,
                  padding: "11px 12px",
                  margin: "0 -12px",
                  borderRadius: "var(--radius-md)",
                  background: active ? "var(--on-dark-08)" : "transparent",
                  borderLeft: `3px solid ${active ? "var(--lime-500)" : "transparent"}`,
                  color: active ? "#fff" : "var(--on-dark-45)",
                }}
              >
                <span
                  className="flex items-center justify-center flex-none"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    fontSize: "var(--text-body-sm)",
                    fontWeight: "var(--weight-semibold)" as any,
                    background: active ? "var(--lime-500)" : "transparent",
                    color: active
                      ? "var(--forest-800)"
                      : done
                        ? "var(--lime-500)"
                        : "var(--on-dark-45)",
                    border: active ? "1px solid transparent" : "1px solid var(--on-dark-14)",
                  }}
                >
                  {done ? "✓" : s.id}
                </span>
                <span className="flex flex-col gap-0.5 text-left">
                  <span
                    style={{
                      fontSize: "var(--text-micro)",
                      letterSpacing: "var(--tracking-label)",
                      textTransform: "uppercase",
                      opacity: 0.55,
                    }}
                  >
                    {t("funnel.step" as any)} {s.id}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--text-body-sm)",
                      fontWeight: "var(--weight-semibold)" as any,
                    }}
                  >
                    {s.label}
                  </span>
                </span>
              </div>
            );
          })}
        </nav>

        {/* Who this request belongs to, once the funnel knows. Nothing is invented to fill
            the space: before the borrowers step there is genuinely nothing to say here. */}
        <div className="mt-auto flex flex-col gap-3.5">
          <div style={{ height: 1, background: "var(--on-dark-14)" }} />
          {(() => {
            const names = (borrowers ?? [])
              .map((b: any) => [b.firstName || b.vorname, b.lastName || b.name].filter(Boolean).join(" ").trim())
              .filter(Boolean);
            if (!names.length) return null;
            return (
              <div className="flex flex-col gap-1">
                <span
                  style={{
                    fontSize: "var(--text-micro)",
                    letterSpacing: "var(--tracking-label)",
                    textTransform: "uppercase",
                    color: "var(--on-dark-45)",
                  }}
                >
                  {t("funnel.sidebarRequest" as any)}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-body-sm)",
                    color: "#fff",
                    fontWeight: "var(--weight-semibold)" as any,
                  }}
                >
                  {names.join(" & ")}
                </span>
              </div>
            );
          })()}
        </div>
      </aside>
    </>
  );
}
