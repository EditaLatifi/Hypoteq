"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { filesFromDataTransfer, filesFromInput, type PickedFile } from "@/lib/funnel-v3/upload";

export interface DropZoneHandle {
  /** Opens the file picker (row actions «Hochladen», «Aktuelles hochladen», «Doch hochladen»). */
  pick: () => void;
}

export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp";

interface Props {
  onFiles: (files: PickedFile[]) => void;
  /** Files in the list so far. */
  total: number;
  /** Files still uploading or being read. */
  open: number;
  /** Title override: «Fehlende Unterlagen hier ablegen» on the Schnellanmeldung's closing. */
  title?: string;
}

/**
 * The one drop zone (Handover 4.3, DECISIONS D15): «Einzelne Dateien oder ganzen Ordner hier
 * ablegen», with «Dateien auswählen» and «Ganzen Ordner auswählen» (`webkitdirectory`). A
 * dropped folder is read recursively (upload.ts filesFromDataTransfer, `webkitGetAsEntry`).
 * The customer never says which document is which.
 */
const DropZone = forwardRef<DropZoneHandle, Props>(function DropZone({ onFiles, total, open, title }, ref) {
  const { t } = useFunnelT();
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ pick: () => fileInput.current?.click() }), []);

  const busy = open > 0;
  const hint = busy ? t("docs.dropReading", { n: open, total }) : total ? t("docs.dropCount", { n: total }) : t("s5.pick");

  return (
    <div
      className={`v3-drop${drag ? " is-drag" : ""}${busy ? " is-busy" : ""}`}
      // A group, not a button: it holds the two buttons, which are the keyboard way in; a
      // click anywhere on the zone is the mouse shortcut to «Dateien auswählen».
      role="group"
      aria-label={title ?? t("s5.drop2")}
      onClick={() => fileInput.current?.click()}
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
        tabIndex={-1}
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
        tabIndex={-1}
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
      <span className="v3-drop-title">{drag ? t("docs.dropRelease") : title ?? t("s5.drop2")}</span>
      <span className="v3-drop-sub">{t("s5.dropSub2")}</span>
      <span className="v3-drop-hint">{hint}</span>
      <span className="v3-drop-actions">
        <button
          type="button"
          className="v3-btn v3-btn--dark"
          onClick={(e) => {
            e.stopPropagation();
            fileInput.current?.click();
          }}
        >
          {t("s5.pickFiles")}
        </button>
        <button
          type="button"
          className="v3-btn v3-btn--ghost"
          onClick={(e) => {
            e.stopPropagation();
            folderInput.current?.click();
          }}
        >
          {t("s5.pickFolder")}
        </button>
      </span>
    </div>
  );
});

export default DropZone;
