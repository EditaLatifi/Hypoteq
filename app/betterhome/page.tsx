import type { Metadata } from "next";
import BetterHome from "@/components/BetterHome";

export const metadata: Metadata = {
  title: "Better Home x HYPOTEQ — Deine Hypothek in 3 Schritten",
  description:
    "Exklusiv für Betterhomes Kunden: in 2 Minuten zur ersten Einschätzung und in wenigen Tagen zum verbindlichen Hypothekenangebot. Kostenlos, effizient und unabhängig.",
  alternates: {
    canonical: "https://www.hypoteq.ch/betterhome",
  },
  openGraph: {
    title: "Better Home x HYPOTEQ — Deine Hypothek in 3 Schritten",
    description:
      "Exklusiv für Betterhomes Kunden. Starte in Sekunden und stelle deinen Antrag in nur 2 Minuten.",
    url: "https://www.hypoteq.ch/betterhome",
    type: "website",
  },
};

export default function BetterHomePage() {
  return <BetterHome />;
}
