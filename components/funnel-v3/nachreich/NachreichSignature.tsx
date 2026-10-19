"use client";

/**
 * The Auskunftsermächtigung on the Nachreich page (Handover 6 «Später nachreichen», 7.1 «Vorlage
 * + Upload-Link»; DECISIONS V37): its own, clearly labelled slot while the inquiry waits for the
 * signed copy, with the same three steps as the closing (SignaturePanel). The file goes through
 * the page's pipeline and is placed on P0 at once; «Unterlagen senden» posts it with the rest,
 * the server recognises it (signature.ts) and marks InquirySignature «received».
 *
 * The download is the blank form of the inquiry's language: the prefilled copy came with the
 * confirmation mail and the reminders, and the Nachreich link alone must not hand out the
 * customer's details (app/api/nachreichen/[token]).
 */

import { useCallback, useMemo } from "react";
import type { StoreApi } from "zustand";
import type { AuthorizationData } from "@/lib/funnel-v3/authorization";
import { authorizationFileName } from "@/lib/funnel-v3/authorizationData";
import type { FileEntry } from "@/lib/funnel-v3/files";
import type { Lang } from "@/lib/funnel-v3/i18n";
import type { MissingRequirement } from "@/lib/funnel-v3/nachreichView";
import type { SignatureView } from "@/lib/funnel-v3/signature";
import type { FunnelV3Store } from "@/lib/funnel-v3/store";
import { MAX_FILE_BYTES, removeFile, retryFile } from "@/lib/funnel-v3/upload";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import SignaturePanel from "../finish/SignaturePanel";
import { addSignatureCopy, downloadPdf } from "../finish/signatureActions";
import { signatureModel } from "../finish/signatureModel";

export interface NachreichSignatureProps {
  /** The page's store (the upload pipeline is bound to it). */
  store: Pick<StoreApi<FunnelV3Store>, "getState">;
  /** P0 as the server listed it. */
  missing: MissingRequirement;
  view: SignatureView;
  files: FileEntry[];
  /** The inquiry's language (the form's language). */
  lang: Lang;
  say: (lines: { text: string; big?: boolean }[]) => void;
}

export default function NachreichSignature({ store, missing, view, files, lang, say }: NachreichSignatureProps) {
  const { t, opt } = useFunnelT();
  const jp = missing.person?.kind === "company";
  const data = useMemo<AuthorizationData>(
    () => ({ lang, signers: !jp && missing.person ? [{ vor: missing.person.first, nach: missing.person.last }] : [] }),
    [jp, lang, missing.person]
  );
  const model = useMemo(() => signatureModel({ view, files, later: null, data, jp, context: "nachreich" }, t, opt), [view, files, data, jp, t, opt]);

  const onPick = useCallback(
    (file: File) => {
      const res = addSignatureCopy(store, file);
      if (res.ok) {
        say([{ text: "✓ " + t("sig.toastReceived"), big: true }, { text: t("sig.nr.ready") }]);
        return;
      }
      const text =
        res.reason === "size"
          ? t("docs.toast.size", { name: file.name, mb: Math.round(MAX_FILE_BYTES / (1024 * 1024)) })
          : res.reason === "empty"
            ? t("docs.toast.empty", { name: file.name })
            : t("docs.toast.type", { name: file.name });
      say([{ text, big: true }]);
    },
    [say, store, t]
  );

  // HYPOTEQ 19.10. E.4: the AI never blocks — here too the doubted copy can go to HYPOTEQ's
  // manual check; the page posts the choice (`signatureOverride`) and the reminders stop.
  const onToggleOverride = useCallback(() => {
    const s = store.getState();
    s.setSignatureOverride(!s.sig?.override);
  }, [store]);

  const blank: AuthorizationData = { lang, signers: [] };
  return (
    <SignaturePanel
      model={model}
      t={t}
      onDownload={() => downloadPdf(`/api/funnel/authorization?lang=${encodeURIComponent(lang)}`, undefined, authorizationFileName(blank))}
      onPick={onPick}
      onRemove={(id) => removeFile(id)}
      onRetry={(id) => void retryFile(id)}
      onToggleOverride={onToggleOverride}
    />
  );
}
