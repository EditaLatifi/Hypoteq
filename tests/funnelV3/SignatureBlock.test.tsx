/**
 * The Auskunftsermächtigung block of the closing (Handover 6): the model of its states and the
 * block rendered from the funnel store (server render, like Step6Finish.test.tsx).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import type { SignatureState } from "@/lib/funnel-v3/types";
import { gerberFiles, gerberState } from "./gerberCase";

let pathname = "/de/funnel";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

// A server render only sees a store's state: a plain hook over a mutable Gerber state.
const mockState: { current: any } = { current: null };
jest.mock("@/lib/funnel-v3/store", () => {
  const hook: any = (sel: (x: any) => unknown) => sel(mockState.current);
  hook.getState = () => mockState.current;
  return { useFunnelV3: hook, newId: () => "id" };
});

import SignatureBlock from "@/components/funnel-v3/finish/SignatureBlock";
import { signatureModel } from "@/components/funnel-v3/finish/signatureModel";
import { signatureView } from "@/lib/funnel-v3/signature";
import { authorizationDataFromState } from "@/lib/funnel-v3/authorizationData";
import { optionLabel, translate } from "@/lib/funnel-v3/i18n";

const LATER: SignatureState = { choice: "later", at: "2026-10-15T14:30:00.000Z", method: "upload" };
const withoutSig = () => gerberFiles().filter((f) => f.analysis?.docTypeId !== "vollmacht");
const sigFile = (a: Partial<V3Analysis> | null, over: Partial<FileEntry> = {}): FileEntry => ({
  id: "sig-1",
  name: "Scan_0042.jpg",
  size: 1000,
  uploadState: "uploaded",
  documentId: "doc-sig",
  analysisState: a ? "done" : "analysing",
  ...(a ? { analysis: { status: "done", docTypeId: "vollmacht", docTypeLabel: "vollmacht", confidence: 0.9, requirementId: "vollmacht", fields: {}, ...a } as V3Analysis } : {}),
  instanceId: "vollmacht",
  assignedByUser: true,
  ...over,
});

function setState(files: FileEntry[], sig: SignatureState | null = null, over: Record<string, unknown> = {}) {
  mockState.current = { ...gerberState({ sig, info: { geb: "1988-01-04", adresse: "Etzelstrasse 52, 8820 Wädenswil" } }), files, skipped: [], dismissed: [], setSignature: () => {}, ...over };
}
const render = () => renderToStaticMarkup(createElement(SignatureBlock));

beforeEach(() => {
  pathname = "/de/funnel";
});

describe("SignatureBlock (server render)", () => {
  it("nothing yet: the three steps side by side with the prefill and «Später nachreichen»", () => {
    setState(withoutSig());
    const html = render();
    expect(html).toContain('data-status="missing"');
    expect(html).toContain("HYPOTEQ Auskunftsermächtigung · Pflicht");
    expect(html).toContain("Noch nicht hochgeladen");
    expect(html).toContain("1 · Vorlage");
    expect(html).toContain(">Herunterladen</button>");
    expect(html).toContain("Von Gary Gerber – bei mehreren Kreditnehmern von allen.");
    expect(html).toContain(">Unterzeichnet hochladen</button>");
    expect(html).toContain('type="file"');
    // Prefill: Vollmachtgeber, Geburtsdatum, Adresse (Ablösung of the home), Objekt, Zweck.
    expect(html).toContain("<dt");
    expect(html).toContain(">04.01.1988<");
    expect(html).toContain(">Etzelstrasse 52, 8820 Wädenswil<");
    expect(html).toContain(">Ablösung<");
    expect(html).toContain("Kunde unterschreibt später?");
    expect(html).toContain(">Später nachreichen</button>");
  });

  it("a signed copy in the folder: «erhalten», no steps", () => {
    setState(gerberFiles());
    const html = render();
    expect(html).toContain('data-status="received"');
    expect(html).toContain("Unterzeichnete Auskunftsermächtigung erhalten");
    expect(html).toContain("01_Auskunftsermaechtigung_Gary_Gerber_unterzeichnet.pdf · Unterschrift vorhanden");
    expect(html).not.toContain("1 · Vorlage");
    expect(html).not.toContain("Später nachreichen");
  });

  it("«später nachreichen»: Wird nachgereicht, Unterschrift ausstehend, the mail and the reminders explained", () => {
    setState(withoutSig(), LATER);
    const html = render();
    expect(html).toContain('data-status="later"');
    expect(html).toContain("Wird nachgereicht");
    expect(html).toContain("Ohne Unterschrift geht keine Anfrage an die Bank.");
    expect(html).toContain("Die vorausgefüllte Vorlage liegt der Bestätigungsmail bei. Erinnerungen folgen nach 2 und 5 Tagen.");
    expect(html).toContain("Unterschrift ausstehend · Erinnerung nach 2 und 5 Tagen");
    expect(html).toContain(">Doch nicht nachreichen</button>");
  });

  it("an unsigned copy uploaded with the button: «Unterschrift fehlt», the file with «Entfernen»", () => {
    setState([...withoutSig(), sigFile({ fields: { Unterschrift: { value: "fehlt", confidence: 0.9 } } })]);
    const html = render();
    expect(html).toContain('data-status="unsigned"');
    expect(html).toContain("Unterschrift fehlt");
    expect(html).toContain("Auf der hochgeladenen Auskunftsermächtigung fehlt die Unterschrift.");
    expect(html).toContain("Scan_0042.jpg");
    expect(html).toContain(">Entfernen</button>");
    expect(html).toContain(">Andere Datei hochladen</button>");
  });

  it("HYPOTEQ 19.10. E.4: under «Unterschrift fehlt» «Trotzdem einreichen – HYPOTEQ prüft manuell»; chosen, the block is free and says so", () => {
    const unsigned = [...withoutSig(), sigFile({ fields: { Unterschrift: { value: "fehlt", confidence: 0.9 } } })];
    setState(unsigned, { choice: "uploaded", at: "2026-10-19T09:00:00.000Z", method: "upload" });
    expect(render()).toContain(">Trotzdem einreichen – HYPOTEQ prüft manuell</button>");
    setState(unsigned, { choice: "uploaded", at: "2026-10-19T09:00:00.000Z", method: "upload", override: true, overrideAt: "2026-10-19T09:05:00.000Z" });
    const html = render();
    expect(html).toContain('data-status="received"');
    expect(html).toContain("Wird von HYPOTEQ manuell geprüft");
    expect(html).toContain(">Manuelle Prüfung<");
    expect(html).toContain(">Doch nicht so einreichen</button>");
    expect(html).not.toContain(">Trotzdem einreichen – HYPOTEQ prüft manuell</button>");
  });

  it("in the funnel language", () => {
    pathname = "/fr/funnel";
    setState(withoutSig());
    const html = render();
    expect(html).toContain("Autorisation de renseignements HYPOTEQ · obligatoire");
    expect(html).toContain(">Remettre plus tard</button>");
    expect(html).toContain(">Refinancement<");
  });
});

describe("signatureModel", () => {
  const t = (k: string, p?: Record<string, string | number>) => translate("de", k, p);
  const opt = (g: string, v: string | null | undefined) => optionLabel("de", g, v);
  const SIGNER = { kind: "borrower" as const, first: "Gary", last: "Gerber", display: "Gary Gerber" };
  const model = (files: FileEntry[], sig: SignatureState | null = null, extra: { jp?: boolean; later?: boolean | null } = {}) => {
    const st = gerberState({ sig });
    const view = signatureView(
      files.map((f) => ({ fileId: f.id, instanceId: f.instanceId ?? null, analysis: f.analysis ?? null, assignedByUser: f.assignedByUser, failed: f.uploadState === "failed", pending: f.uploadState === "uploading" || f.analysisState === "analysing" })),
      sig,
      SIGNER
    );
    return signatureModel({ view, files, later: extra.later === undefined ? sig?.choice === "later" : extra.later, data: authorizationDataFromState(st, "de"), jp: Boolean(extra.jp) }, t, opt);
  };

  it("analysing: «Wird geprüft …» without the steps", () => {
    const m = model([sigFile(null)]);
    expect(m).toMatchObject({ status: "analysing", tone: "busy", title: "Wird geprüft …", showSteps: false });
    expect(m.files).toEqual([{ id: "sig-1", name: "Scan_0042.jpg", state: "busy" }]);
  });

  it("the wrong form and the wrong name each say so", () => {
    expect(model([sigFile({ docTypeId: "lohnausweise" })]).lines).toEqual(["Die hochgeladene Datei ist keine HYPOTEQ Auskunftsermächtigung."]);
    expect(model([sigFile({ fields: { Vollmachtgeber: { value: "Hans Muster", confidence: 0.9 } } })]).lines).toEqual([
      "Der Name auf der Auskunftsermächtigung passt nicht zum Kreditnehmer.",
    ]);
  });

  it("a failed upload: the steps stay open, the file can be retried", () => {
    const m = model([sigFile(null, { uploadState: "failed", analysisState: "pending" })]);
    expect(m.status).toBe("missing");
    expect(m.lines).toContain("Hochladen fehlgeschlagen.");
    expect(m.files[0].state).toBe("failed");
    expect(m.canFinish).toBe(false);
  });

  it("an unsigned copy with «später»: may close, shown as pending", () => {
    const m = model([sigFile({ fields: { Unterschrift: { value: "fehlt", confidence: 0.9 } } })], LATER);
    expect(m).toMatchObject({ status: "unsigned", canFinish: true, pendingTag: "Unterschrift ausstehend · Erinnerung nach 2 und 5 Tagen" });
  });

  it("a juristische Person: signed by the signatory; no «später» where it is not offered", () => {
    const st = gerberState({ ans: { ...gerberState().ans, kn: "Juristische Person" }, txt: { ...gerberState().txt, firma: "Muster AG", zeichner: "Hans Muster" } });
    const view = signatureView([], null, undefined);
    const m = signatureModel({ view, files: [], later: null, data: authorizationDataFromState(st, "de"), jp: true }, t, opt);
    expect(m.signerLine).toBe("Von Hans Muster – zeichnungsberechtigt für die Firma.");
    expect(m.preview.map((p) => p.label)).toEqual(["Vollmachtgeber", "Firma", "Objekt", "Zweck"]);
    expect(m.later).toBeNull();
  });
});
