/**
 * Where an analysed file belongs on the customer's current list (Spezifikation 4.3, 5). Pure.
 *
 * The server says what a document IS (V3Analysis.docTypeId); which requirement instance it
 * answers depends on the answers, which change at any time — so placement runs in the browser
 * and is re-run for every file whenever the answers change. A Kreditvertrag that was an extra
 * becomes «Kreditverträge» the moment «Privatkredite» is set to Ja (spec 4.4).
 *
 * Outcomes:
 *  - an instance id                         the file counts for that requirement
 *  - duplicate  (reason "duplicate")        same content (SHA-256) as an earlier file
 *  - surplus    (reason "full" | "period")  the requirement already has `expect` files, or the
 *                                           document covers a year that was not asked for
 *  - surplus    (reason "offList")          a requirement type not on the current list: kept in
 *                                           the dossier, and a suggestion to correct the answer
 *  - notneeded  (reason "notneeded")        a type the bank does not need (Steuerrechnung …)
 *               (reason "dismissed")        an off-list document whose suggestion was turned down
 *  - unknown    (reason "unknown")          not recognised
 *               (reason "failed")           could not be analysed
 *               (reason "person")           recognised, but whose it is cannot be told apart
 */

import type { FileEntry, V3Analysis } from "./files";
import type { ExtraKind } from "./requirementStatus";
import { baseId, reqList, type PersonRef, type ReqState, type RequirementInstance } from "./requirements";
import { docYear, familyMembers, requestedYears, v3DocType } from "@/components/documentIntelligence/v3/catalogue";

export type PlaceReason =
  | "placed"
  | "manual"
  | "duplicate"
  | "full"
  | "period"
  | "notneeded"
  | "offList"
  | "dismissed"
  | "unknown"
  | "failed"
  | "person"
  | "pending";

export interface Placement {
  instanceId: string | null;
  /** Base requirement id: of the instance, or the recognised requirement type of an extra. */
  requirementId: string | null;
  extraKind?: ExtraKind;
  /** German reason (Salesforce JSON / dossier); the UI translates `reason`. */
  extraReason?: string;
  reason: PlaceReason;
  /** For a duplicate: the file it duplicates. */
  duplicateOf?: string;
}

export interface PlaceOptions {
  now?: Date;
  /** File ids whose answer-correction suggestion was dismissed. */
  dismissed?: Iterable<string>;
}

/** What placement needs to know about a file already placed. */
export interface PlacedFile {
  id: string;
  instanceId: string | null;
  contentHash?: string | null;
}

const REASON_DE: Record<PlaceReason, string> = {
  placed: "",
  manual: "",
  pending: "",
  duplicate: "Identischer Inhalt wie eine andere Datei – wird nicht doppelt gespeichert.",
  full: "Die Anforderung ist bereits vollständig – wird im Dossier mitgeführt, zählt nicht.",
  period: "Ausserhalb der verlangten Jahre – wird im Dossier mitgeführt, zählt nicht.",
  notneeded: "Für die Finanzierungsprüfung nicht erforderlich.",
  offList: "Passt zu keiner Anforderung der aktuellen Antworten.",
  dismissed: "Passt zu keiner Anforderung der aktuellen Antworten (Vorschlag abgelehnt).",
  unknown: "Dokumenttyp nicht erkannt.",
  failed: "Konnte nicht gelesen werden.",
  person: "Person nicht eindeutig erkannt.",
};

function extra(kind: ExtraKind, reason: PlaceReason, requirementId: string | null, text?: string): Placement {
  return { instanceId: null, requirementId, extraKind: kind, extraReason: text || REASON_DE[reason], reason };
}

// ---- Person matching --------------------------------------------------------------------

function tokens(s: string | null | undefined): string[] {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    // «Bürgi» and the machine-readable «BUERGI» are the same name.
    .map((t) => t.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u"))
    .filter((t) => t.length > 1);
}

/**
 * How well a printed name («Gerber Gary Samuel») fits a person: 0 = not at all. The family
 * name must be there (word order does not matter — documents print both orders); each matching
 * given name adds to the score so spouses with one family name are told apart.
 */
export function personScore(printed: string | null | undefined, person: PersonRef | undefined): number {
  if (!person) return 0;
  const doc = new Set(tokens(printed));
  if (!doc.size) return 0;
  if (person.company) {
    const c = tokens(person.company).filter((t) => !["ag", "gmbh", "sa", "sarl", "sagl", "ltd"].includes(t));
    return c.length && c.every((t) => doc.has(t)) ? 2 : 0;
  }
  const last = tokens(person.last);
  if (!last.length || !last.every((t) => doc.has(t))) return 0;
  return 2 + tokens(person.first).filter((t) => doc.has(t)).length;
}

/** The candidate instances whose person fits best; several when it cannot be told. */
function byPerson(analysis: V3Analysis, candidates: RequirementInstance[]): RequirementInstance[] {
  if (candidates.length <= 1) return candidates;
  const scored = candidates.map((c) => ({ c, s: personScore(analysis.personName, c.person) }));
  const best = Math.max(...scored.map((x) => x.s));
  if (best <= 0) return candidates;
  return scored.filter((x) => x.s === best).map((x) => x.c);
}

// ---- Single file ------------------------------------------------------------------------

/** Where a file's type could go, ignoring how full the requirements are. */
function candidateFor(
  analysis: V3Analysis | undefined,
  instances: RequirementInstance[],
  dismissed: boolean,
  now: Date
): Placement | { candidate: RequirementInstance } {
  if (!analysis) return { instanceId: null, requirementId: null, reason: "pending" };
  if (analysis.status === "failed") return extra("unknown", "failed", null);
  const type = v3DocType(analysis.docTypeId);
  if (!type) return extra("unknown", "unknown", null);
  if (type.kind === "notneeded") return extra("notneeded", "notneeded", null, type.notNeededReason);

  const members = new Set(familyMembers(type.id));
  const onList = instances.filter((i) => members.has(i.id));
  if (!onList.length) return dismissed ? extra("notneeded", "dismissed", type.id) : extra("surplus", "offList", type.id);

  const fit = byPerson(analysis, onList);
  if (fit.length !== 1) return extra("unknown", "person", type.id);
  const inst = fit[0];

  const years = requestedYears(inst.id, now);
  const y = docYear(analysis.docDate);
  if (years && y !== null && !years.includes(y)) return extra("surplus", "period", inst.id);
  return { candidate: inst };
}

/**
 * Place one file given what is already placed (`existing`, in upload order, without the file
 * itself): duplicate when an existing file has the same content hash, surplus when the
 * requirement already has `expect` files.
 */
export function placeFile(
  analysis: V3Analysis | undefined,
  instances: RequirementInstance[],
  existing: PlacedFile[] = [],
  opts: PlaceOptions & { fileId?: string } = {}
): Placement {
  const now = opts.now ?? new Date();
  const dismissed = new Set(opts.dismissed ?? []);
  const hash = analysis?.contentHash;
  if (hash) {
    const same = existing.find((e) => e.contentHash && e.contentHash === hash && e.id !== opts.fileId);
    if (same) return { ...extra("duplicate", "duplicate", analysis?.docTypeId && v3DocType(analysis.docTypeId)?.kind === "requirement" ? analysis.docTypeId : null), duplicateOf: same.id };
  }
  const c = candidateFor(analysis, instances, opts.fileId ? dismissed.has(opts.fileId) : false, now);
  if (!("candidate" in c)) return c;
  const inst = c.candidate;
  const taken = existing.filter((e) => e.instanceId === inst.instanceId).length;
  if (taken >= inst.expect) return extra("surplus", "full", inst.id);
  return { instanceId: inst.instanceId, requirementId: inst.id, reason: "placed" };
}

// ---- All files --------------------------------------------------------------------------

function analysisOf(f: FileEntry): V3Analysis | undefined {
  if (f.uploadState === "failed") return undefined;
  if (f.analysisState === "failed") return { status: "failed", docTypeId: null, docTypeLabel: null, confidence: 0, requirementId: null, fields: {} };
  return f.analysisState === "done" ? f.analysis : undefined;
}

const dateRank = (a: V3Analysis | undefined) => {
  const d = a?.docDate || "";
  return d.length === 4 ? `${d}-12-31` : d;
};

/**
 * Place every file at once (the list of the current answers). Deterministic:
 *  1. files assigned by hand keep their instance while it is on the list;
 *  2. a file whose content equals an earlier file's is a duplicate (upload order);
 *  3. per requirement the newest documents fill the `expect` slots (a newer Grundbuchauszug
 *     takes the place of an outdated one — «Aktuelles hochladen»), ties by confidence, then
 *     upload order; the rest are surplus.
 */
export function placeAll(files: FileEntry[], state: ReqState, opts: PlaceOptions = {}): Map<string, Placement> {
  const now = opts.now ?? new Date();
  const dismissed = new Set(opts.dismissed ?? []);
  const instances = reqList(state);
  const byInstance = new Map(instances.map((i) => [i.instanceId, i]));
  const out = new Map<string, Placement>();
  const used = new Map<string, number>();

  // 1. Manual assignments.
  for (const f of files) {
    if (f.assignedByUser && f.instanceId && byInstance.has(f.instanceId) && f.uploadState !== "failed") {
      out.set(f.id, { instanceId: f.instanceId, requirementId: baseId(f.instanceId), reason: "manual" });
      used.set(f.instanceId, (used.get(f.instanceId) || 0) + 1);
    }
  }

  // 2. Duplicates and candidates.
  const firstByHash = new Map<string, string>();
  for (const f of files) {
    const h = f.analysisState === "done" ? f.analysis?.contentHash : null;
    if (h && !firstByHash.has(h)) firstByHash.set(h, f.id);
  }
  const contenders = new Map<string, { f: FileEntry; a: V3Analysis; i: number }[]>();
  files.forEach((f, i) => {
    if (out.has(f.id)) return;
    const a = analysisOf(f);
    const h = a?.contentHash;
    if (h && firstByHash.get(h) !== f.id) {
      const req = a?.docTypeId && v3DocType(a.docTypeId)?.kind === "requirement" ? a.docTypeId : null;
      out.set(f.id, { ...extra("duplicate", "duplicate", req), duplicateOf: firstByHash.get(h) });
      return;
    }
    const c = candidateFor(a, instances, dismissed.has(f.id), now);
    if (!("candidate" in c)) {
      out.set(f.id, c);
      return;
    }
    const list = contenders.get(c.candidate.instanceId) ?? [];
    list.push({ f, a: a!, i });
    contenders.set(c.candidate.instanceId, list);
  });

  // 3. Fill the slots, newest first.
  for (const [instanceId, list] of contenders) {
    const inst = byInstance.get(instanceId)!;
    list.sort(
      (x, y) =>
        dateRank(y.a).localeCompare(dateRank(x.a)) || (y.a.confidence || 0) - (x.a.confidence || 0) || x.i - y.i
    );
    let free = inst.expect - (used.get(instanceId) || 0);
    for (const { f } of list) {
      if (free > 0) {
        out.set(f.id, { instanceId, requirementId: inst.id, reason: "placed" });
        free--;
      } else {
        out.set(f.id, extra("surplus", "full", inst.id));
      }
    }
  }
  return out;
}

/**
 * The file with its placement written in (instanceId, analysis.requirementId / extraKind /
 * extraReason), or the same object when nothing changed — so a store sync can tell.
 */
export function withPlacement(f: FileEntry, p: Placement | undefined): FileEntry {
  if (!p || p.reason === "pending") {
    return f.instanceId && !f.assignedByUser ? { ...f, instanceId: null } : f;
  }
  const analysis = f.analysis
    ? {
        ...f.analysis,
        requirementId: p.requirementId,
        extraKind: p.extraKind,
        extraReason: p.extraReason,
      }
    : f.analysis;
  // A hand assignment whose requirement left the list goes back to automatic placement.
  const assignedByUser = p.reason === "manual" ? true : f.assignedByUser ? false : f.assignedByUser;
  const same =
    (f.instanceId ?? null) === p.instanceId &&
    Boolean(f.assignedByUser) === Boolean(assignedByUser) &&
    (!f.analysis ||
      (f.analysis.requirementId === p.requirementId && f.analysis.extraKind === p.extraKind && f.analysis.extraReason === p.extraReason));
  if (same) return f;
  return { ...f, instanceId: p.instanceId, assignedByUser, analysis };
}

/** All files with the placement for these answers applied. */
export function placedFiles(files: FileEntry[], state: ReqState, opts: PlaceOptions = {}): FileEntry[] {
  const map = placeAll(files, state, opts);
  return files.map((f) => withPlacement(f, map.get(f.id)));
}
