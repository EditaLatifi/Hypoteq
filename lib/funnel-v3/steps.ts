/**
 * The screens of the two entries (Handover 1–3). Pure — the store navigates with it, the UI
 * asks it which screen step n is, how much time is left and where a mode switch lands.
 *
 *   Begleitet (Handover 2):  1 Anfrage · 2 Objekt & Finanzierung · 3 Personen · 4 Unterlagen & Abschluss
 *   Schnell   (Handover 3):  1 Kontakt · 2 Unterlagen · 3 Anfrage · 4 Objekt & Finanzierung ·
 *                            5 Personen · 6 Fehlende Unterlagen & Abschluss
 *
 * The Schnellanmeldung is the guided one with the upload in front: screens 3–6 are the same
 * screens, prefilled. Step 0 is the start screen in both.
 */

import type { Mode, Role } from "./types";

export type Screen = "kontakt" | "upload" | "anfrage" | "objekt" | "personen" | "abschluss";

export const SCREENS: Record<Mode, readonly Screen[]> = {
  begleitet: ["anfrage", "objekt", "personen", "abschluss"],
  schnell: ["kontakt", "upload", "anfrage", "objekt", "personen", "abschluss"],
};

/** «noch ca. … Min.» per step (Handover 2: 3:00 → 1:30, Handover 3: 3:00 → 0:30). */
export const STEP_TIMES: Record<Mode, readonly string[]> = {
  begleitet: ["3:00", "2:30", "2:00", "1:30"],
  schnell: ["3:00", "2:30", "2:00", "1:30", "1:00", "0:30"],
};

export function stepCount(mode: Mode): number {
  return SCREENS[mode].length;
}

/** The screen step n shows in this mode; null for the start screen (0) and out of range. */
export function screenAt(mode: Mode, step: number): Screen | null {
  return step >= 1 ? SCREENS[mode][step - 1] ?? null : null;
}

/** The step of a screen in this mode; 0 when the mode has no such screen (kontakt, upload in Begleitet). */
export function stepOf(mode: Mode, screen: Screen): number {
  return SCREENS[mode].indexOf(screen) + 1;
}

/** «3:00» … — the start screen shows the full time. */
export function timeLeft(mode: Mode, step: number): string {
  const times = STEP_TIMES[mode];
  return times[Math.min(Math.max(step, 1), times.length) - 1];
}

/** Handover 1 «Vorauswahl»: Berater → Schnellanmeldung, Kunde → Begleitete Anmeldung. */
export function recommendedMode(role: Role | null): Mode {
  return role === "kunde" ? "begleitet" : "schnell";
}

/**
 * Where «Lieber Schritt für Schritt» / «Zur Schnellanmeldung» lands (Handover 1, 3: «man landet
 * im gleichen Thema»; prototype switchMode):
 *  - Schnell → Begleitet: the same screen; Kontakt and Unterlagen, which Begleitet has not
 *    (its upload is in the closing), land on Anfrage.
 *  - Begleitet → Schnell: the same screen once files were uploaded; without files the
 *    Schnellanmeldung starts at Kontakt, since its point is the upload in front.
 * The start screen stays the start screen. All data is kept — only the order changes.
 */
export function switchTarget(from: Mode, step: number, hasFiles: boolean): { mode: Mode; step: number } {
  const screen = screenAt(from, step);
  if (from === "schnell") {
    const to: Mode = "begleitet";
    return { mode: to, step: screen ? Math.max(1, stepOf(to, screen)) : 0 };
  }
  const to: Mode = "schnell";
  if (!screen) return { mode: to, step: 0 };
  return { mode: to, step: hasFiles ? stepOf(to, screen) : 1 };
}

/**
 * The furthest step of the other mode that the user has effectively reached: the furthest
 * screen visited, mapped (screens the new mode has in front count as visited).
 */
export function mapVisited(from: Mode, visited: number, to: Mode): number {
  let best = 0;
  for (let n = 1; n <= Math.min(visited, stepCount(from)); n++) {
    const s = screenAt(from, n)!;
    best = Math.max(best, stepOf(to, s));
  }
  return best;
}

/** i18n key of a screen's name in the path and the step head. */
export function screenLabelKey(mode: Mode, screen: Screen): string {
  switch (screen) {
    case "kontakt":
      return "step.s1";
    case "upload":
      return "step.5";
    case "anfrage":
      return "step.anfrage";
    case "objekt":
      return "step.b2";
    case "personen":
      return "step.3";
    case "abschluss":
      return mode === "schnell" ? "step.missing" : "step.b4";
  }
}

/** i18n key of the «warum wir fragen» line under a screen (prototype WHY). */
export function screenWhyKey(mode: Mode, screen: Screen): string {
  return `step.why.${mode === "schnell" ? "fast" : "guided"}.${screen}`;
}

/** The screens where answers still change the document list: the rail «Deine Unterlagen» shows. */
export const RAIL_SCREENS: ReadonlySet<Screen> = new Set<Screen>(["anfrage", "objekt", "personen"]);
