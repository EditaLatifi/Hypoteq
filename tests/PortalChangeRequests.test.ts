import { describe, it, expect, jest } from "@jest/globals";

/**
 * «Änderung beantragen» (lib/portal/changeRequests.ts).
 *
 * Salesforce stays the master of the partner's data. What is asserted here is the part
 * HYPOTEQ relies on: the request is validated on the server against the value Salesforce
 * holds, the Task lands on the partner's Contact with the agreed subject and everything
 * needed to act on it, and a Task Salesforce refuses never loses the request.
 */

// The real connection would log in to the production org: never loaded here.
jest.mock("@/components/salesforceApi", () => ({ conn: {}, login: async () => {}, withSessionRetry: async (op: () => any) => op() }));
jest.mock("@/lib/portal/salesforce", () => ({
  isSalesforceId: (id: unknown) => typeof id === "string" && /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id),
}));

import {
  addBusinessDays,
  buildChangeRequest,
  changeRequestLines,
  changeRequestNr,
  changeTaskPayload,
  createChangeTask,
  formatIban,
  isValidIban,
  loadPartnerData,
  mergePartnerData,
  partnerDataFromContact,
  queryTolerant,
  zurichDate,
  type PartnerData,
  type SfConnection,
} from "@/lib/portal/changeRequests";

const CONTACT = "003AB00000abcdEFGH";
const ACCOUNT = "001AB00000abcdEFGH";

const CURRENT: PartnerData = {
  name: "Daniel Meier",
  company: "Meier Finanzberatung GmbH",
  address: "Technikumstrasse 12, 8400 Winterthur",
  email: "d.meier@meier-finanz.ch",
  phone: "+41 52 203 44 10",
  iban: "CH93 0076 2011 6238 5295 7",
  partnerNr: "VP-0184",
};

/** A Salesforce stand-in: records what it is asked, answers from a script. */
function fakeSf(opts: { fields?: string[]; record?: any; create?: (rec: any) => any } = {}) {
  const queries: string[] = [];
  const created: any[] = [];
  const sf: SfConnection = {
    async query(soql: string) {
      queries.push(soql);
      const select = soql.match(/^SELECT (.+) FROM/)![1].split(", ");
      const unknown = opts.fields ? select.find((f) => !opts.fields!.includes(f)) : undefined;
      if (unknown) {
        // As Salesforce words it: the column, and the object it was looked up on.
        const [entity, col] = unknown.includes(".") ? unknown.split(".") : ["Contact", unknown];
        throw Object.assign(new Error(`No such column '${col}' on entity '${entity}'.`), { errorCode: "INVALID_FIELD" });
      }
      return { records: opts.record ? [opts.record] : [] };
    },
    sobject: (name: string) => ({
      async create(rec: any) {
        created.push({ name, rec });
        return opts.create ? opts.create(rec) : { id: "00TAB00000task0001", success: true, errors: [] };
      },
    }),
  };
  return { sf, queries, created };
}

describe("partner data from Salesforce", () => {
  const record = {
    Id: CONTACT,
    Name: "Daniel Meier",
    Email: "d.meier@meier-finanz.ch",
    Phone: null,
    MobilePhone: "+41 79 123 45 67",
    MailingStreet: "Privatweg 1",
    MailingPostalCode: "8000",
    MailingCity: "Zürich",
    AccountId: ACCOUNT,
    Account: { Name: "Meier Finanzberatung GmbH", BillingStreet: "Technikumstrasse 12", BillingPostalCode: "8400", BillingCity: "Winterthur", AccountNumber: "VP-0184" },
    IBAN__c: "ch9300762011623852957",
  };

  it("reads the company address first, the mobile number when there is no phone, and formats the IBAN", () => {
    expect(partnerDataFromContact(record, { iban: ["Account.IBAN__c", "IBAN__c"], partnerNr: ["Account.AccountNumber"] })).toEqual({
      name: "Daniel Meier",
      company: "Meier Finanzberatung GmbH",
      address: "Technikumstrasse 12, 8400 Winterthur",
      email: "d.meier@meier-finanz.ch",
      phone: "+41 79 123 45 67",
      iban: "CH93 0076 2011 6238 5295 7",
      partnerNr: "VP-0184",
    });
  });

  it("falls back to the contact's own address", () => {
    const data = partnerDataFromContact({ ...record, Account: { Name: "X" } }, { iban: [], partnerNr: [] });
    expect(data.address).toBe("Privatweg 1, 8000 Zürich");
  });

  it("drops fields the org does not have and still answers", async () => {
    const fields = ["Id", "Name", "Email", "Phone", "MobilePhone", "MailingStreet", "MailingPostalCode", "MailingCity", "AccountId", "Account.Name", "Account.BillingStreet", "Account.BillingPostalCode", "Account.BillingCity", "Account.AccountNumber"];
    const { sf, queries } = fakeSf({ fields, record: { ...record, IBAN__c: undefined } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const data = await loadPartnerData(CONTACT, sf, new Set());
    warn.mockRestore();

    expect(data?.name).toBe("Daniel Meier");
    expect(data?.iban).toBeNull();
    expect(queries.length).toBe(3); // Account.IBAN__c and IBAN__c are unknown here
    expect(queries[queries.length - 1]).not.toMatch(/IBAN/);
    expect(queries[0]).toContain(`WHERE Id = '${CONTACT}'`);
  });

  it("does not query for an id that is not a Salesforce id", async () => {
    const { sf, queries } = fakeSf();
    expect(await loadPartnerData("x' OR Name != '", sf, new Set())).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it("tells IBAN__c on the Contact from Account.IBAN__c, whichever order the errors come in", async () => {
    const base = ["Id", "Name"];
    for (const known of [["Account.IBAN__c"], ["IBAN__c"], []]) {
      const { sf, queries } = fakeSf({ fields: [...base, ...known], record: { Id: CONTACT } });
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      await queryTolerant(sf, [...base, "Account.IBAN__c", "IBAN__c"], (s) => `SELECT ${s} FROM Contact`, new Set());
      warn.mockRestore();
      const last = queries[queries.length - 1];
      expect(last).toBe(`SELECT ${[...base, ...known].join(", ")} FROM Contact`);
    }
  });

  it("gives up on any other Salesforce error instead of looping", async () => {
    const sf: SfConnection = {
      query: async () => {
        throw Object.assign(new Error("boom"), { errorCode: "REQUEST_LIMIT_EXCEEDED" });
      },
      sobject: () => ({ create: async () => ({}) }),
    };
    await expect(queryTolerant(sf, ["Id"], (s) => `SELECT ${s} FROM Contact`, new Set())).rejects.toThrow("boom");
  });

  it("fills what Salesforce does not know from the portal's own copy, and shows the login address", () => {
    const merged = mergePartnerData({ ...CURRENT, phone: null, email: "old@meier.ch" }, { name: "D. Meier", company: null, phone: "+41 52 000 00 00", email: "d.meier@meier-finanz.ch" });
    expect(merged.name).toBe("Daniel Meier");
    expect(merged.phone).toBe("+41 52 000 00 00");
    expect(merged.email).toBe("d.meier@meier-finanz.ch");
    expect(mergePartnerData(null, { name: "D. Meier", company: "Meier", phone: null, email: "a@b.ch" })).toMatchObject({ name: "D. Meier", company: "Meier", address: null });
  });
});

describe("buildChangeRequest", () => {
  it("builds a request with the current value from Salesforce", () => {
    expect(buildChangeRequest({ field: "address", newValue: "  Bahnhofstrasse 1,   8001 Zürich ", note: " Umzug per 1. November " }, CURRENT)).toEqual({
      ok: true,
      value: { field: "address", oldValue: "Technikumstrasse 12, 8400 Winterthur", newValue: "Bahnhofstrasse 1, 8001 Zürich", note: "Umzug per 1. November" },
    });
  });

  it("refuses unknown fields, empty and overlong values", () => {
    expect(buildChangeRequest({ field: "passwordHash", newValue: "x", note: "" }, CURRENT)).toEqual({ ok: false, problem: "field" });
    expect(buildChangeRequest({ field: "name", newValue: "   ", note: "" }, CURRENT)).toEqual({ ok: false, problem: "empty" });
    expect(buildChangeRequest({ field: "name", newValue: null, note: "" }, CURRENT)).toEqual({ ok: false, problem: "empty" });
    expect(buildChangeRequest({ field: "name", newValue: "x".repeat(501), note: "" }, CURRENT)).toEqual({ ok: false, problem: "tooLong" });
    expect(buildChangeRequest({ field: "name", newValue: "Dani", note: "x".repeat(1001) }, CURRENT)).toEqual({ ok: false, problem: "tooLong" });
  });

  it("refuses a value that is what Salesforce already holds", () => {
    expect(buildChangeRequest({ field: "name", newValue: "daniel  meier", note: "" }, CURRENT)).toEqual({ ok: false, problem: "unchanged" });
    expect(buildChangeRequest({ field: "iban", newValue: "CH9300762011623852957", note: "" }, CURRENT)).toEqual({ ok: false, problem: "unchanged" });
  });

  it("checks e-mail addresses and IBANs, and normalises them", () => {
    expect(buildChangeRequest({ field: "email", newValue: "not-an-address", note: "" }, CURRENT)).toEqual({ ok: false, problem: "email" });
    expect(buildChangeRequest({ field: "email", newValue: "Daniel@Meier-Finanz.CH", note: "" }, CURRENT)).toMatchObject({ ok: true, value: { newValue: "daniel@meier-finanz.ch" } });
    expect(buildChangeRequest({ field: "iban", newValue: "CH93 0076 2011 6238 5295 8", note: "" }, CURRENT)).toEqual({ ok: false, problem: "iban" });
    expect(buildChangeRequest({ field: "iban", newValue: "ch5604835012345678009", note: "" }, CURRENT)).toMatchObject({
      ok: true,
      value: { newValue: "CH56 0483 5012 3456 7800 9", oldValue: "CH93 0076 2011 6238 5295 7" },
    });
  });

  it("takes «Sonstiges» without a current value, and works when Salesforce was not reachable", () => {
    expect(buildChangeRequest({ field: "other", newValue: "Zweite Ansprechperson: Anna Meier", note: "" }, CURRENT)).toMatchObject({ ok: true, value: { oldValue: null } });
    expect(buildChangeRequest({ field: "phone", newValue: "+41 52 203 44 11", note: "" }, null)).toMatchObject({ ok: true, value: { oldValue: null } });
  });
});

describe("IBAN", () => {
  it("validates the check digits", () => {
    expect(isValidIban("CH93 0076 2011 6238 5295 7")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("CH93 0076 2011 6238 5295 6")).toBe(false);
    expect(isValidIban("CH93 0076 2011 6238 529")).toBe(false);
    expect(isValidIban("hello")).toBe(false);
  });

  it("is shown in groups of four", () => {
    expect(formatIban("ch9300762011623852957")).toBe("CH93 0076 2011 6238 5295 7");
  });
});

describe("the Salesforce Task", () => {
  const ctx = {
    nr: changeRequestNr("3f9c2a10-0000-4000-8000-000000000000"),
    request: { field: "address" as const, oldValue: "Technikumstrasse 12, 8400 Winterthur", newValue: "Bahnhofstrasse 1, 8001 Zürich", note: "Umzug per 1. November" },
    partner: { name: "Daniel Meier", email: "d.meier@meier-finanz.ch", company: "Meier Finanzberatung GmbH" },
    adminUrl: "https://www.hypoteq.ch/portal/admin/aenderungen",
  };

  it("has a short reference", () => {
    expect(ctx.nr).toBe("AA-3F9C2A");
  });

  it("sits on the partner's Contact and Account, with the agreed subject, the values and the note", () => {
    const payload = changeTaskPayload({ ...ctx, contactId: CONTACT, accountId: ACCOUNT, now: new Date("2026-10-15T10:00:00+02:00") });
    expect(payload.WhoId).toBe(CONTACT);
    expect(payload.WhatId).toBe(ACCOUNT);
    expect(payload.Subject).toBe("Änderungsantrag Partnerportal: Adresse");
    const d = String(payload.Description);
    expect(d).toContain("AA-3F9C2A");
    expect(d).toContain("Daniel Meier (Meier Finanzberatung GmbH) · d.meier@meier-finanz.ch");
    expect(d).toContain("Aktueller Wert: Technikumstrasse 12, 8400 Winterthur");
    expect(d).toContain("Neuer Wert: Bahnhofstrasse 1, 8001 Zürich");
    expect(d).toContain("Bemerkung: Umzug per 1. November");
    expect(d).toContain(ctx.adminUrl);
    // Thursday 15.10. + 2 working days = Monday 19.10.
    expect(payload.ActivityDate).toBe("2026-10-19");
  });

  it("leaves out an Account that is not a Salesforce id", () => {
    expect(changeTaskPayload({ ...ctx, contactId: CONTACT, accountId: null })).not.toHaveProperty("WhatId");
  });

  it("warns that a new e-mail address does not move the login", () => {
    const lines = changeRequestLines({ ...ctx, request: { field: "email", oldValue: "a@b.ch", newValue: "c@d.ch", note: null } });
    expect(lines.join("\n")).toMatch(/Login im Partnerportal/);
    expect(lines).toContain("Bemerkung: –");
  });

  it("returns the id of the created Task", async () => {
    const { sf, created } = fakeSf();
    const payload = changeTaskPayload({ ...ctx, contactId: CONTACT, accountId: ACCOUNT });
    expect(await createChangeTask(sf, payload)).toEqual({ id: "00TAB00000task0001", error: null });
    expect(created).toEqual([{ name: "Task", rec: payload }]);
  });

  it("retries with only the Contact, subject and description when the full Task is refused", async () => {
    const { sf, created } = fakeSf({
      create: (rec) => {
        if (rec.WhatId) throw Object.assign(new Error("FIELD_INTEGRITY_EXCEPTION: Related To ID"), { errorCode: "FIELD_INTEGRITY_EXCEPTION" });
        return { id: "00TAB00000task0002", success: true };
      },
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const res = await createChangeTask(sf, changeTaskPayload({ ...ctx, contactId: CONTACT, accountId: ACCOUNT }));
    warn.mockRestore();
    expect(res).toEqual({ id: "00TAB00000task0002", error: null });
    expect(Object.keys(created[1].rec).sort()).toEqual(["Description", "Subject", "WhoId"]);
  });

  it("never throws when Salesforce refuses the Task: the request survives without a Task id", async () => {
    const { sf } = fakeSf({ create: () => ({ success: false, errors: [{ message: "Kein Zugriff" }] }) });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const res = await createChangeTask(sf, changeTaskPayload({ ...ctx, contactId: CONTACT, accountId: ACCOUNT }));
    warn.mockRestore();
    expect(res).toEqual({ id: null, error: "Kein Zugriff" });
  });
});

describe("working days", () => {
  it("skips the weekend", () => {
    expect(zurichDate(addBusinessDays(new Date("2026-10-16T09:00:00+02:00"), 2))).toBe("2026-10-20"); // Fri → Tue
    expect(zurichDate(addBusinessDays(new Date("2026-10-17T09:00:00+02:00"), 2))).toBe("2026-10-20"); // Sat → Tue
    expect(zurichDate(addBusinessDays(new Date("2026-10-12T09:00:00+02:00"), 2))).toBe("2026-10-14"); // Mon → Wed
  });

  it("counts by the Zurich calendar, not UTC", () => {
    // 23:30 in Zurich on Friday is still Friday there (21:30 UTC).
    expect(zurichDate(new Date("2026-10-16T21:30:00Z"))).toBe("2026-10-16");
    // 00:30 on Saturday in Zurich is Friday 22:30 UTC.
    expect(zurichDate(new Date("2026-10-16T22:30:00Z"))).toBe("2026-10-17");
  });
});
