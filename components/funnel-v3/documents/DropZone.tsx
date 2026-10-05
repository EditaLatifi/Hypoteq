"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { filesFromDataTransfer, filesFromInput, type PickedFile } from "@/lib/funnel-v3/upload";

export interface DropZoneHandle {
  /** Opens the file picker (row actions «Hochladen», «Aktuelles hochladen», «Doch hochladen»). */
  pick: () => void;
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp";

/**
 * The one drop zone of step 5 (DECISIONS D15): files and whole folders, in any order — the
 * customer never says which document is which.
 */
const DropZone = forwardRef<DropZoneHandle, { onFiles: (files: PickedFile[]) => void; total: number; open: number }>(
  function DropZone({ onFiles, total, open }, ref) {
    const { t } = useFunnelT();
    const [drag, setDrag] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const folderInput = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({ pick: () => fileInput.current?.click() }), []);

    const busy = open > 0;
    const hint = busy
      ? t("docs.dropReading", { n: open, total })
      : total
        ? t("docs.dropCount", { n: total })
        : t("s5.pick");

    return (
      <div
        className={`v3-drop${drag ? " is-drag" : ""}${busy ? " is-busy" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={t("s5.drop")}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInput.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!drag) setDrag(true);
        }}
        onDragLeave={(e) => {
          // Leaving into a child is not leaving the zone.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          // The entries must be read before anything awaits (filesFromDataTransfer does).
          void filesFromDataTransfer(e.dataTransfer).then((files) => files.length && onFiles(files));
        }}
      >
        <input
          ref={fileInput}
          className="v3-docs-hidden-input"
          type="file"
          multiple
          accept={ACCEPT}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const files = filesFromInput(e.target.files);
            e.target.value = "";
            if (files.length) onFiles(files);
          }}
        />
        <input
          ref={folderInput}
          className="v3-docs-hidden-input"
          type="file"
          multiple
          // Non-standard but supported by every current browser: pick a whole folder.
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const files = filesFromInput(e.target.files);
            e.target.value = "";
            if (files.length) onFiles(files);
          }}
        />
        <svg className="v3-drop-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 16l-4-4-4 4" />
          <path d="M12 12v9" />
          <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
        </svg>
        <span className="v3-drop-title">{drag ? t("docs.dropRelease") : t("s5.drop")}</span>
        <span className="v3-drop-sub">{t("s5.dropSub")}</span>
        <span className="v3-drop-hint">{hint}</span>
        <button
          type="button"
          className="v3-drop-folder"
          onClick={(e) => {
            e.stopPropagation();
            folderInput.current?.click();
          }}
        >
          {t("docs.pickFolder")}
        </button>
      </div>
    );
  }
);

export default DropZone;
