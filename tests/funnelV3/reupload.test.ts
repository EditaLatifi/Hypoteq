import { describe, it, expect, beforeEach } from "@jest/globals";
import type { CompletionDocumentRow } from "@/lib/funnel-v3/completion";
import { normaliseFunnelState } from "@/lib/funnel-v3/legacy";
import { reqList } from "@/lib/funnel-v3/requirements";
import { parseReuploadRequest, resolveRequirement, reuploadMail, reuploadReminderDue, type ReuploadRow } from "@/lib/funnel-v3/reupload";
import { createReuploadServer, type ReuploadDeps, type ReuploadInquiry } from "@/lib/funnel-v3/reuploadServer";
import { kaufState } from "./v5Fixtures";

/**
 * Re-Upload (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich Kap. 5; answers 1, 8 and 9 of
 * 26.10.2026): Salesforce asks, the funnel mails the link, reminds after 2 and 5 days, and the
 * new document answers it.
 */

const CASE_ID = "500AA000001xyzQAAQ";
const CASE = "HQ-26-10-000123";
const state = { ...kaufState(), version: 2, lang: "de" as const };
const stored = normaliseFunnelState(state)!;
const lohnInst = reqList(stored).find((i) => i.id === "lohnausweise" && i.borrowerId === "b1")!;

describe("the request (parseReuploadRequest)", () => {
  it("needs the case, the requirement and the reason; checks the rest", () => {
    expect(parseReuploadRequest({ caseId: CASE_ID, requirement: "lohnausweise_kn1", reason: "Unleserlich", recipient: "kunde", taskId: "00TAA000001abcdEAA" })).toMatchObject({
      caseId: CASE_ID,
      requirement: "lohnausweise_kn1",
      reason: "Unleserlich",
      recipient: "kunde",
      taskId: "00TAA000001abcdEAA",
      preview: false,
      mailText: null,
    });
    expect(parseReuploadRequest({ requirement: "x", reason: "y" })).toBe("caseId or caseNumber is required");
    expect(parseReuploadRequest({ caseNumber: CASE, reason: "y" })).toBe("requirement is required");
    expect(parseReuploadRequest({ caseNumber: CASE, requirement: "x" })).toBe("reason is required");
    expect(parseReuploadRequest({ caseNumber: CASE, requirement: "x", reason: "y", recipient: "bank" })).toBe("recipient must be «kunde» or «partner»");
    expect(parseReuploadRequest({ caseId: "nope", requirement: "x", reason: "y" })).toBe("caseId is not a Salesforce id");
  });
});

describe("which requirement (resolveRequirement)", () => {
  it("the check-state id, the code, the id or HYPOTEQ's key, with the Kreditnehmer", () => {
    expect(resolveRequirement(stored, lohnInst.instanceId)?.instanceId).toBe(lohnInst.instanceId);
    expect(resolveRequirement(stored, `${lohnInst.code}_kn1`)?.instanceId).toBe(lohnInst.instanceId);
    expect(resolveRequirement(stored, "lohnausweise_kn1")?.instanceId).toBe(lohnInst.instanceId);
    expect(resolveRequirement(stored, "lohnausweis")?.instanceId).toBe(lohnInst.instanceId);
    expect(resolveRequirement(stored, "pass_id_kn1")?.id).toBe("id");
    expect(resolveRequirement(stored, "grundbuchauszug")?.id).toBe("grundbuch");
    expect(resolveRequirement(stored, "lohnausweise_kn2")).toBeNull();
    expect(resolveRequirement(stored, "nonsense")).toBeNull();
  });
});

describe("the mails (10.1, 10.2): customers «du», partners «Sie»", () => {
  const base = { lang: "de" as const, first: "Lea", last: "Muster", caseNumber: CASE, document: "Aktueller Lohnausweis – Lea Muster", reason: "Die zweite Seite fehlt.", link: "https://hypoteq.com/de/nachreichen/T", reminder: 0 as const };

  it("the customer: «du», the reason, the link as the button", () => {
    const m = reuploadMail({ ...base, recipient: "kunde" });
    expect(m.subject).toBe("Deine Finanzierungsanfrage – ein Dokument wird neu benötigt");
    expect(m.text).toContain("Hi Lea,");
    expect(m.text).toContain("Wir haben deine Unterlagen geprüft. Beim Dokument «Aktueller Lohnausweis – Lea Muster» gibt es einen Punkt zu klären: Die zweite Seite fehlt.");
    expect(m.text).toContain("Bitte lade das Dokument über folgenden Link neu hoch – es dauert nur eine Minute:");
    expect(m.text).toContain("Dein HYPOTEQ-Team");
    expect(m.html).toContain('href="https://hypoteq.com/de/nachreichen/T"');
    expect(m.html).toContain(">Dokument hochladen</a>");
    expect(m.html).toContain("HYPOTEQ_layout_logo.png");
    // 10.1: **«{dokument}»** — bold in the HTML part, also in the reminders and in English.
    expect(m.html).toContain("<strong>«Aktueller Lohnausweis – Lea Muster»</strong>");
    expect(reuploadMail({ ...base, recipient: "kunde", reminder: 1 }).html).toContain("<strong>«Aktueller Lohnausweis – Lea Muster»</strong>");
    expect(reuploadMail({ ...base, lang: "en", recipient: "kunde" }).html).toContain("<strong>“Aktueller Lohnausweis – Lea Muster”</strong>");
  });

  it("the partner: «Sie» and the case", () => {
    const m = reuploadMail({ ...base, recipient: "partner", first: "Bea", last: "Rater" });
    expect(m.subject).toBe("Ihre Finanzierungsanfrage – ein Dokument wird neu benötigt");
    expect(m.text).toContain("Guten Tag Bea Rater");
    expect(m.text).toContain(`Zum Fall ${CASE} haben wir die Unterlagen geprüft.`);
    expect(m.text).toContain("Bitte laden Sie das Dokument");
    expect(m.text).toContain("Ihr HYPOTEQ-Team");
    expect(reuploadMail({ ...base, recipient: "partner", first: "", last: "" }).text.startsWith("Guten Tag\n")).toBe(true);
  });

  it("HYPOTEQ's edited text, the link where it says {link}; the reminders on day 2 and 5", () => {
    const m = reuploadMail({ ...base, recipient: "kunde", mailText: "Hallo Lea\n\nBitte hier: {link}\n\nGruss Marco" });
    expect(m.text).toContain("Bitte hier: https://hypoteq.com/de/nachreichen/T");
    expect(m.html).not.toContain(">Dokument hochladen</a>");
    expect(reuploadMail({ ...base, recipient: "kunde", reminder: 1 }).subject).toBe("Erinnerung: ein Dokument fehlt noch");
    const second = reuploadMail({ ...base, recipient: "kunde", reminder: 2 });
    expect(second.subject).toBe("Zweite Erinnerung: Deine Finanzierungsanfrage wartet");
    expect(second.text).toContain("Für deine Finanzierungsanfrage fehlt noch das Dokument «Aktueller Lohnausweis – Lea Muster».");
    expect(reuploadMail({ ...base, lang: "fr", recipient: "partner", reminder: 1 }).text).toContain(`manque encore pour le dossier ${CASE}`);
  });

  it("the reminders: day 2, day 5, one a day, none once answered", () => {
    const row = { status: "open", requestedAt: new Date("2026-10-26T09:00:00Z"), remindersSent: 0, lastReminderAt: null };
    expect(reuploadReminderDue(row, new Date("2026-10-27T06:00:00Z"))).toBeNull();
    expect(reuploadReminderDue(row, new Date("2026-10-28T06:00:00Z"))).toBe(1);
    expect(reuploadReminderDue({ ...row, remindersSent: 1, lastReminderAt: new Date("2026-10-28T06:00:00Z") }, new Date("2026-10-30T06:00:00Z"))).toBeNull();
    expect(reuploadReminderDue({ ...row, remindersSent: 1, lastReminderAt: new Date("2026-10-28T06:00:00Z") }, new Date("2026-10-31T06:00:00Z"))).toBe(2);
    expect(reuploadReminderDue({ ...row, remindersSent: 2 }, new Date("2026-11-30T06:00:00Z"))).toBeNull();
    expect(reuploadReminderDue({ ...row, status: "resolved" }, new Date("2026-10-28T06:00:00Z"))).toBeNull();
  });
});

// ---- the server, with fakes ------------------------------------------------------------------

function world(opts: { missingTable?: boolean } = {}) {
  const inquiry: ReuploadInquiry = {
    id: "inq-1",
    caseNumber: CASE,
    salesforceCaseId: CASE_ID,
    nachreichToken: null,
    nachreichExpiresAt: null,
    v3State: state,
    v3Skipped: [],
    client: { email: "lea.muster@kunde.ch", firstName: "Lea", lastName: "Muster" },
  };
  const lohn = { status: "done", docTypeId: "lohnausweise", docTypeLabel: "Lohnausweis", confidence: 0.95, requirementId: "lohnausweise", personName: "Muster Lea", fields: {} };
  const docs: CompletionDocumentRow[] = [
    { id: "doc-1", fileName: "lohn.pdf", fileUrl: "u", originalFileName: "lohn.pdf", driveItemId: "i1", uploadedAt: new Date("2026-10-20T10:00:00Z"), aiAnalysis: { v3: lohn, v3Submitted: { instanceId: lohnInst.instanceId, requirementId: "lohnausweise" } }, storedName: null } as any,
  ];
  const rows: ReuploadRow[] = [];
  const mails: { to: string; subject: string; text: string }[] = [];
  const cases: Record<string, unknown>[] = [];
  const closed: string[] = [];
  const deps: ReuploadDeps = {
    db: {
      findInquiry: async (by) => (by.caseId === CASE_ID || by.caseNumber === CASE ? inquiry : null),
      findInquiryById: async (id) => (id === inquiry.id ? inquiry : null),
      findDocuments: async () => docs,
      updateDocumentAnalysis: async (id, ai) => {
        docs.find((d) => d.id === id)!.aiAnalysis = ai;
      },
      listForInquiry: async () => {
        if (opts.missingTable) throw new Error('The table `public.InquiryReupload` does not exist (P2021)');
        return rows.map((r) => ({ ...r }));
      },
      create: async (r) => {
        const row = { id: `r${rows.length + 1}`, status: "open", remindersSent: 0, lastReminderAt: null, resolvedAt: null, ...r } as ReuploadRow;
        rows.push(row);
        return row;
      },
      update: async (id, data) => {
        Object.assign(rows.find((r) => r.id === id)!, data);
      },
      listOpen: async () => rows.filter((r) => r.status === "open").map((r) => ({ ...r })),
      claimReminder: async (id, from, at) => {
        const r = rows.find((x) => x.id === id)!;
        if (r.remindersSent !== from) return false;
        r.remindersSent = from + 1;
        r.lastReminderAt = at;
        return true;
      },
      releaseReminder: async () => {},
      setNachreichLink: async (_id, token, expiresAt) => {
        inquiry.nachreichToken = token;
        inquiry.nachreichExpiresAt = expiresAt;
      },
    },
    sendMail: async (to, m) => {
      mails.push({ to, subject: m.subject, text: m.text });
      return true;
    },
    updateCase: async (_caseId, build) => cases.push(build(null) as Record<string, unknown>),
    closeTask: async (id) => {
      closed.push(id);
    },
    pruefregeln: async () => ({ rules: (await import("@/lib/funnel-v3/abgleich/rules")).FALLBACK_RULES, from: "fallback" as const }),
    link: { create: () => "TOKEN", expiry: (from) => new Date(from.getTime() + 30 * 86_400_000), url: (t, l) => `https://hypoteq.com/${l}/nachreichen/${t}` },
    testMode: () => false,
    log: { log: () => {}, warn: () => {}, error: () => {} },
  };
  return { server: createReuploadServer(deps), inquiry, docs, rows, mails, cases, closed };
}

describe("the server", () => {
  let w: ReturnType<typeof world>;
  beforeEach(() => {
    w = world();
  });
  const NOW = new Date("2026-10-26T09:00:00Z");
  const ask = (over: Record<string, unknown> = {}) => w.server.requestReupload({ caseId: CASE_ID, requirement: "lohnausweise_kn1", reason: "Die zweite Seite fehlt.", recipient: "kunde", taskId: "00TAA000001abcdEAA", ...over }, NOW);

  it("a request: the document to «Weitere Dateien», the request kept, the mail with the link, the Case updated", async () => {
    const res = await ask();
    expect(res).toMatchObject({ status: 200, body: { ok: true, requirement: lohnInst.instanceId, recipient: "kunde", mailSent: true, movedDocuments: 1, reminders: ["2026-10-28", "2026-10-31"] } });
    // never deleted: placed outside the list, kept
    expect((w.docs[0].aiAnalysis as any).v3Submitted).toMatchObject({ instanceId: null, extraKind: "surplus", keep: true });
    expect((w.docs[0].aiAnalysis as any).v3Reupload).toMatchObject({ requirement: lohnInst.instanceId, reason: "Die zweite Seite fehlt." });
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ status: "open", recipientEmail: "lea.muster@kunde.ch", taskId: "00TAA000001abcdEAA", previousDocumentIds: ["doc-1"] });
    expect(w.mails[0].to).toBe("lea.muster@kunde.ch");
    expect(w.mails[0].text).toContain("https://hypoteq.com/de/nachreichen/TOKEN");
    expect(w.inquiry.nachreichToken).toBe("TOKEN");
    // the Case: the Lohnausweis missing again, the JSON with the re-upload
    const fields = w.cases[0];
    expect(fields.Documents_completed__c).toBe(false);
    const json = JSON.parse(String(fields.Funnel_Abgleich_State__c));
    expect(json.reuploads).toEqual([{ requirement: lohnInst.instanceId, requestedAt: NOW.toISOString(), resolvedAt: null }]);
  });

  it("the preview for the dialog changes nothing", async () => {
    const res = await ask({ preview: true });
    expect(res.body).toMatchObject({ ok: true, preview: true, to: "lea.muster@kunde.ch", subject: "Deine Finanzierungsanfrage – ein Dokument wird neu benötigt" });
    expect(String(res.body.text)).toContain("{link}");
    expect(w.rows).toHaveLength(0);
    expect(w.mails).toHaveLength(0);
    expect((w.docs[0].aiAnalysis as any).v3Submitted.instanceId).toBe(lohnInst.instanceId);
  });

  it("the partner gets it when HYPOTEQ says so; an unknown requirement lists the valid ones; without the table 503", async () => {
    const partner = await ask({ recipient: "partner" });
    expect(partner.status).toBe(422);
    expect(partner.body.error).toBe("no e-mail address for the partner");
    const unknown = await ask({ requirement: "nonsense" });
    expect(unknown.status).toBe(422);
    expect((unknown.body.requirements as any[]).some((r) => r.id === lohnInst.instanceId)).toBe(true);
    expect((await ask({ caseId: "500AA000009zzzzQAA" })).status).toBe(404);
    w = world({ missingTable: true });
    expect((await ask()).status).toBe(503);
  });

  it("asking again for the same document renews the request instead of adding one", async () => {
    await ask();
    await ask({ reason: "Bitte die aktuelle Version." });
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ reason: "Bitte die aktuelle Version.", remindersSent: 0 });
  });

  it("the reminders: day 2 sent; a new document answers it, closes the Task and stops them", async () => {
    await ask();
    expect(await w.server.sendReuploadReminders(new Date("2026-10-27T06:00:00Z"))).toMatchObject({ sent: 0 });
    expect(await w.server.sendReuploadReminders(new Date("2026-10-28T06:00:00Z"))).toMatchObject({ sent: 1 });
    expect(w.mails.at(-1)!.subject).toBe("Erinnerung: ein Dokument fehlt noch");
    // the new Lohnausweis arrives on the requirement
    w.docs.push({ id: "doc-2", fileName: "lohn2.pdf", fileUrl: "u", originalFileName: "lohn2.pdf", driveItemId: "i2", uploadedAt: new Date("2026-10-29T10:00:00Z"), aiAnalysis: { v3: (w.docs[0].aiAnalysis as any).v3, v3Submitted: { instanceId: lohnInst.instanceId, requirementId: "lohnausweise" } }, storedName: null } as any);
    const after = await w.server.resolveReuploads("inq-1", normaliseFunnelState(state)! as any, w.docs, new Date("2026-10-29T10:05:00Z"));
    expect(after[0]).toMatchObject({ status: "resolved" });
    expect(w.closed).toEqual(["00TAA000001abcdEAA"]);
    expect(await w.server.sendReuploadReminders(new Date("2026-10-31T06:00:00Z"))).toMatchObject({ checked: 0, sent: 0 });
  });
});
