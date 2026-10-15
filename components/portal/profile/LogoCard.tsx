"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, RefreshCw, Trash2 } from "lucide-react";
import { removeImageAction, setLogoOnLightAction } from "@/app/portal/profileActions";
import { useT } from "@/components/portal/I18n";
import { Notice, Switch, uploadImage } from "@/components/portal/profile/bits";
import { Card, Eyebrow, btn } from "@/components/portal/ui";

const MAX = 2 * 1024 * 1024;
const LOGO_ACCEPT = ".png,.svg,.jpg,.jpeg,image/png,image/svg+xml,image/jpeg";

/**
 * «Firmenlogo»: one logo per partner company, shown instead of the HYPOTEQ logo to every
 * user of the company. The preview is the sidebar as it will look; a picked file shows in
 * it at once, before the upload has finished.
 */
export default function LogoCard({
  logo,
  canEdit,
  noAccount,
}: {
  logo: { v: number; onLight: boolean } | null;
  /** The user's company is known and this is not a read-only partner view. */
  canEdit: boolean;
  /** The user has no partner company in Salesforce: explain why there is no upload. */
  noAccount: boolean;
}) {
  const t = useT();
  const tx = t.profileExtra;
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [onLight, setOnLight] = useState(logo?.onLight ?? false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  useEffect(() => {
    setPreview(null);
    setOnLight(logo?.onLight ?? false);
  }, [logo?.v, logo?.onLight]);

  const src = preview || (logo ? `/api/portal/image/logo?v=${logo.v}` : null);

  async function pick(file: File | undefined | null) {
    setMsg(null);
    if (!file) return;
    if (!/\.(png|svg|jpe?g)$/i.test(file.name)) return setMsg({ error: tx.image.typeLogo });
    if (file.size > MAX) return setMsg({ error: tx.image.tooLarge });
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    const error = await uploadImage("logo", file, tx.image.failed);
    setBusy(false);
    if (error) {
      setPreview(null);
      return setMsg({ error });
    }
    setMsg({ ok: tx.logo.updated });
    router.refresh();
  }

  const fileInput = (
    <input
      type="file"
      accept={LOGO_ACCEPT}
      className="sr-only"
      disabled={busy || !canEdit}
      onChange={(e) => {
        pick(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  return (
    <Card>
      <Eyebrow accent>{tx.logo.title}</Eyebrow>

      <div className="flex flex-col gap-2">
        <div className="flex min-h-[112px] flex-col items-start justify-center gap-2.5 rounded-xl border border-white/[.08] bg-[#0A130D] p-6">
          {src ? (
            <span className={onLight ? "inline-flex rounded-lg bg-white px-3 py-2" : "inline-flex"}>
              <img src={src} alt={tx.logo.alt} className={`block h-11 w-40 object-contain object-left ${busy ? "opacity-60" : ""}`} />
            </span>
          ) : (
            <img src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" className="block h-auto w-[120px]" />
          )}
          <div className="text-[11px] uppercase tracking-[.14em] text-white/45">{src ? tx.logo.poweredBy : tx.logo.portal}</div>
        </div>
        <span className="text-[13px] text-white/45">{tx.logo.preview}</span>
      </div>

      {noAccount ? <p className="m-0 text-[15px] text-white/70">{tx.logo.noAccount}</p> : null}

      {canEdit && !src ? (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed border-white/30 bg-white/[.04] px-5 py-6 text-center hover:border-[#CAF476] hover:bg-white/[.08] focus-within:border-[#CAF476]"
        >
          <ImageUp size={26} className="text-[#CAF476]" />
          <span className="text-[17px] font-medium">{tx.logo.upload}</span>
          <span className="text-[13px] text-white/70">{tx.logo.uploadHint}</span>
          {fileInput}
        </label>
      ) : null}

      {canEdit && src ? (
        <>
          <div className="flex items-center justify-between gap-4 border-t border-white/[.14] py-3">
            <span className="text-[15px]">{tx.logo.onLight}</span>
            <Switch
              on={onLight}
              label={tx.logo.onLight}
              disabled={busy || pending || !logo}
              onChange={(on) => {
                setOnLight(on);
                start(async () => {
                  const r = await setLogoOnLightAction(on);
                  if (r.error) {
                    setOnLight(!on);
                    setMsg({ error: r.error });
                  }
                });
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={`${btn.secondary} h-9 cursor-pointer border-white/30 text-[15px] focus-within:shadow-[0_0_0_3px_rgba(202,244,118,.55)]`}>
              <RefreshCw size={16} /> {tx.logo.replace}
              {fileInput}
            </label>
            <button
              type="button"
              disabled={busy || pending || !logo}
              onClick={() =>
                start(async () => {
                  const r = await removeImageAction("logo");
                  setMsg(r);
                  router.refresh();
                })
              }
              className={`${btn.ghost} h-9 px-2 text-[15px] disabled:opacity-50`}
            >
              <Trash2 size={16} /> {tx.logo.remove}
            </button>
          </div>
        </>
      ) : null}

      {busy ? <span className="text-[13px] text-white/70">{tx.image.uploading}</span> : null}
      <Notice ok={msg?.ok} error={msg?.error} />
      <p className="m-0 text-[13px] text-white/70">{tx.logo.note}</p>
    </Card>
  );
}
