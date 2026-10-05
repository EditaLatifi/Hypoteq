"use client";

import { useState } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { renameFile } from "@/lib/funnel-v3/upload";

/**
 * «Wird gespeichert als» (spec 5.1) with the original name. Berater and the internal role may
 * change the name before completion; customers only see it.
 */
export default function StoredName({ file, name, canRename }: { file: FileEntry; name: string; canRename: boolean }) {
  const { t } = useFunnelT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (editing) {
    return (
      <div className="v3-rename">
        <input className="v3-input" value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("s5.storedAs")} />
        <button
          type="button"
          className="v3-btn v3-btn--primary v3-btn--sm"
          onClick={() => {
            renameFile(file.id, value);
            setEditing(false);
          }}
        >
          {t("docs.renameSave")}
        </button>
        {file.nameOverride ? (
          <button
            type="button"
            className="v3-btn v3-btn--ghost v3-btn--sm"
            onClick={() => {
              renameFile(file.id, "");
              setEditing(false);
            }}
          >
            {t("docs.renameReset")}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="v3-stored-row">
      <div className="v3-stored">
        <span className="v3-stored-name">{name}</span>
        <span className="v3-stored-orig">{t("s5.original", { name: file.relativePath || file.name })}</span>
      </div>
      {canRename ? (
        <button
          type="button"
          className="v3-btn v3-btn--text v3-btn--sm"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          {t("s5.rename")}
        </button>
      ) : null}
    </div>
  );
}
