"use client";

/**
 * HYPOTEQ Auskunftsermächtigung in the closing (Handover 6; DECISIONS V11, V21, V31–V38), before
 * «Finanzierungsanfrage abschliessen». No props: it reads the funnel store.
 *
 *   1 Vorlage herunterladen   the PDF prefilled from the answers and the documents
 *                             (POST /api/funnel/authorization — nothing stored before the closing)
 *   2 Unterzeichnen           by every Kreditnehmer, at a juristische Person by the signatory
 *   3 Unterzeichnet hochladen its own button: the file goes through the upload pipeline and is
 *                             placed on P0 whatever its name; the AI then says «erhalten» or
 *                             «Unterschrift fehlt» (wrong form, no signature, other name)
 *
 * A signed copy recognised anywhere in the uploaded folder fulfils it as well (placement puts it
 * on P0). «Später nachreichen» sets the store's signature to «later»: «Unterschrift ausstehend»,
 * the template comes with the confirmation mail, reminders after 2 and 5 days, no request to a
 * bank without it. The closing step gates its button on `documentsSummary().signature.canFinish`
 * — the same SignatureView this block shows.
 */

import { useCallback, useMemo } from "react";
import { authorizationDataFromState } from "@/lib/funnel-v3/authorizationData";
import { useDocumentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { MAX_FILE_BYTES, removeFile, retryFile } from "@/lib/funnel-v3/upload";
import { baseId, SIGNATURE_REQUIREMENT_ID } from "@/lib/funnel-v3/requirements";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import Toast, { useToast } from "../documents/Toast";
import SignaturePanel from "./SignaturePanel";
import { addSignatureCopy, downloadAuthorization } from "./signatureActions";
import { signatureModel } from "./signatureModel";

export default function SignatureBlock(): JSX.Element {
  const { t, opt, lang } = useFunnelT();
  const ans = useFunnelV3((s) => s.ans);
  const txt = useFunnelV3((s) => s.txt);
  const borrowers = useFunnelV3((s) => s.borrowers);
  const info = useFunnelV3((s) => s.info);
  const sig = useFunnelV3((s) => s.sig);
  const setSignature = useFunnelV3((s) => s.setSignature);
  const docs = useDocumentsSummary();
  const { lines, say } = useToast();

  const data = useMemo(() => authorizationDataFromState({ ans, txt, borrowers, info }, lang), [ans, txt, borrowers, info, lang]);
  const model = useMemo(
    () => signatureModel({ view: docs.signature, files: docs.files, later: sig?.choice === "later", data, jp: ans.kn === "Juristische Person" }, t, opt),
    [docs.signature, docs.files, sig, data, ans.kn, t, opt]
  );
  const hasCopy = docs.signature.fileIds.length > 0;

  const onPick = useCallback(
    (file: File) => {
      const res = addSignatureCopy(useFunnelV3, file);
      if (!res.ok) {
        const text =
          res.reason === "size"
            ? t("docs.toast.size", { name: file.name, mb: Math.round(MAX_FILE_BYTES / (1024 * 1024)) })
            : res.reason === "empty"
              ? t("docs.toast.empty", { name: file.name })
              : t("docs.toast.type", { name: file.name });
        say([{ text, big: true }]);
        return;
      }
      setSignature("uploaded");
      say([{ text: "✓ " + t("sig.toastReceived"), big: true }, { text: t("sig.toastChecking") }]);
    },
    [say, setSignature, t]
  );

  const onRemove = useCallback(
    (id: string) => {
      removeFile(id);
      const left = useFunnelV3.getState().files.some((f) => f.instanceId && baseId(f.instanceId) === SIGNATURE_REQUIREMENT_ID);
      if (!left && useFunnelV3.getState().sig?.choice === "uploaded") setSignature(null);
      say([{ text: t("docs.toast.removed"), big: true }]);
    },
    [say, setSignature, t]
  );

  const onRetry = useCallback((id: string) => void retryFile(id), []);

  const onToggleLater = useCallback(() => {
    setSignature(sig?.choice === "later" ? (hasCopy ? "uploaded" : null) : "later");
  }, [hasCopy, setSignature, sig]);

  return (
    <>
      <SignaturePanel
        model={model}
        t={t}
        onDownload={() => downloadAuthorization(data)}
        onPick={onPick}
        onRemove={onRemove}
        onRetry={onRetry}
        onToggleLater={onToggleLater}
      />
      <Toast lines={lines} />
    </>
  );
}
