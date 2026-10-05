/**
 * Read-only check of the Salesforce org against the fields the funnel writes.
 *
 *   node scripts/salesforce-field-check.js
 *
 * Logs in with the client-credentials flow from .env.local (SF_CLIENT_ID, SF_CLIENT_SECRET,
 * SF_LOGIN_URL), calls describe() on Case, Account and Contact and prints, per field the sync
 * uses: exists? createable? updateable? type, picklist values. Nothing is written.
 *
 * Use it to confirm (DECISIONS S7) that the integration user may write Account.Salutation, that
 * every Dok_* / v3 field exists, and to see which Contact / Account fields can carry the
 * «aktiver VP-Berater» criterion for SF_PARTNER_CONTACT_FILTER (D13).
 */
const fs = require("fs");
const path = require("path");
const { Connection } = require("jsforce");

const root = path.join(__dirname, "..");
const env = { ...process.env };
for (const file of [".env.local", ".env"]) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

/** Every custom field name the sync, the mapping tables and the v3 closing mention. */
function funnelFieldNames() {
  const files = [
    "components/syncFunnelStepsToSalesforce.ts",
    "components/funnelToSalesforceMap.ts",
    "components/salesforceFieldConfig.ts",
    "components/updateCaseCompleteness.ts",
    "lib/funnel-v3/completion.ts",
    "lib/funnel-v3/requirements.ts",
    "lib/funnel-v3/requirementStatus.ts",
  ];
  const names = new Set();
  for (const f of files) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, "utf8").matchAll(/\b([A-Za-z0-9_]+__c)\b/g)) names.add(m[1]);
  }
  return [...names].sort();
}

const STANDARD = {
  Case: ["Reason", "Status", "Origin", "OwnerId", "AccountId", "Comments", "SuppliedName", "SuppliedEmail", "SuppliedPhone", "SuppliedCompany"],
  Account: ["Salutation", "FirstName", "LastName", "PersonEmail", "Phone", "PersonMailingStreet", "PersonMobilePhone", "PersonBirthdate", "RecordTypeId", "Type", "IsPersonAccount"],
  Contact: ["Email", "AccountId", "FirstName", "LastName", "Name", "IsPersonAccount"],
};

(async () => {
  const url = env.SF_LOGIN_URL || "https://login.salesforce.com";
  const res = await fetch(`${url}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.SF_CLIENT_ID || "", client_secret: env.SF_CLIENT_SECRET || "" }).toString(),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { access_token, instance_url } = await res.json();
  const conn = new Connection({ instanceUrl: instance_url, accessToken: access_token });

  const custom = funnelFieldNames();
  const seen = new Set();
  for (const obj of ["Case", "Account", "Contact"]) {
    const d = await conn.sobject(obj).describe();
    const byName = new Map(d.fields.map((f) => [f.name, f]));
    console.log(`\n== ${obj} (${d.fields.length} fields) ==`);
    for (const name of [...STANDARD[obj], ...custom]) {
      const f = byName.get(name);
      if (!f) {
        if (STANDARD[obj].includes(name)) console.log(`  MISSING   ${name}`);
        continue;
      }
      seen.add(name);
      const flags = `${f.createable ? "create" : "-     "} ${f.updateable ? "update" : "-     "}`;
      const values = f.picklistValues && f.picklistValues.length ? `  [${f.picklistValues.filter((v) => v.active).map((v) => v.value).join(" | ")}]` : "";
      console.log(`  ${flags}  ${name.padEnd(44)} ${f.type}${f.length ? `(${f.length})` : ""}${values}`);
    }
    if (obj === "Contact") {
      console.log("\n  Contact custom fields (candidates for SF_PARTNER_CONTACT_FILTER):");
      for (const f of d.fields.filter((x) => x.custom)) {
        const values = f.picklistValues && f.picklistValues.length ? `  [${f.picklistValues.filter((v) => v.active).map((v) => v.value).join(" | ")}]` : "";
        console.log(`    ${f.name.padEnd(44)} ${f.type}${values}`);
      }
      console.log(`  Contact record types: ${(d.recordTypeInfos || []).map((r) => r.name + (r.active ? "" : " (inactive)")).join(", ")}`);
    }
    if (obj === "Account") {
      console.log(`  Account record types: ${(d.recordTypeInfos || []).map((r) => r.name + (r.active ? "" : " (inactive)")).join(", ")}`);
    }
  }
  const unknown = custom.filter((n) => !seen.has(n));
  console.log(`\nCustom field names in the code that exist on none of the three objects (${unknown.length}):`);
  for (const n of unknown) console.log(`  ${n}`);
  console.log("\nLegend: create/update = the integration user may write the field. '-' = it may not (writeWithFieldFallback drops it, see S10).");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
