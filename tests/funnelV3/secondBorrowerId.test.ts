/**
 * HYPOTEQ Komplett-Test 06.11.2026, B «Weitere» (DECISIONS V113): «Die ID der zweiten Person wird
 * als überzählig eingestuft». A document left over on one Kreditnehmer's row goes to the other
 * Kreditnehmer's empty row when it prints another person and that person's given name — never a
 * second copy of the same person's document, never a stranger.
 */
import { describe, it, expect } from "@jest/globals";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { placeAll } from "@/lib/funnel-v3/placeFile";
import type { Borrower } from "@/lib/funnel-v3/types";
import { MAX, mkState } from "./helpers";

const NOW = new Date("2026-11-06T10:00:00Z");
let n = 0;

const id = (personName: string, extra: Partial<V3Analysis> = {}): FileEntry => {
  const analysis: V3Analysis = {
    status: "done",
    docTypeId: "id",
    docTypeLabel: "ID",
    confidence: 0.95,
    requirementId: "id",
    personName,
    fields: {},
    contentHash: `hash-${++n}`,
    ...extra,
  };
  return { id: `f${++n}`, name: "id.pdf", size: 1, uploadState: "uploaded", analysisState: "done", analysis };
};

const second = (vor: string, nach: string): Borrower => ({ id: "b2", vor, nach, job: "Angestellt", pkSe: "Nein" });
const where = (state: ReturnType<typeof mkState>, files: FileEntry[]) => {
  const map = placeAll(files, state, { now: NOW });
  return files.map((f) => map.get(f.id)?.instanceId ?? `${map.get(f.id)?.extraKind}:${map.get(f.id)?.reason}`);
};

describe("the second Kreditnehmer's ID", () => {
  it("names told apart by the given name: each on its own row (as before)", () => {
    const s = mkState({}, {}, {}, [MAX, second("Anna", "Mustermann")]);
    expect(where(s, [id("Mustermann Max"), id("Mustermann Anna")])).toEqual(["id#b1", "id#b2"]);
  });

  it("its family name only fits Kreditnehmer 1 (typed differently in the funnel): it goes to the empty row, not «überzählig»", () => {
    const s = mkState({}, {}, {}, [MAX, second("Anna", "Muster")]);
    expect(where(s, [id("Mustermann Max"), id("Mustermann Anna")])).toEqual(["id#b1", "id#b2"]);
    expect(where(s, [id("Mustermann Anna"), id("Mustermann Max")])).toEqual(["id#b2", "id#b1"]);
  });

  it("a second copy of Kreditnehmer 1's ID stays «überzählig»", () => {
    const s = mkState({}, {}, {}, [MAX, second("Anna", "Muster")]);
    expect(where(s, [id("Mustermann Max"), id("MUSTERMANN MAX")])).toEqual(["id#b1", "surplus:full"]);
  });

  it("someone with neither given name is not put on the empty row", () => {
    const s = mkState({}, {}, {}, [MAX, second("Lea", "Mustermann")]);
    expect(where(s, [id("Mustermann Max"), id("Mustermann Tim")])).toEqual(["id#b1", "unknown:person"]);
  });
});
