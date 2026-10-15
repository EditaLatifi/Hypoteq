"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { removeImageAction } from "@/app/portal/profileActions";
import { useT } from "@/components/portal/I18n";
import { Notice, uploadImage } from "@/components/portal/profile/bits";

const MAX = 2 * 1024 * 1024;
const PHOTO_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

/**
 * The profile avatar: a click opens the file picker, the photo is uploaded at once and
 * shown in the sidebar and header too. The browser only pre-checks name and size; the
 * server decides by the bytes.
 */
export default function ProfileAvatar({ initials, photoV, readOnly }: { initials: string; photoV: number | null; readOnly: boolean }) {
  const t = useT();
  const tx = t.profileExtra;
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [removing, startRemove] = useTransition();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  // Once the server has the new photo, show that instead of the local preview.
  useEffect(() => {
    setPreview(null);
  }, [photoV]);

  const src = preview || (photoV ? `/api/portal/image/photo?v=${photoV}` : null);

  async function pick(file: File | undefined) {
    setMsg(null);
    if (!file) return;
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) return setMsg({ error: tx.image.typePhoto });
    if (file.size > MAX) return setMsg({ error: tx.image.tooLarge });
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    const error = await uploadImage("photo", file, tx.image.failed);
    setBusy(false);
    if (error) {
      setPreview(null);
      return setMsg({ error });
    }
    setMsg({ ok: tx.photo.updated });
    router.refresh();
  }

  const circle = (
    <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-white/[.14] text-[24px] font-semibold">
      {src ? <img src={src} alt="" className={`h-full w-full object-cover ${busy ? "opacity-60" : ""}`} /> : initials}
    </span>
  );

  return (
    <div className="flex flex-col items-start gap-2">
      {readOnly ? (
        circle
      ) : (
        <label title={tx.photo.change} className="relative h-20 w-20 flex-none cursor-pointer rounded-full focus-within:shadow-[0_0_0_3px_rgba(202,244,118,.55)]">
          {circle}
          <span className="absolute -bottom-0.5 -right-0.5 grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-[#132219] bg-[#CAF476] text-[#132219]">
            <Camera size={15} />
          </span>
          <input
            type="file"
            accept={PHOTO_ACCEPT}
            className="sr-only"
            aria-label={tx.photo.change}
            disabled={busy}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {!readOnly && photoV && !preview ? (
        <button
          type="button"
          disabled={removing}
          onClick={() =>
            startRemove(async () => {
              const r = await removeImageAction("photo");
              setMsg(r);
              router.refresh();
            })
          }
          className="text-[13px] text-white/70 underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
        >
          {tx.photo.remove}
        </button>
      ) : null}
      {busy ? <span className="text-[13px] text-white/70">{tx.image.uploading}</span> : null}
      {msg ? (
        <div className="max-w-[320px]">
          <Notice ok={msg.ok} error={msg.error} />
        </div>
      ) : null}
    </div>
  );
}
