/**
 * Funnel v3 Nachreichung — what the page and the route share (no server code, safe for the
 * browser). The server (lib/funnel-v3/nachreich.ts) computes the still-missing requirements
 * from the stored answers and the inquiry's documents; the page rebuilds requirement instances
 * from them, so the upload pipeline can place new files on exactly those (placeFile.ts).
 */

import { translate, type Lang } from "./i18n";
import { getRequirement, type PersonRef, type ReqGroup, type ReqReason, type RequirementInstance } from "./requirements";

/** One requirement still open on a v3 inquiry (GET /api/nachreichen/[token]). */
export interface MissingRequirement {
  /** `lohnausweise#b1` / `grundbuch`. */
  instanceId: string;
  /** Base requirement id (REQ[].id). */
  id: string;
  /** In the inquiry's language; per-borrower requirements carry the person («… – Gary Gerber»). */
  label: string;
  group: ReqGroup;
  /** Display group: «Zum Objekt», «Zur Person · Gary Gerber» … (components/funnel-v3/documents/view.ts groupRows). */
  groupKey: string;
  groupLabel: string;
  reason: ReqReason;
  /** Whose document it is; used to tell borrowers' documents apart when placing a file. */
  person: PersonRef | null;
  /** Files the requirement needs in total, and how many valid ones the inquiry already has. */
  expect: number;
  have: number;
  /** Files still to come: the gap, or a whole new set for an outdated document. */
  slots: number;
  state: "missing" | "partial" | "outdated" | "analysing";
}

export interface NachreichV3View {
  valid: true;
  v3: true;
  lang: Lang;
  caseNumber: string | null;
  missing: MissingRequirement[];
  expiresAt: string | Date | null;
  /** The upload routes file documents under an e-mail (see the legacy GET). */
  email: string | null;
  folderId: string | null;
  submissionId: string;
}

/** One open requirement as the POST answers it. */
export interface RemainingRequirement {
  instanceId: string;
  label: string;
}

/** «Lohnausweise der letzten 3 Jahre – Gary Gerber». */
export function requirementLabel(inst: Pick<RequirementInstance, "labelKey" | "perBorrower" | "person">, lang: Lang): string {
  const base = translate(lang, inst.labelKey);
  const who = inst.perBorrower ? inst.person?.display?.trim() : "";
  return who ? `${base} – ${who}` : base;
}

/**
 * The requirement instance the page places files on. `expect` is the number of files still to
 * come, so a requirement that has two of three Lohnausweise takes exactly one more.
 */
export function instanceFromMissing(m: MissingRequirement): RequirementInstance | null {
  const def = getRequirement(m.id);
  if (!def) return null;
  const hash = m.instanceId.indexOf("#");
  return {
    instanceId: m.instanceId,
    id: def.id,
    code: def.code,
    group: def.group,
    labelKey: def.labelKey,
    labelDe: def.labelDe,
    reason: m.reason,
    expect: Math.max(1, m.slots),
    optional: false,
    perBorrower: def.perBorrower,
    borrowerId: hash < 0 ? undefined : m.instanceId.slice(hash + 1),
    person: m.person ?? undefined,
    def,
  };
}
