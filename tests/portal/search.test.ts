import { describe, it, expect } from "@jest/globals";
import { HEADER_SEARCH_MAX, matchRank, searchCases } from "@/lib/portal/search";

/** «Antragsteller suchen – Vor- oder Nachname» (handoff «Partnerportal (Shell)»). */

const CASES = [
  { id: "c1", kunde: "Sarah & Marco Brunner", nr: "HQ-26-09-150412" },
  { id: "c2", kunde: "Andrea Keller", nr: "HQ-26-09-150398" },
  { id: "c3", kunde: "Thomas Huber", nr: "HQ-26-09-150405" },
  { id: "c4", kunde: "Familie Steiner", nr: "HQ-26-09-150387" },
  { id: "c5", kunde: "Lukas Müller-Frei", nr: "HQ-26-09-150419" },
  { id: "c6", kunde: "Nadia Roth", nr: "HQ-26-08-150371" },
  { id: "c7", kunde: "Peter Gasser", nr: "HQ-26-07-150342" },
  { id: "c8", kunde: "Claudia Weber", nr: "HQ-26-08-150355" },
];

describe("matchRank", () => {
  it("a word start of the first or the last name ranks first", () => {
    expect(matchRank(CASES[0], "mar")).toBe(0);
    expect(matchRank(CASES[0], "Brun")).toBe(0);
    expect(matchRank(CASES[1], "and")).toBe(0);
    // Both parts of a double name count as a last name.
    expect(matchRank(CASES[4], "frei")).toBe(0);
  });
  it("any other part of the name ranks second", () => {
    expect(matchRank(CASES[0], "unne")).toBe(1);
    expect(matchRank(CASES[2], "uber")).toBe(1);
  });
  it("the case number ranks third, with or without its separators", () => {
    expect(matchRank(CASES[3], "150387")).toBe(2);
    expect(matchRank(CASES[3], "hq-26-09-150387")).toBe(2);
    expect(matchRank(CASES[3], "HQ 26 09 150387")).toBe(2);
  });
  it("ignores case and accents", () => {
    expect(matchRank(CASES[4], "MULLER")).toBe(0);
    expect(matchRank(CASES[4], "müll")).toBe(0);
  });
  it("finds nothing for an empty query or a miss", () => {
    expect(matchRank(CASES[0], "")).toBeNull();
    expect(matchRank(CASES[0], "   ")).toBeNull();
    expect(matchRank(CASES[0], "keller")).toBeNull();
  });
});

describe("searchCases", () => {
  it("lists word starts before other matches, otherwise in the given order", () => {
    expect(searchCases(CASES, "ro").map((c) => c.id)).toEqual(["c6"]);
    // Andrea starts with «a»; everyone else only contains it and keeps the list order.
    expect(searchCases(CASES, "a").map((c) => c.id)).toEqual(["c2", "c1", "c3", "c4", "c5", "c6", "c7", "c8"]);
    // Part of a case number finds that Case.
    expect(searchCases(CASES, "0412").map((c) => c.id)).toEqual(["c1"]);
  });
  it("the header shows at most six", () => {
    expect(HEADER_SEARCH_MAX).toBe(6);
    expect(searchCases(CASES, "15", HEADER_SEARCH_MAX)).toHaveLength(6);
    expect(searchCases(CASES, "15")).toHaveLength(8);
  });
  it("Enter opens the first hit: the best one", () => {
    expect(searchCases(CASES, "web", 6)[0].id).toBe("c8");
  });
});
