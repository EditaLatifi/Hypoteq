/**
 * Applying values a customer took from their own documents (spec section 16).
 *
 * This exists because of a bug that produced exactly the outcome section 16 is written to
 * prevent. The store's `setFinancing` replaces the whole financing object, and the funnel
 * page pushes its own copy of the form on the way out — a copy frozen back on step 5. So a
 * customer could press "Dokumentwert übernehmen", watch the figure change, and still have
 * the old one sent to Salesforce moments later. The audit row said the correction happened;
 * the value said otherwise.
 *
 * The rule the fix rests on is one line long, so it lives here where it can be stated and
 * tested rather than being re-derived at each of the three call sites that got it wrong.
 */

/**
 * Merge accepted document values over a funnel form.
 *
 * Corrections win. That is the whole point: they are made after the form was filled in, by
 * someone looking at the document the number came from.
 *
 * Empty and null corrections are dropped rather than applied. A blank is not a decision —
 * it is a field that was never answered — and writing one through would quietly erase a
 * figure the customer did enter.
 */
export function applyDocumentCorrections<T extends Record<string, any>>(
  form: T,
  corrections?: Record<string, string | null | undefined> | null
): T {
  if (!corrections) return form;

  const usable = Object.entries(corrections).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
  );
  if (usable.length === 0) return form;

  return { ...form, ...Object.fromEntries(usable) } as T;
}
