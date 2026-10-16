"use client";

import { useId } from "react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { chipDelta, type ReqState } from "@/lib/funnel-v3/requirements";
import { chipsFor, type Chip, type FieldPath } from "@/lib/funnel-v3/types";
import { fieldId } from "../logic";
import FromDoc from "./FromDoc";

/**
 * «Trifft etwas davon zu?» (Handover 2 Schritt 3): one multiple-choice question in place of
 * the v3 yes/no questions — nothing tapped = trifft nicht zu. Each chip says how many
 * documents it adds («+3», chipDelta, also while tapped) and, when a document tapped it in the
 * Schnellanmeldung, «aus Dokument»; doubtful ones can be confirmed below the chips.
 */
export default function Chips({ reqState }: { reqState: ReqState }) {
  const { t } = useFunnelT();
  const uid = useId();
  const ans = useFunnelV3((s) => s.ans);
  const src = useFunnelV3((s) => s.src);
  const setChip = useFunnelV3((s) => s.setChip);
  const chips = chipsFor(ans.kn);
  const unsure = chips.filter((c) => ans[c] === "Ja" && src[`ans.${c}` as FieldPath]?.unsure);

  return (
    <div className="v3-q" data-q="chips">
      <span id={`${uid}-label`} className="v3-q-label">
        {t("q.chips")}
      </span>
      <div id={fieldId("chips")} role="group" aria-labelledby={`${uid}-label`} aria-describedby={`${uid}-hint`} className="v3-opts">
        {chips.map((c: Chip) => {
          const on = ans[c] === "Ja";
          const n = chipDelta(reqState, c);
          const mark = on ? src[`ans.${c}` as FieldPath] : undefined;
          return (
            <button
              key={c}
              id={fieldId(c)}
              type="button"
              className="v3-chip v3-chip--multi"
              aria-pressed={on}
              onClick={() => setChip(c, !on)}
            >
              <span className="v3-chip-mark" aria-hidden="true">
                {on ? "✓" : "+"}
              </span>
              <span>{t(`chip.${c}`)}</span>
              {n > 0 ? <span className="v3-delta">+{n}</span> : null}
              {mark ? <span className="v3-chip-src">{t(mark.unsure ? "fast.fromDocUnsure" : "chip.fromDoc")}</span> : null}
            </button>
          );
        })}
      </div>
      {unsure.length ? (
        <div className="v3-fromdoc-list">
          {unsure.map((c) => (
            <FromDoc key={c} path={`ans.${c}` as FieldPath} label={t(`chip.${c}`)} />
          ))}
        </div>
      ) : null}
      <span id={`${uid}-hint`} className="v3-note">
        {t("q.chips.hint")} {t("q.kredite.hint")}
      </span>
    </div>
  );
}
