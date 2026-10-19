/**
 * What the Auskunftsermächtigung block shows (Handover 6; prototype «sigState», «sigPrefill»),
 * derived in one place for the closing step (SignatureBlock) and the Nachreich page
 * (NachreichSignature). Pure: the texts come from `t` / `opt` (messages/funnel-v3 `sig.*`).
 *
 *   received   «Unterzeichnete Auskunftsermächtigung erhalten» · file · «Unterschrift vorhanden»
 *   analysing  «Wird geprüft …» (form, signature and name)
 *   unsigned   «Unterschrift fehlt» / wrong name / not the form — the three steps stay open
 *   later      «Wird nachgereicht» + «Unterschrift ausstehend · Erinnerung nach 2 und 5 Tagen»,
 *              the template comes with the confirmation mail, nothing goes to a bank without it
 *   missing    «Noch nicht hochgeladen» — the three steps
 *
 * The AI never blocks (HYPOTEQ 19.10. E.4): under «Unterschrift fehlt» the closing offers
 * «Trotzdem einreichen – HYPOTEQ prüft manuell»; chosen, the block says «Wird von HYPOTEQ manuell
 * geprüft» (the view is «received» with `override`), the copy can still be replaced, and the
 * choice can be undone.
 */

import type { AuthorizationData } from "@/lib/funnel-v3/authorization";
import { authorizationPreview } from "@/lib/funnel-v3/authorizationData";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { baseId, SIGNATURE_REQUIREMENT_ID } from "@/lib/funnel-v3/requirements";
import { signatureProblems, type SignatureProblem, type SignatureStatus, type SignatureView } from "@/lib/funnel-v3/signature";

type T = (key: string, params?: Record<string, string | number>) => string;
type Opt = (group: string, value: string | null | undefined) => string;

export interface SignatureFileRow {
  id: string;
  name: string;
  /**
   * ok = a usable copy · problem = read, but not signed / not the form · review = such a copy,
   * submitted anyway (E.4) · busy = uploading or read · failed = upload failed.
   */
  state: "ok" | "problem" | "review" | "busy" | "failed";
}

export interface SignatureModel {
  status: SignatureStatus;
  tone: "ok" | "warn" | "busy";
  title: string;
  lines: string[];
  /** «Unterschrift ausstehend · Erinnerung nach 2 und 5 Tagen» once «später» is chosen. */
  pendingTag: string | null;
  /** The three steps (download · sign · upload) and the prefill. */
  showSteps: boolean;
  /** Under «1 · Vorlage»: prefilled in the closing, the blank form on the Nachreich page. */
  step1Sub: string;
  signerLine: string;
  preview: { label: string; value: string }[];
  files: SignatureFileRow[];
  /** «Kunde unterschreibt später?» — only in the closing, not on the Nachreich page. */
  later: { chosen: boolean; question: string; label: string } | null;
  /**
   * HYPOTEQ 19.10. E.4 «Trotzdem einreichen – HYPOTEQ prüft manuell» — in the closing, over a copy
   * the AI flagged; `chosen` once taken (the label then undoes it). Null where it does not apply.
   */
  override: { chosen: boolean; hint: string; label: string } | null;
  /** «Finanzierungsanfrage abschliessen» may be pressed (as SignatureView.canFinish). */
  canFinish: boolean;
}

export interface SignatureModelInput {
  view: SignatureView;
  /** All files of the store (the rows are those on P0). */
  files: FileEntry[];
  /** «Später nachreichen» chosen; null where it is not offered (Nachreich page). */
  later: boolean | null;
  data: AuthorizationData;
  jp: boolean;
  /**
   * closing (default) · nachreich: the page of the Nachreich link — its own title and lead, the
   * blank form to download (the prefilled one came with the mail; the link alone shows no
   * personal data), and «wird mit den Unterlagen übermittelt» once a copy is there.
   */
  context?: "closing" | "nachreich";
}

const PROBLEM_KEY: Record<SignatureProblem, string> = {
  signature: "sig.unsignedSub",
  name: "sig.wrongName",
  form: "sig.wrongForm",
};

/**
 * `blockOk`: the block found a good copy (received, not overridden). The row checks signature
 * and form itself; the name needs the Kreditnehmer, so a copy with neither problem counts as
 * good only when the block agrees — else it is the copy with another name, and «Bestätigt»
 * beside «Name passt nicht» would contradict the block.
 */
function rowOf(f: FileEntry, overridden: boolean, blockOk: boolean): SignatureFileRow {
  const state: SignatureFileRow["state"] =
    f.uploadState === "failed"
      ? "failed"
      : f.uploadState === "uploading" || f.analysisState === "pending" || f.analysisState === "analysing"
        ? "busy"
        : signatureProblems(f.analysis).length || !blockOk
          ? overridden
            ? "review"
            : "problem"
          : "ok";
  return { id: f.id, name: f.name, state };
}

export function signatureModel(input: SignatureModelInput, t: T, opt: Opt): SignatureModel {
  const { view, data } = input;
  const nachreich = input.context === "nachreich";
  const overridden = view.override === true;
  const blockOk = view.status === "received" && !overridden;
  const files = input.files.filter((f) => f.instanceId && baseId(f.instanceId) === SIGNATURE_REQUIREMENT_ID).map((f) => rowOf(f, overridden, blockOk));
  const chosenLater = input.later === true;
  const names = data.signers.map((s) => [s.vor, s.nach].filter(Boolean).join(" ")).filter(Boolean);
  const signerLine = input.jp
    ? t("sig.step2SubJp", { name: names[0] || t("sig.signerJp") })
    : t("sig.step2Sub", { name: names.join(", ") || t("sig.signerKn") });
  const preview = authorizationPreview(data).map((r) => ({
    label: t(`sig.prefill.${r.key}`),
    value: r.key === "purpose" ? opt("antrag", r.value) : r.value,
  }));

  let tone: SignatureModel["tone"] = "warn";
  let title: string;
  let lines: string[];
  let showSteps = true;
  switch (overridden ? "override" : view.status) {
    case "override":
      // E.4: submitted anyway — HYPOTEQ checks by hand; the copy can still be replaced.
      tone = "warn";
      title = t("sig.review");
      lines = [t("sig.reviewSub"), ...(view.problems.length ? view.problems : (["signature"] as SignatureProblem[])).map((p) => t(PROBLEM_KEY[p]))];
      break;
    case "received": {
      const ok = files.find((f) => f.state === "ok");
      tone = "ok";
      title = t("sig.received");
      lines = [t("sig.receivedSub", { name: ok?.name || t("sig.recognised") })];
      showSteps = false;
      break;
    }
    case "analysing":
      tone = "busy";
      title = t("sig.analysing");
      lines = [t("sig.analysingSub")];
      showSteps = false;
      break;
    case "unsigned":
      title = t("sig.unsigned");
      lines = (view.problems.length ? view.problems : (["signature"] as SignatureProblem[])).map((p) => t(PROBLEM_KEY[p]));
      break;
    case "later":
      tone = "ok";
      title = t("sig.laterState");
      lines = [t("sig.laterSub"), t("sig.laterNote")];
      break;
    default:
      title = nachreich ? t("sig.nr.title") : t("sig.uploadTitle");
      lines = [nachreich ? t("sig.nr.sub") : t("sig.uploadSub")];
  }
  if (files.some((f) => f.state === "failed") && view.status !== "received") lines = [...lines, t("sig.uploadFailed")];
  if (nachreich && view.status === "received") lines = [...lines, t("sig.nr.ready")];

  return {
    status: view.status,
    tone,
    title,
    lines,
    pendingTag: chosenLater && view.status !== "received" ? t("sig.pending") : null,
    showSteps,
    step1Sub: nachreich ? t("sig.nr.step1Sub") : t("sig.step1Sub"),
    signerLine,
    preview,
    files,
    later:
      input.later === null || view.status === "received"
        ? null
        : { chosen: chosenLater, question: t("sig.laterQ"), label: chosenLater ? t("sig.laterUndo") : t("sig.later") },
    // Offered in the closing and on the Nachreich page alike (HYPOTEQ 19.10. E.4: never blocks).
    override:
      !nachreich && input.later === null
        ? null
        : overridden
          ? { chosen: true, hint: "", label: t("sig.overrideUndo") }
          : view.status === "unsigned"
            ? { chosen: false, hint: t("sig.overrideHint"), label: t("sig.override") }
            : null,
    canFinish: view.canFinish,
  };
}
