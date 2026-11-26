"use client";
import { useEffect, useRef } from "react";
import { HONEYPOT_FIELD } from "@/lib/form-spam";

/**
 * The two signals lib/form-spam.ts checks on the server: a field people never see (off-screen,
 * out of the tab order) and how long the form was open before it was sent.
 */
export function useFormSpamTrap() {
  const openedAt = useRef(0);
  const trapRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const trapField = (
    <div
      aria-hidden="true"
      style={{ position: "absolute", left: "-10000px", top: 0, width: 1, height: 1, overflow: "hidden" }}
    >
      <label>
        Bitte leer lassen
        <input ref={trapRef} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );

  const trapValues = () => ({
    [HONEYPOT_FIELD]: trapRef.current?.value ?? "",
    elapsedMs: openedAt.current ? Date.now() - openedAt.current : undefined,
  });

  return { trapField, trapValues };
}
