"""Loads the design's build.py as a module (without building) and dumps its fixed texts to JSON."""
import importlib.util, json, sys
src, out = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("hq_build", src)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
base_ids = [p for p, _, _ in m.PAGES if p not in {e[0] for e in m.EXTRA}]
data = {
  "BASE_PAGES": [[p, par, d] for p, par, d in m.PAGES if p in base_ids],
  "LINKS": m.LINKS, "PHONE": m.PHONE, "PHONE_INTL": m.PHONE_INTL, "GOOGLE_RATING": m.GOOGLE_RATING,
  "RATES": m.RATES, "BEST": m.BEST, "CALC_RATES": m.CALC_RATES,
  "NAV": {l: {k: v for k, v in m.NAV[l].items() if k in base_ids or k == "home"} for l in m.LANGS},
  "MENU": m.MENU, "UI": m.UI, "ADV": m.ADV, "CAPITALS": m.CAPITALS, "SMS": m.SMS, "SMS_TXT": m.SMS_TXT,
  "IMAGES": sorted(m.IMAGES), "SCR": m.SCR, "CL": m.CL,
  "HUB_SLUGS": m.HUB_SLUGS, "HUB_NAV": m.HUB_NAV, "CT": m.CT,
}
with open(out, "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print("ok", len(base_ids), "base pages")
