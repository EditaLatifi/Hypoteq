import type { Metadata } from "next";
import Remax from "@/components/Remax";

export const metadata: Metadata = {
  title: "RE/MAX x HYPOTEQ — Deine Hypothek in 3 Schritten",
  description:
    "Exklusiv für RE/MAX Kundinnen und Kunden: in 2 Minuten zur ersten Einschätzung und in wenigen Tagen zum verbindlichen Hypothekenangebot. Kostenlos, unabhängig und auf dich abgestimmt.",
  alternates: {
    canonical: "https://www.hypoteq.ch/remax",
  },
  openGraph: {
    title: "RE/MAX x HYPOTEQ — Deine Hypothek in 3 Schritten",
    description:
      "Exklusiv für RE/MAX Kundinnen und Kunden. Starte in Sekunden und stelle deinen Antrag in nur 2 Minuten.",
    url: "https://www.hypoteq.ch/remax",
    type: "website",
  },
};

export default function RemaxPage() {
  return <Remax />;
}
