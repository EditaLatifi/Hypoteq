import { describe, it, expect, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { mustermannFiles, mustermannState } from "./mustermannCase";

/**
 * HYPOTEQ's feedback of 21.10.2026 on the Schnellanmeldung: «Fehlende Unterlagen & Abschluss»
 * shows the whole list — what is there with its file, what is still open — with the same rows
 * and labels as step 2, and a stored file can be replaced on its row (DECISIONS V82–V84).
 */

jest.mock("@/components/funnel-v3/documents/documents.css", () => ({}));
jest.mock("next/navigation", () => ({ usePathname: () => "/de/funnel" }));

// A server render only sees a zustand store's initial state: a plain hook over Mustermann in
// the Schnellanmeldung, without his Privatkredit and his Steuererklärung (two open rows).
jest.mock("@/lib/funnel-v3/store", () => {
  const { mustermannFiles: files, mustermannState: state } = jest.requireActual("./mustermannCase") as typeof import("./mustermannCase");
  const current = () => ({
    ...state({ mode: "schnell" }),
    submissionId: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
    step: 6,
    visited: 6,
    files: files().filter((f: any) => !["kredit", "steuer#b1"].includes(f.instanceId)),
  });
  const hook: any = (sel: (x: any) => unknown) => sel(current());
  hook.getState = current;
  return { useFunnelV3: hook };
});

import DocumentsPanel, { type DocumentsVariant } from "@/components/funnel-v3/documents/DocumentsPanel";
import RequirementRow from "@/components/funnel-v3/documents/RequirementRow";
import { reqList } from "@/lib/funnel-v3/requirements";

const render = (variant: DocumentsVariant) => renderToStaticMarkup(createElement(DocumentsPanel, { variant }));
const rowTitles = (html: string) => Array.from(html.matchAll(/class="v3-docrow-title">([^<]+)</g), (m) => m[1]);

/** «Zum Objekt | Alles vollständig. | 7 / 7»: the text of each section head on the last step. */
const heads = (html: string) =>
  Array.from(html.matchAll(/<button type="button" class="v3-docgroup-toggle" aria-expanded="(true|false)"[^>]*>(.*?)<\/button>/g), (m) => ({
    open: m[1] === "true",
    text: m[2].replace(/<[^>]+>/g, "|").split("|").map((x) => x.trim()).filter((x) => x && x !== "▾").join(" | "),
  }));

describe("«Fehlende Unterlagen & Abschluss» of the Schnellanmeldung (V82; Spezifikation Datenabgleich 2.1–2.3)", () => {
  it("step 2 lists what is there with a check and its file, and what is open as «Fehlt»", () => {
    expect(mustermannState({ mode: "schnell" }).mode).toBe("schnell");
    const html = render("upload");
    // there: a green check, the file name under the label
    expect(html).toMatch(/class="v3-docrow is-ok">.*?Aktuelle Gebäudeversicherungspolice \(inkl\. Kubatur\).*?03_Gebaeudeversicherung_GVZ_Liegenschaft_2026\.pdf/);
    expect((html.match(/class="v3-docrow is-ok"/g) || []).length).toBeGreaterThan(10);
    // open: «Fehlt», with the row's upload as before
    expect(html).toMatch(/class="v3-docrow is-missing">.*?Kreditverträge \(Privatkredite\).*?>Fehlt</);
    expect(html).toMatch(/class="v3-docrow is-missing">.*?Aktuelle Steuererklärung/);
    // the files off the list are there too, «nicht benötigt» without a heading of its own (2.3)
    expect(html).toContain("01_Anstellungsvertrag_MusterTreuhand.pdf");
    expect(html).toContain(">Nicht benötigt</span>");
    expect(html).not.toContain("v3-extra-group");
  });

  it("the last step: the answers under the completeness card, then the sections closed with their state", () => {
    const html = render("missing");
    expect(html).toContain("Fehlende Unterlagen hier ablegen");
    expect(html).not.toContain("Alle Unterlagen sind vollständig.");
    // 2.1 «Deine Angaben aus dem Fragepfad», between the completeness card and the sections
    const summary = html.indexOf("Deine Angaben aus dem Fragepfad");
    expect(summary).toBeGreaterThan(html.indexOf('class="v3-status"'));
    expect(summary).toBeLessThan(html.indexOf('class="v3-docgroup-toggle"'));
    expect((html.match(/>Bearbeiten<\/button>/g) || []).length).toBe(5);
    expect(html).toContain('class="v3-answer-value">Max Mustermann<');
    // 2.2: closed; title, the open documents, the badges, «done / total»
    expect(heads(html)).toEqual([
      { open: false, text: "Zum Objekt | Alles vollständig. | 7 / 7" },
      { open: false, text: "Bestehende Hypothek | Alles vollständig. | 2 / 2" },
      { open: false, text: "Zur Person · Max Mustermann | Aktuelle Steuererklärung, Kreditverträge (Privatkredite) | 2 fehlend | 6 / 8" },
      { open: false, text: "Eigenmittel &amp; Vorsorge | Alles vollständig. | 2 / 2" },
      { open: false, text: "Weitere Dateien | Überzählig · Duplikat · Nicht benötigt | 9" },
    ]);
    expect(rowTitles(html)).toEqual([]);
  });

  it("shows the same rows with the same labels as the requirement list (V84)", () => {
    const step2 = rowTitles(render("upload"));
    expect(step2.length).toBeGreaterThan(15);
    const labels = reqList(mustermannState({ mode: "schnell" })).map((i) => i.labelDe);
    for (const title of step2.slice(0, 20)) expect(labels).toContain(title);
    // the closed heads of the last step name the open rows the same way
    const person = heads(render("guided")).find((h) => h.text.startsWith("Zur Person"))!;
    expect(person.text).toContain("Aktuelle Steuererklärung, Kreditverträge (Privatkredite)");
  });
});

describe("«Ersetzen» on a stored file (V83)", () => {
  const file = mustermannFiles().find((f) => f.instanceId === "gvz")!;
  const instance = reqList(mustermannState()).find((i) => i.instanceId === "gvz")!;
  const row = (onReplace?: (id: string) => void) =>
    renderToStaticMarkup(
      createElement(RequirementRow, {
        status: { instance, state: "ok", doneFiles: 1, expect: 1, failedFiles: 0, overridden: false, outdatedFile: false, fileIds: [file.id] },
        files: [file],
        open: true,
        onToggle: () => {},
        onPick: () => {},
        onView: () => {},
        onReplace,
        intern: false,
        canRename: false,
        borrowerCount: 1,
      })
    );

  it("stands beside «Dokument ansehen» and «Entfernen» where the funnel offers it", () => {
    expect(row(() => {})).toMatch(/>Dokument ansehen<\/button><button[^>]*>Ersetzen<\/button><button[^>]*>Entfernen<\/button>/);
    // the Nachreich page passes no onReplace
    expect(row()).not.toContain(">Ersetzen<");
  });
});
