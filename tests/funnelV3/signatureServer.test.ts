/**
 * The Auskunftsermächtigung after the closing (lib/funnel-v3/signatureServer.ts): the state per
 * inquiry and the reminders after 2 and 5 days (Handover 6, 7.1; DECISIONS V11, V34–V37) — with
 * an in-memory InquirySignature table, a fake clock and a fake mailbox. Nothing leaves the process.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  createSignatureServer,
  reminderDue,
  zurichDay,
  type ReminderInquiry,
  type SignatureReminderSend,
  type SignatureRow,
  type SignatureServerDeps,
} from "@/lib/funnel-v3/signatureServer";
import { signatureReminderContent } from "@/lib/funnel-v3/signatureReminderMail";
import { signatureJson, signatureWithServer, SIGNATURE_BANK_NOTE_DE } from "@/lib/funnel-v3/signature";
import type { CompletionDocumentRow } from "@/lib/funnel-v3/completion";
import { CASE, INQUIRY, TOKEN, v3StateFor, GARY } from "./nachreichFixtures";

const quiet = { log: () => {}, warn: () => {}, error: () => {} };

beforeEach(() => {
  // testMode.skipped() logs every suppressed side effect.
  jest.spyOn(console, "log").mockImplementation(() => {});
});

/** 15.10.2026 16:30 in Zürich (14:30 UTC): «Später nachreichen» in the afternoon. */
const CLOSED = new Date("2026-10-15T14:30:00Z");
/** The cron: 06:00 UTC = 08:00 in Zürich. */
const cron = (day: number) => new Date(Date.UTC(2026, 9, day, 6, 0, 0));

function v5State(lang = "de") {
  return { ...v3StateFor([GARY], lang), version: 2, em: { spar: 0, s3a: 0, pkVor: 0, pkVerp: 0, schenk: 0, erbe: 0, darl: 0 }, info: { geb: "1979-03-12" }, sig: { choice: "later", at: CLOSED.toISOString(), method: "upload" } };
}

function world(opts: { inquiry?: Partial<ReminderInquiry>; documents?: CompletionDocumentRow[]; test?: boolean; inbox?: string | null; mailFails?: number; pdfFails?: boolean } = {}) {
  const table = new Map<string, SignatureRow>();
  const mails: SignatureReminderSend[] = [];
  const links: { id: string; token: string; expiresAt: Date }[] = [];
  let failures = opts.mailFails ?? 0;
  const inquiry: ReminderInquiry = {
    id: INQUIRY,
    caseNumber: CASE,
    nachreichToken: TOKEN,
    nachreichExpiresAt: new Date("2026-11-14T14:30:00Z"),
    v3State: v5State(),
    client: { email: "gary.gerber@example.ch", firstName: "Gary", lastName: "Gerber" },
    ...opts.inquiry,
  };
  const deps: SignatureServerDeps = {
    db: {
      find: async (id) => (table.has(id) ? { ...table.get(id)! } : null),
      create: async (row) => {
        if (table.has(row.inquiryId)) throw new Error("unique");
        table.set(row.inquiryId, { method: "upload", fileName: null, driveItemId: null, requestedAt: null, receivedAt: null, remindersSent: 0, lastReminderAt: null, ...row } as SignatureRow);
      },
      update: async (id, data) => {
        const r = table.get(id);
        if (!r) throw new Error("not found");
        table.set(id, { ...r, ...data });
      },
      listPending: async () => [...table.values()].filter((r) => r.status === "pending" && r.remindersSent < 2 && r.requestedAt).map((r) => ({ ...r })),
      claimReminder: async (id, from, at) => {
        const r = table.get(id);
        if (!r || r.status !== "pending" || r.remindersSent !== from) return false;
        table.set(id, { ...r, remindersSent: from + 1, lastReminderAt: at });
        return true;
      },
      releaseReminder: async (id, from, last) => {
        const r = table.get(id);
        if (r && r.remindersSent === from + 1) table.set(id, { ...r, remindersSent: from, lastReminderAt: last });
      },
      findInquiry: async (id) => (id === inquiry.id ? { ...inquiry } : null),
      findDocuments: async () => opts.documents ?? [],
      setNachreichLink: async (id, token, expiresAt) => {
        links.push({ id, token, expiresAt });
        inquiry.nachreichToken = token;
        inquiry.nachreichExpiresAt = expiresAt;
      },
    },
    buildPdf: async () => {
      if (opts.pdfFails) throw new Error("template missing");
      return { name: "HQ-26-10-000123_HYPOTEQ_Auskunftsermaechtigung_Gerber-Gary.pdf", bytes: new Uint8Array([37, 80, 68, 70]) };
    },
    sendMail: async (m) => {
      if (failures > 0) {
        failures--;
        throw new Error("Graph down");
      }
      mails.push(m);
      return true;
    },
    testMode: () => Boolean(opts.test),
    testInbox: () => opts.inbox ?? null,
    log: quiet,
  };
  const server = createSignatureServer(deps);
  return { server, table, mails, links, inquiry };
}

describe("the state per inquiry", () => {
  it("«später nachreichen» at submit: pending from now; uploaded: received at once", async () => {
    const w = world();
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    expect(w.table.get(INQUIRY)).toMatchObject({ status: "pending", method: "upload", requestedAt: CLOSED, receivedAt: null, remindersSent: 0 });

    await w.server.recordSignatureAtSubmit("other", { state: "uploaded", fileName: "Auskunft.pdf", driveItemId: "item-1" }, CLOSED);
    expect(w.table.get("other")).toMatchObject({ status: "uploaded", fileName: "Auskunft.pdf", driveItemId: "item-1", receivedAt: CLOSED, requestedAt: null });
  });

  it("neither chosen: pending all the same — the form is mandatory (V34)", async () => {
    const w = world();
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: null }, CLOSED);
    expect(w.table.get(INQUIRY)!.status).toBe("pending");
  });

  it("a retried submit keeps the first request time and never undoes a received copy", async () => {
    const w = world();
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, cron(17));
    expect(w.table.get(INQUIRY)!.requestedAt).toEqual(CLOSED);
    await w.server.markSignatureReceived(INQUIRY, { fileName: "signed.pdf", driveItemId: "it-9" }, cron(18));
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, cron(19));
    expect(w.table.get(INQUIRY)).toMatchObject({ status: "received", fileName: "signed.pdf", receivedAt: cron(18) });
  });

  it("markSignatureReceived: pending → received once; also without a row from the submit", async () => {
    const w = world();
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w.server.markSignatureReceived(INQUIRY, { fileName: "a.pdf" }, cron(17));
    await w.server.markSignatureReceived(INQUIRY, { fileName: "b.pdf" }, cron(18));
    expect(w.table.get(INQUIRY)).toMatchObject({ status: "received", fileName: "a.pdf", receivedAt: cron(17), requestedAt: CLOSED });

    await w.server.markSignatureReceived("fresh", { fileName: "c.pdf", driveItemId: "x" }, cron(17));
    expect(w.table.get("fresh")).toMatchObject({ status: "received", method: "upload", fileName: "c.pdf" });
  });

  it("fails soft: a missing table is logged, never thrown", async () => {
    const errors: string[] = [];
    const broken = createSignatureServer({
      ...world().server,
      db: new Proxy({}, { get: () => async () => { throw new Error('relation "InquirySignature" does not exist'); } }),
      log: { ...quiet, error: (m: string) => void errors.push(m), warn: (m: string) => void errors.push(m) },
    } as unknown as SignatureServerDeps);
    await expect(broken.recordSignatureAtSubmit(INQUIRY, { state: "later" })).resolves.toBeUndefined();
    await expect(broken.markSignatureReceived(INQUIRY, { fileName: "x.pdf" })).resolves.toBeUndefined();
    await expect(broken.sendSignatureReminders()).resolves.toEqual({ checked: 0, sent: 0 });
    await expect(broken.signatureState(INQUIRY)).resolves.toBeNull();
    expect(errors).toHaveLength(4);
    expect(errors.join(" ")).toMatch(/does not exist/);
  });
});

describe("reminderDue (Zürich calendar days)", () => {
  const row = (over: Partial<SignatureRow> = {}) => ({ status: "pending", requestedAt: CLOSED, remindersSent: 0, lastReminderAt: null, ...over });

  it("reminder 1 on the second day after, reminder 2 on the fifth, then none", () => {
    expect([16, 17, 18, 19, 20].map((d) => reminderDue(row(), cron(d)))).toEqual([null, 1, 1, 1, 1]);
    expect([17, 18, 19, 20, 21].map((d) => reminderDue(row({ remindersSent: 1, lastReminderAt: cron(17) }), cron(d)))).toEqual([null, null, null, 2, 2]);
    expect(reminderDue(row({ remindersSent: 2, lastReminderAt: cron(20) }), cron(30))).toBeNull();
  });

  it("counts calendar days in Zürich, not 48 hours: a closing late in the evening", () => {
    // 15.10. 23:30 in Zürich is 21:30 UTC; the 17th at 08:00 is 32.5 hours later — still «nach 2 Tagen».
    const late = new Date("2026-10-15T21:30:00Z");
    expect(zurichDay(late)).toBe(zurichDay(new Date("2026-10-15T10:00:00Z")));
    expect(reminderDue(row({ requestedAt: late }), cron(17))).toBe(1);
    // Just after midnight in Zürich (22:30 UTC the day before) belongs to the next day.
    expect(zurichDay(new Date("2026-10-15T22:30:00Z"))).toBe(zurichDay(new Date("2026-10-16T12:00:00Z")));
  });

  it("never two on one day, nothing for a received copy or without a request time", () => {
    expect(reminderDue(row({ remindersSent: 1, lastReminderAt: cron(20) }), new Date(Date.UTC(2026, 9, 20, 18)))).toBeNull();
    expect(reminderDue(row({ status: "received" }), cron(25))).toBeNull();
    expect(reminderDue(row({ requestedAt: null }), cron(25))).toBeNull();
  });
});

describe("sendSignatureReminders (daily cron)", () => {
  it("day 2 and day 5: the customer gets the PDF and the Nachreich link in the funnel language; nothing else", async () => {
    const w = world({ inquiry: { v3State: v5State("fr") } });
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);

    expect(await w.server.sendSignatureReminders(cron(16))).toEqual({ checked: 1, sent: 0 });
    expect(await w.server.sendSignatureReminders(cron(17))).toEqual({ checked: 1, sent: 1 });
    expect(w.mails[0]).toMatchObject({
      to: "gary.gerber@example.ch",
      lang: "fr",
      name: "Gary",
      caseNumber: CASE,
      reminder: 1,
      uploadUrl: `https://hypoteq.com/fr/nachreichen/${TOKEN}`,
      attachment: { name: expect.stringMatching(/Auskunftsermaechtigung.*\.pdf$/) },
    });
    expect(w.table.get(INQUIRY)).toMatchObject({ remindersSent: 1, lastReminderAt: cron(17) });

    // The cron running twice the same day sends nothing more.
    expect(await w.server.sendSignatureReminders(new Date(Date.UTC(2026, 9, 17, 6, 5)))).toEqual({ checked: 1, sent: 0 });
    for (const d of [18, 19]) await w.server.sendSignatureReminders(cron(d));
    expect(w.mails).toHaveLength(1);
    await w.server.sendSignatureReminders(cron(20));
    expect(w.mails.map((m) => m.reminder)).toEqual([1, 2]);
    // Never a third.
    for (const d of [21, 25, 30]) await w.server.sendSignatureReminders(cron(d));
    expect(w.mails).toHaveLength(2);
    expect(w.table.get(INQUIRY)!.remindersSent).toBe(2);
  });

  it("two cron runs at the same moment: the claim lets only one of them mail", async () => {
    const w = world();
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    const [a, b] = await Promise.all([w.server.sendSignatureReminders(cron(17)), w.server.sendSignatureReminders(cron(17))]);
    expect(a.sent + b.sent).toBe(1);
    expect(w.mails).toHaveLength(1);
  });

  it("a cron that missed days catches up one reminder per day", async () => {
    const w = world();
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w.server.sendSignatureReminders(cron(24));
    await w.server.sendSignatureReminders(cron(24));
    expect(w.mails.map((m) => m.reminder)).toEqual([1]);
    await w.server.sendSignatureReminders(cron(25));
    expect(w.mails.map((m) => m.reminder)).toEqual([1, 2]);
  });

  it("stops once the signed copy is received", async () => {
    const w = world();
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w.server.sendSignatureReminders(cron(17));
    await w.server.markSignatureReceived(INQUIRY, { fileName: "signed.pdf" }, cron(18));
    expect(await w.server.sendSignatureReminders(cron(20))).toEqual({ checked: 0, sent: 0 });
    expect(w.mails).toHaveLength(1);
  });

  it("a signed copy already among the documents: marked received instead of a reminder", async () => {
    const signed: CompletionDocumentRow = {
      id: "d-sig",
      fileName: "scan.pdf",
      fileUrl: "https://sp/scan.pdf",
      originalFileName: "scan.pdf",
      driveItemId: "item-sig",
      uploadedAt: cron(16),
      aiAnalysis: { v3: { status: "done", docTypeId: "vollmacht", docTypeLabel: "x", confidence: 0.9, requirementId: "vollmacht", fields: { Unterschrift: { value: "vorhanden", confidence: 0.9 } } } },
      storedName: `${CASE}_01_Auskunftsermaechtigung_Gerber-Gary.pdf`,
    };
    const w = world({ documents: [signed] });
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    expect(await w.server.sendSignatureReminders(cron(17))).toEqual({ checked: 1, sent: 0 });
    expect(w.table.get(INQUIRY)).toMatchObject({ status: "received", fileName: `${CASE}_01_Auskunftsermaechtigung_Gerber-Gary.pdf`, driveItemId: "item-sig" });
    // An unsigned copy does not count.
    const unsigned = { ...signed, aiAnalysis: { v3: { ...(signed.aiAnalysis as any).v3, fields: { Unterschrift: { value: "fehlt", confidence: 0.9 } } } } };
    const w2 = world({ documents: [unsigned] });
    await w2.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    expect((await w2.server.sendSignatureReminders(cron(17))).sent).toBe(1);
  });

  it("a failed mail is retried on the next run, not counted", async () => {
    const w = world({ mailFails: 1 });
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    expect(await w.server.sendSignatureReminders(cron(17))).toEqual({ checked: 1, sent: 0 });
    expect(w.table.get(INQUIRY)).toMatchObject({ remindersSent: 0, lastReminderAt: null });
    expect(await w.server.sendSignatureReminders(cron(18))).toEqual({ checked: 1, sent: 1 });
  });

  it("without the PDF the reminder still goes out (the Nachreich page has the template)", async () => {
    const w = world({ pdfFails: true });
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w.server.sendSignatureReminders(cron(17));
    expect(w.mails[0].attachment).toBeNull();
  });

  it("keeps the Nachreich link alive: extends a link that expires soon, mints one when there is none", async () => {
    const w = world({ inquiry: { nachreichExpiresAt: new Date("2026-10-25T00:00:00Z") } });
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w.server.sendSignatureReminders(cron(17));
    expect(w.links).toEqual([{ id: INQUIRY, token: TOKEN, expiresAt: new Date(cron(17).getTime() + 30 * 86_400_000) }]);

    const w2 = world({ inquiry: { nachreichToken: null, nachreichExpiresAt: null } });
    await w2.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w2.server.sendSignatureReminders(cron(17));
    expect(w2.links[0].token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w2.mails[0].uploadUrl).toBe(`https://hypoteq.com/de/nachreichen/${w2.links[0].token}`);

    // 30 days ahead (the usual link): left as it is.
    const w3 = world();
    await w3.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w3.server.sendSignatureReminders(cron(17));
    expect(w3.links).toEqual([]);
  });

  it("Berater submission: to the customer from step 1, no copy to the Berater", async () => {
    const st = v5State();
    st.role = "berater";
    st.txt = { ...st.txt, bmail: "berater@partner.ch", mail: "kunde@example.ch" };
    const w = world({ inquiry: { v3State: st, client: { email: "berater@partner.ch", firstName: "", lastName: "" } } });
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    await w.server.sendSignatureReminders(cron(17));
    expect(w.mails[0].to).toBe("kunde@example.ch");
    expect(w.mails[0]).not.toHaveProperty("cc");
  });

  it("test mode: no database change, mail only to the test inbox — none without one", async () => {
    const w = world({ test: true });
    await w.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    expect(await w.server.sendSignatureReminders(cron(17))).toEqual({ checked: 1, sent: 0 });
    expect(w.mails).toEqual([]);

    const w2 = world({ test: true, inbox: "test@hypoteq.ch", inquiry: { nachreichExpiresAt: new Date("2026-10-20T00:00:00Z") } });
    await w2.server.recordSignatureAtSubmit(INQUIRY, { state: "later" }, CLOSED);
    expect(await w2.server.sendSignatureReminders(cron(17))).toEqual({ checked: 1, sent: 1 });
    // The mail goes through routeMail (redirected to the inbox); the row and the link stay untouched.
    expect(w2.table.get(INQUIRY)).toMatchObject({ remindersSent: 0, lastReminderAt: null });
    expect(w2.links).toEqual([]);
  });
});

describe("the reminder mail (Handover 7.1: Vorlage + Upload-Link, keine Zusammenfassung)", () => {
  const base = { lang: "de" as const, name: "Gary", caseNumber: CASE, uploadUrl: `https://hypoteq.com/de/nachreichen/${TOKEN}`, reminder: 1 as const, attachment: { name: "x.pdf", bytes: new Uint8Array() } };

  it("German, «du», the link as the one button, no summary", () => {
    const c = signatureReminderContent(base);
    expect(c.subject).toBe(`Erinnerung: Bitte Auskunftsermächtigung unterzeichnen – ${CASE}`);
    expect(c.text).toContain("Hallo Gary");
    expect(c.text).toContain(`Für deine Finanzierungsanfrage ${CASE} fehlt noch die unterzeichnete Auskunftsermächtigung.`);
    expect(c.text).toContain("liegt dieser Mail bei");
    expect(c.html).toContain(`href="https://hypoteq.com/de/nachreichen/${TOKEN}"`);
    expect(c.html).not.toMatch(/Belehnung|Tragbarkeit|CHF/);
    expect(signatureReminderContent({ ...base, reminder: 2 }).subject).toMatch(/^Zweite Erinnerung/);
  });

  it("in the funnel language, without attachment and name, escaped", () => {
    const fr = signatureReminderContent({ ...base, lang: "fr", attachment: null, name: "<b>Zoé</b>" });
    expect(fr.subject).toMatch(/^Rappel/);
    expect(fr.html).toContain("Bonjour &lt;b&gt;Zoé&lt;/b&gt;");
    expect(fr.text).toContain("via le lien");
    const it = signatureReminderContent({ ...base, lang: "it", name: "", caseNumber: null });
    expect(it.subject).toBe("Promemoria: firmi l’autorizzazione a fornire informazioni");
    expect(it.text.startsWith("Buongiorno\n")).toBe(true);
    expect(it.text).toContain("Per la Sua richiesta di finanziamento manca ancora");
    expect(signatureReminderContent({ ...base, lang: "en" }).subject).toMatch(/^Reminder: please sign/);
  });
});

describe("the Case JSON with the server state (Handover 8 «Zeitstempel, Methode»)", () => {
  it("pending with reminders and the bank note; received later = uploaded with its time", () => {
    const later = { choice: "later" as const, at: CLOSED.toISOString(), method: "upload" as const };
    const base = signatureJson({ status: "later" }, later);
    expect(signatureWithServer(base, { status: "pending", requestedAt: CLOSED, remindersSent: 1, lastReminderAt: cron(17) })).toEqual({
      status: "pending",
      at: CLOSED.toISOString(),
      method: "upload",
      requestedAt: CLOSED.toISOString(),
      reminders: 1,
      lastReminderAt: cron(17).toISOString(),
      note: SIGNATURE_BANK_NOTE_DE,
    });
    const received = signatureWithServer(base, { status: "received", requestedAt: CLOSED, receivedAt: cron(18), remindersSent: 1 });
    expect(received).toMatchObject({ status: "uploaded", at: cron(18).toISOString(), receivedAt: cron(18).toISOString() });
    expect(received).not.toHaveProperty("note");
    // Without a row (table missing): the funnel's own verdict, with the note while not uploaded.
    expect(signatureWithServer(signatureJson({ status: "missing" }, null), null)).toEqual({ status: "missing", at: null, method: "upload", note: SIGNATURE_BANK_NOTE_DE });
  });
});
