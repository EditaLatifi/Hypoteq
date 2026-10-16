"use client";

import { useFunnelState, useScreenErrors } from "../hooks";
import { visibleFields } from "../logic";
import PartnerBlock from "../PartnerBlock";
import { ContactFields } from "./ScreenAnfrage";

/**
 * «Kontakt» — step 1 of the Schnellanmeldung (Handover 3): the Berater e-mail with partner
 * recognition, the customer's e-mail and phone. Name, Anrede and birth date come from the ID.
 */
export default function ScreenKontakt() {
  const state = useFunnelState();
  const errors = useScreenErrors("kontakt");
  const show = new Set(visibleFields("kontakt", state));
  return (
    <>
      {show.has("bmail") ? <PartnerBlock errors={errors} /> : null}
      <ContactFields errors={errors} />
    </>
  );
}
