import { NextResponse } from "next/server";

/* ==========================================================================
 * DEV-ONLY: list the Case document fields as the org actually defines them.
 *
 * The funnel maps each uploaded document onto a checkbox in the Case's
 * "Dokumenten-Check" tab. Those API names live in Salesforce, not here, so the mapping
 * in components/funnelDocumentCatalog.ts can silently drift the moment an admin adds or
 * renames a checkbox — a write to a field that no longer exists is dropped by the
 * field-fallback logic without anyone noticing. This endpoint is how you check.
 *
 * Disabled in production: it exposes org metadata and is an operator tool.
 *
 *   npm run dev
 *   curl "http://localhost:3000/api/admin/describe-case-docs"
 *   curl "http://localhost:3000/api/admin/describe-case-docs?all=1"   # every checkbox
 * ======================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }

  const url = new URL(req.url);
  const includeAllCheckboxes = url.searchParams.get("all") === "1";

  try {
    const { DOCUMENT_CATALOG } = await import("@/components/funnelDocumentCatalog");
    const salesforceApi = (await import("@/components/salesforceApi")).default;
    const { conn } = await import("@/components/salesforceApi");

    // Go through jsforce, exactly as the funnel sync does. A hand-rolled REST call with a
    // freshly minted client-credentials token is refused with INVALID_SESSION_ID by this
    // org even though the very same credentials create Accounts and Cases through jsforce
    // moments later — so the working path is the one to reuse, not to reimplement.
    await salesforceApi.login();
    // Prove the shared connection is usable before relying on it: findContactByEmail is a
    // call the funnel makes successfully on every submission, so if it fails here the
    // problem is this route's view of `conn`, not the query that follows.
    let warmup = "ok";
    try {
      await salesforceApi.findContactByEmail("nobody@example.invalid");
    } catch (e: any) {
      warmup = e?.data?.message || e?.message || "failed";
    }

    // ?case=<Id> reads back what a real Case actually holds for the document fields —
    // the only way to answer "did our upload reach Salesforce?" with evidence rather than
    // with a claim about what the code sends.
    const caseId = url.searchParams.get("case");
    if (caseId) {
      const fields = [
        "Id", "CaseNumber", "Documents_completed__c", "Dokumenten_Check_State__c",
        "Dok_Identitaetsdokument__c", "Dok_Lohnausweis__c", "Dok_Steuererklaerung__c",
        "Dok_Betreibungsregisterauszug__c", "Dok_Pensionskassenausweis__c",
        "Dok_Kaufvertrag__c", "Dok_Grundbuchauszug__c",
        "Dok_Gebaeudeversicherungsausweis__c", "Dok_Fotos_der_Immobilie__c",
        "Dok_Grundrissplaene__c",
      ];
      const q: any = await conn.query(
        `SELECT ${fields.join(",")} FROM Case WHERE Id = '${caseId.replace(/'/g, "")}'`
      );
      return NextResponse.json({ record: q?.records?.[0] ?? null, warmup });
    }

    // ?probe=1 answers the only question that matters when everything returns
    // INVALID_SESSION_ID: is this route's connection authenticated at all (in which case
    // the refusals are about metadata permissions), or is it not (in which case the
    // problem is here, not in the org).
    if (url.searchParams.get("probe") === "1") {
      const probes: Record<string, string> = { findContactByEmail: warmup };
      for (const [label, soql] of [
        ["count Case", "SELECT COUNT() FROM Case"],
        ["one Case id", "SELECT Id FROM Case LIMIT 1"],
        ["FieldDefinition", "SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Case' LIMIT 1"],
        ["FIELDS(ALL)", "SELECT FIELDS(ALL) FROM Case LIMIT 1"],
      ] as const) {
        try {
          await conn.query(soql);
          probes[label] = "ok";
        } catch (e: any) {
          probes[label] = `${e?.errorCode || ""} ${e?.data?.message || e?.message || ""}`.trim().slice(0, 120);
        }
      }
      // Take the session login() just established and use it directly, so we can tell a
      // dead token apart from jsforce mishandling a live one.
      const rawToken = (conn as any).accessToken as string | undefined;
      const rawInstance = (conn as any).instanceUrl as string | undefined;
      let rawLimits = "not attempted";
      let userinfo = "not attempted";
      let tokenResponseKeys: string[] = [];
      let identityUrl = "not attempted";
      if (rawToken && rawInstance) {
        const r = await fetch(`${rawInstance}/services/data/v50.0/limits`, {
          headers: { Authorization: `Bearer ${rawToken}` },
        });
        rawLimits = `HTTP ${r.status} ${(await r.text()).slice(0, 120)}`;

        // userinfo is an OAuth endpoint, not a data-API one. A live session answers it even
        // when API access is restricted — so this separates "the session is dead" from
        // "the session is fine but something blocks the data API".
        const ui = await fetch(`${rawInstance}/services/oauth2/userinfo`, {
          headers: { Authorization: `Bearer ${rawToken}` },
        });
        userinfo = `HTTP ${ui.status} ${(await ui.text()).slice(0, 200)}`;
      }

      // The raw token payload, minus the secret parts: `id` points at the identity of the
      // user the connected app runs as, which is exactly what "is the Run As user right?"
      // comes down to.
      const loginUrl2 = process.env.SF_LOGIN_URL || "https://login.salesforce.com";
      const tr = await fetch(`${loginUrl2}/services/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: process.env.SF_CLIENT_ID || "",
          client_secret: process.env.SF_CLIENT_SECRET || "",
        }).toString(),
      });
      const tj: any = await tr.json().catch(() => ({}));
      tokenResponseKeys = Object.keys(tj);
      if (tj?.id) {
        const idr = await fetch(tj.id, { headers: { Authorization: `Bearer ${tj.access_token}` } });
        const body = await idr.text();
        identityUrl = `HTTP ${idr.status} ${body.slice(0, 260)}`;
      } else {
        identityUrl = `no id in token response: ${JSON.stringify(tj).slice(0, 200)}`;
      }

      return NextResponse.json({
        jsforceVersion: (conn as any).version ?? null,
        session: {
          hasToken: Boolean(rawToken),
          tokenLength: rawToken ? rawToken.length : 0,
          instanceUrl: rawInstance ?? null,
          clientIdSet: Boolean(process.env.SF_CLIENT_ID),
          clientIdTail: (process.env.SF_CLIENT_ID || "").slice(-6),
          loginUrl: process.env.SF_LOGIN_URL || null,
        },
        rawLimits,
        userinfo,
        identityUrl,
        tokenResponseKeys,
        probes,
      });
    }

    // FieldDefinition rather than describe(): this org's integration user can run SOQL and
    // create records, but describe() comes back "Session expired or invalid" — Salesforce's
    // confusing way of reporting that the user cannot read object metadata. FieldDefinition
    // is an ordinary queryable entity, so it answers the same question over a path the
    // user is actually allowed to take.
    let meta: { fields: any[] };
    let source: string;
    try {
      const result: any = await conn.query(
        "SELECT QualifiedApiName, Label, DataType FROM FieldDefinition " +
          "WHERE EntityDefinition.QualifiedApiName = 'Case'"
      );
      source = "FieldDefinition";
      meta = {
        fields: (result?.records || []).map((r: any) => ({
          name: r.QualifiedApiName,
          label: r.Label,
          // FieldDefinition reports a display type ("Checkbox"), not describe()'s "boolean".
          type: /checkbox/i.test(r.DataType || "") ? "boolean" : String(r.DataType || ""),
          updateable: true,
        })),
      };
    } catch {
      // Last resort: read one real Case with FIELDS(ALL). This needs only record-read
      // permission, which this integration user demonstrably has, so it works where both
      // describe() and FieldDefinition are refused. It yields API names and value types
      // but no labels — enough to build the mapping, which is what we are after.
      source = "FIELDS(ALL) on a sample Case";
      const sample: any = await conn.query("SELECT FIELDS(ALL) FROM Case ORDER BY CreatedDate DESC LIMIT 1");
      const rec = sample?.records?.[0] || {};
      meta = {
        fields: Object.keys(rec)
          .filter((k) => k !== "attributes")
          .map((k) => ({
            name: k,
            label: k,
            // Booleans are the only fields that are never null, so a null here on a
            // checkbox is impossible — anything null is some other type we do not need.
            type: typeof rec[k] === "boolean" ? "boolean" : typeof rec[k],
            updateable: true,
          })),
      };
    }

    const fields: any[] = meta?.fields || [];
    const checkboxes = fields
      .filter((f) => f.type === "boolean")
      .map((f) => ({
        name: f.name as string,
        label: f.label as string,
        updateable: f.updateable as boolean,
      }));

    const docFields = checkboxes.filter((f) => /^Dok/i.test(f.name));

    // What the funnel currently writes, and whether the org still has it.
    const mapped = new Set(
      Object.values(DOCUMENT_CATALOG)
        .map((e: any) => e.salesforceField)
        .filter(Boolean) as string[]
    );
    const orgNames = new Set(checkboxes.map((f) => f.name));

    return NextResponse.json({
      warmup,
      source,
      caseDocCheckboxes: docFields,
      counts: {
        allBooleanFields: checkboxes.length,
        docPrefixedFields: docFields.length,
        mappedByFunnel: mapped.size,
      },
      // The two ways the mapping can be wrong.
      mappedButMissingInOrg: [...mapped].filter((n) => !orgNames.has(n)),
      inOrgButUnmapped: docFields.map((f) => f.name).filter((n) => !mapped.has(n)),
      ...(includeAllCheckboxes ? { allBooleanFields: checkboxes } : {}),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "describe failed",
        details: err?.data?.message || err?.message || String(err),
        errorCode: err?.errorCode || err?.data?.errorCode || null,
      },
      { status: 500 }
    );
  }
}
