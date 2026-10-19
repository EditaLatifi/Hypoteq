import { isTestMode, skipped } from "@/components/testMode";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { partnerCaseField } from "@/lib/portal/config";
import { special } from "@/lib/portal/i18n/special";
import type { Locale } from "@/lib/portal/i18n/dict";
import { sendTeamMail } from "@/lib/portal/mail";
import {
  DOCS_STEP,
  LIMITS,
  SPECIAL_MAX_FILES,
  isSpecialType,
  normalizeAnswers,
  specialArt,
  specialRef,
  summaryRows,
  validateSpecial,
  type SpecialError,
  type SpecialType,
  type ValidSpecialAnswers,
} from "@/lib/portal/special";
import { listSpecialFiles, removeSpecialFile, specialFolder, type SpecialFile } from "@/lib/portal/specialFiles";
import {
  createSpecialCase,
  partnerLabel,
  specialCaseFields,
  specialQueueName,
  specialSubject,
  type SpecialCaseResult,
} from "@/lib/portal/specialSalesforce";

/**
 * Spezialfinanzierung on the server: drafts for the uploads, the submit, and what the
 * portal shows of a partner's requests.
 *
 * Request status: draft (files are being uploaded, nothing submitted) → submitting (one
 * submit owns it) → new (submitted). The request is stored before Salesforce is called,
 * so a Salesforce failure costs nothing: the row keeps the answers and the error
 * (sfError), the team is told to create the Case by hand, and the partner gets the
 * confirmation page instead of a Case page that does not exist (DECISIONS P16).
 */

export type SpecialUser = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  contactId: string;
  sfAccountId: string | null;
};

export type SpecialSubmitInput = { requestId?: unknown; answers: unknown; ack: unknown; itemIds?: unknown };

export type SpecialSubmitResult =
  | { ok: true; requestId: string; caseId: string | null; caseNr: string | null }
  | { ok: false; error: SpecialError; step?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanItemIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((v): v is string => typeof v === "string" && /^[A-Za-z0-9!_-]{8,200}$/.test(v))));
}

function errorText(err: any): string {
  const code = err?.errorCode || err?.data?.errorCode || "";
  const message = err?.data?.message || err?.message || String(err);
  return `${code ? `${code}: ` : ""}${message}`.slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Drafts (the uploads of step 4)
// ---------------------------------------------------------------------------

/** The partner's draft, or a new one for the first upload (type and customer are known by then). */
export async function draftForUpload(
  user: SpecialUser,
  p: { requestId?: unknown; type?: unknown; kunde?: unknown }
): Promise<{ id: string; createdAt: Date } | null> {
  if (typeof p.requestId === "string" && p.requestId) return ownDraft(user.id, p.requestId);
  const a = normalizeAnswers({ type: p.type, kunde: p.kunde });
  return prisma.portalSpecialRequest.create({
    data: {
      userId: user.id,
      contactId: user.contactId,
      accountId: user.sfAccountId,
      type: a.type || "andere",
      kunde: a.kunde.slice(0, LIMITS.kunde) || "–",
      payload: {},
      status: "draft",
    },
    select: { id: true, createdAt: true },
  });
}

export async function ownDraft(userId: string, requestId: string): Promise<{ id: string; createdAt: Date } | null> {
  if (!UUID.test(requestId)) return null;
  return prisma.portalSpecialRequest.findFirst({ where: { id: requestId, userId, status: "draft" }, select: { id: true, createdAt: true } });
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export type SpecialMailInput = {
  requestId: string;
  answers: ValidSpecialAnswers;
  partner: { name: string | null; company: string | null; email: string };
  files: SpecialFile[];
  result: SpecialCaseResult | null;
  sfError: string | null;
};

/** The internal mail to HYPOTEQ (German, like every team mail). */
export function specialTeamMail(p: SpecialMailInput): { subject: string; lines: string[] } {
  const t = special.de;
  const r = p.result;
  const lines = [`${partnerLabel(p.partner)} hat eine Spezialfinanzierung eingereicht (Referenz ${specialRef(p.requestId)}).`];
  if (r) {
    lines.push(
      `Salesforce-Case ${r.caseNr || r.caseId} wurde angelegt${
        r.recordType === "default" ? ", mit dem Standard-RecordType (RecordType «Spezialfinanzierung» nicht verfügbar)" : ""
      }.`
    );
    if (r.owner === "default" && specialQueueName()) {
      lines.push("ACHTUNG: Die Queue «Spezialfinanzierung» konnte nicht als Owner gesetzt werden. Bitte den Case der Queue zuweisen.");
    }
    if (!r.linked) {
      lines.push(`ACHTUNG: Der Partner konnte nicht auf dem Case eingetragen werden (${partnerCaseField()}). Bitte von Hand zuordnen, sonst sieht er den Case im Portal nicht.`);
    }
    const other = r.dropped.filter((d) => !d.startsWith("Case.RecordTypeId "));
    if (other.length) lines.push(`Nicht übernommene Felder: ${other.join(", ")}`);
  } else {
    lines.push(
      `ACHTUNG: Der Salesforce-Case wurde nicht angelegt (${p.sfError || "unbekannter Fehler"}). Die Anfrage ist im Portal gespeichert. Bitte den Case von Hand anlegen und dem Partner zuordnen.`
    );
  }
  lines.push(summaryRows(t, p.answers, p.files.length).map((row) => `${row.k}: ${row.v}`).join("\n"));
  lines.push(`Beschreibung:\n${p.answers.beschreibung}`);
  lines.push(p.files.length ? `Dokumente (${p.files.length}): ${p.files.map((f) => f.fileName).join(", ")}` : "Keine Dokumente hochgeladen.");
  lines.push("Der Partner hat bestätigt, dass Spezialfinanzierungen individuell geprüft werden und nicht unter die bestehende Partnervereinbarung fallen.");
  lines.push(`Antwort bitte direkt an ${p.partner.email}.`);
  const nr = r?.caseNr ? ` (${r.caseNr})` : r ? "" : " – Case von Hand anlegen";
  return { subject: `Partnerportal: ${specialSubject(p.answers)}${nr}`, lines };
}

async function releaseDraft(id: string): Promise<void> {
  await prisma.portalSpecialRequest.updateMany({ where: { id, status: "submitting" }, data: { status: "draft" } }).catch(() => {});
}

/**
 * The new Case shows the request's files: the folder becomes the Case's folder (as for
 * any Case created outside the funnel, lib/portal/files.ts), the files are listed as portal
 * uploads, and the partner is not notified about a Case they created themselves.
 */
async function linkToCase(caseId: string, user: SpecialUser, folderId: string | null, files: SpecialFile[]): Promise<void> {
  try {
    if (folderId) {
      await prisma.portalCaseState.upsert({
        where: { caseId },
        create: { caseId, contactId: user.contactId, status: "Anfrage eingegangen", folderId },
        update: { folderId },
      });
    }
    if (files.length) {
      await prisma.portalUpload.createMany({
        data: files.map((f) => ({
          userId: user.id,
          caseId,
          docKey: null,
          docLabel: "Spezialfinanzierung",
          fileName: f.fileName.slice(0, 500),
          driveItemId: f.driveItemId,
          webUrl: f.webUrl,
        })),
      });
    }
    // Only once the partner has a notification baseline: before their first sync there is
    // nothing to suppress, and a lone row would make that first sync announce every Case.
    const known = await prisma.portalCaseSeen.count({ where: { contactId: user.contactId } });
    if (known > 0) {
      await prisma.portalCaseSeen.upsert({
        where: { contactId_caseId: { contactId: user.contactId, caseId } },
        create: { contactId: user.contactId, caseId, status: "Anfrage eingegangen", missingCount: 0 },
        update: {},
      });
    }
  } catch (err) {
    console.error("[portal] linking the special financing to its Case failed (Case exists)", err);
  }
}

export async function submitSpecialRequest(
  user: SpecialUser,
  input: SpecialSubmitInput,
  ctx: { origin: string; ip: string | null }
): Promise<SpecialSubmitResult> {
  const v = validateSpecial(input.answers, input.ack);
  if (!v.ok) return { ok: false, error: v.error, step: v.step };
  const { answers, amount } = v;
  const keep = cleanItemIds(input.itemIds);
  if (keep.length > SPECIAL_MAX_FILES) return { ok: false, error: "files", step: DOCS_STEP };

  // The draft the uploads went into. Claimed atomically: a double click must not make two Cases.
  const requestId = typeof input.requestId === "string" && UUID.test(input.requestId) ? input.requestId : null;
  let draft: { id: string; createdAt: Date } | null = null;
  if (requestId) {
    const claimed = await prisma.portalSpecialRequest.updateMany({ where: { id: requestId, userId: user.id, status: "draft" }, data: { status: "submitting" } });
    if (!claimed.count) {
      const prev = await prisma.portalSpecialRequest.findFirst({ where: { id: requestId, userId: user.id } });
      if (prev?.status === "new") return { ok: true, requestId: prev.id, caseId: prev.sfError ? null : prev.sfCaseId, caseNr: prev.caseNr };
      return { ok: false, error: "failed" };
    }
    draft = await prisma.portalSpecialRequest.findUnique({ where: { id: requestId }, select: { id: true, createdAt: true } });
  } else if (keep.length) {
    return { ok: false, error: "files", step: DOCS_STEP };
  }

  // Files: only what really lies in the request's folder, and only what the partner kept.
  let folder: { id: string; webUrl: string | null } | null = null;
  let files: SpecialFile[] = [];
  let stray: SpecialFile[] = [];
  let row: { id: string };
  try {
    if (draft) {
      folder = await specialFolder(draft, user.email, { create: false });
      const present = folder ? await listSpecialFiles(folder.id) : [];
      files = present.filter((f) => keep.includes(f.driveItemId));
      stray = present.filter((f) => !keep.includes(f.driveItemId));
      if (files.length < keep.length) {
        await releaseDraft(draft.id);
        return { ok: false, error: "files", step: DOCS_STEP };
      }
    }
    // Stored before anything outside the portal can fail.
    const data = {
      contactId: user.contactId,
      accountId: user.sfAccountId,
      type: answers.type,
      kunde: answers.kunde,
      amount,
      payload: { ...answers, ack: true, submittedAt: new Date().toISOString() },
      files,
      status: "new",
      sfError: null,
    };
    row = draft
      ? await prisma.portalSpecialRequest.update({ where: { id: draft.id }, data, select: { id: true } })
      : await prisma.portalSpecialRequest.create({ data: { userId: user.id, ...data }, select: { id: true } });
  } catch (err) {
    console.error("[portal] storing the special financing failed", err);
    if (draft) await releaseDraft(draft.id);
    return { ok: false, error: "failed" };
  }

  // What the partner removed but SharePoint still holds (a removal that did not get
  // through, an upload that failed half-way) must not end up in the Case's dossier.
  for (const f of stray) {
    await removeSpecialFile(folder!.id, f.driveItemId).catch((err) => console.error("[portal] could not delete a removed upload", err));
  }

  const ref = specialRef(row.id);
  let result: SpecialCaseResult | null = null;
  let sfError: string | null = null;
  if (isTestMode()) {
    skipped("Salesforce special financing Case", ref);
    sfError = "Testmodus: kein Salesforce-Case angelegt";
  } else {
    try {
      const fields = specialCaseFields({
        requestId: row.id,
        answers,
        amount,
        partner: { contactId: user.contactId, accountId: user.sfAccountId, name: user.name, company: user.company, email: user.email },
        fileNames: files.map((f) => f.fileName),
        folderUrl: folder?.webUrl ?? null,
      });
      result = await createSpecialCase(fields);
    } catch (err) {
      sfError = errorText(err);
      console.error("[portal] creating the special financing Case failed (request kept)", err);
    }
  }
  const unlinked = result && !result.linked ? `Partner nicht auf dem Case eingetragen (${partnerCaseField()})` : null;
  await prisma.portalSpecialRequest
    .update({ where: { id: row.id }, data: { sfCaseId: result?.caseId ?? null, caseNr: result?.caseNr ?? null, sfError: sfError ?? unlinked } })
    .catch((err) => console.error("[portal] recording the Salesforce result failed", err));

  if (result) await linkToCase(result.caseId, user, folder?.id ?? null, files);

  const mail = specialTeamMail({ requestId: row.id, answers, partner: user, files, result, sfError });
  if (isTestMode()) {
    skipped("special financing team mail", mail.subject);
  } else {
    try {
      await sendTeamMail({ to: process.env.PORTAL_SPECIAL_EMAIL || null, subject: mail.subject, lines: mail.lines, origin: ctx.origin, link: folder?.webUrl || undefined });
    } catch (err) {
      console.error("[portal] special financing team mail failed", err);
    }
  }

  await audit({
    action: "special_submitted",
    actorId: user.id,
    actorEmail: user.email,
    target: `${result?.caseNr || "ohne Case"} · ${special.de.types[answers.type].short} · ${ref}`,
    ip: ctx.ip,
  });

  // Straight to the Case only when the partner can see it there.
  return { ok: true, requestId: row.id, caseId: result?.linked ? result.caseId : null, caseNr: result?.caseNr ?? null };
}

// ---------------------------------------------------------------------------
// What the portal shows
// ---------------------------------------------------------------------------

export type SpecialRequestView = {
  id: string;
  ref: string;
  type: SpecialType;
  kunde: string;
  amount: number | null;
  answers: ReturnType<typeof normalizeAnswers>;
  files: { fileName: string; size: number }[];
  caseId: string | null;
  caseNr: string | null;
  submittedAt: Date;
};

function toView(r: {
  id: string;
  type: string;
  kunde: string;
  amount: number | null;
  payload: unknown;
  files: unknown;
  sfCaseId: string | null;
  caseNr: string | null;
  sfError: string | null;
  createdAt: Date;
}): SpecialRequestView {
  const p = (r.payload && typeof r.payload === "object" ? r.payload : {}) as Record<string, unknown>;
  const submitted = typeof p.submittedAt === "string" ? new Date(p.submittedAt) : r.createdAt;
  return {
    id: r.id,
    ref: specialRef(r.id),
    type: isSpecialType(r.type) ? r.type : "andere",
    kunde: r.kunde,
    amount: r.amount,
    answers: normalizeAnswers(p),
    files: (Array.isArray(r.files) ? r.files : []).map((f: any) => ({ fileName: String(f?.fileName || ""), size: Number(f?.size) || 0 })),
    // A Case the partner was not put on is not theirs to open.
    caseId: r.sfCaseId && !r.sfError ? r.sfCaseId : null,
    caseNr: r.sfCaseId && !r.sfError ? r.caseNr : null,
    submittedAt: Number.isNaN(submitted.getTime()) ? r.createdAt : submitted,
  };
}

type Viewer = { id: string; contactId: string | null; viewingAs: unknown };

/** Whose requests a session sees: the partner's own; an admin viewing as a partner, that partner's. */
function ownerWhere(user: Viewer) {
  return user.viewingAs ? { contactId: user.contactId ?? "-" } : { userId: user.id };
}

export async function listSpecialRequests(user: Viewer, take = 20): Promise<SpecialRequestView[]> {
  const rows = await prisma.portalSpecialRequest.findMany({
    where: { ...ownerWhere(user), status: { not: "draft" } },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toView);
}

export async function getSpecialRequest(user: Viewer, id: string): Promise<SpecialRequestView | null> {
  if (!UUID.test(id)) return null;
  const row = await prisma.portalSpecialRequest.findFirst({ where: { id, ...ownerWhere(user), status: { not: "draft" } } });
  return row ? toView(row) : null;
}

/**
 * For the Case pages: which of these Cases are special financings, and their Art
 * («Spezialfinanzierung · Renditeobjekt»). Case.Reason keeps its own two values (DECISIONS P14),
 * so this is where the portal learns it.
 */
export async function specialArtByCase(caseIds: string[], locale: Locale = "de"): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!caseIds.length) return out;
  const rows = await prisma.portalSpecialRequest.findMany({ where: { sfCaseId: { in: caseIds } }, select: { sfCaseId: true, type: true } });
  for (const r of rows) {
    if (r.sfCaseId && isSpecialType(r.type)) out.set(r.sfCaseId, specialArt(special[locale], r.type));
  }
  return out;
}
