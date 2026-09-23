"use client";

import { useState, useTransition } from "react";
import { setNotifyPrefAction } from "@/app/portal/actions";
import { useT } from "@/components/portal/I18n";

export default function NotifySwitches({ prefs, readOnly }: { prefs: Record<string, boolean>; readOnly: boolean }) {
  const t = useT();
  const [, start] = useTransition();
  const [state, setState] = useState(prefs);

  return (
    <div className="flex flex-col">
      {Object.keys(t.profile.notifLabels).map((k) => {
        const on = state[k] !== false;
        return (
          <div key={k} className="flex items-center justify-between gap-4 border-t border-white/[.14] py-3">
            <span className="text-[15px]">{t.profile.notifLabels[k]}</span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={t.profile.notifLabels[k]}
              disabled={readOnly}
              onClick={() => {
                setState((s) => ({ ...s, [k]: !on }));
                start(() => setNotifyPrefAction(k, !on));
              }}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#CAF476]" : "bg-white/[.2]"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#132219] transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
