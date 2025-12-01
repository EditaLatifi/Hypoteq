"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const defaultAnswer = (
  <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
    <p>
      Dies ist ein Platzhaltertext. Bitte füge hier die endgültige Antwort aus Figma ein.
    </p>
  </div>
);

const faqData = [
  {
    question: "Wie funktioniert eine Hypothekenanfrage bei HYPOTEQ?",
    answer: (
      <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
        <p>Es gibt zwei Möglichkeiten, bei uns eine Finanzierung anzufragen:</p>

        <ul className="list-disc pl-[18px]">
          <li>
            <strong>Definitive Offerte:</strong><br />
            Wenn Sie aus unserem Netzwerk von über 30 Kreditgebern konkrete
            Finanzierungsangebote wünschen, wählen Sie bitte den Bereich
            «Hypotheken-Anfrage» und übermitteln Sie uns alle relevanten
            Informationen und Dokumente. Sobald das Dossier vollständig ist,
            holen wir verbindliche Offerten bei den passenden Kreditpartnern ein.
          </li>

          <li>
            <strong>Indikative Offerte:</strong><br />
            Wenn Sie nur eine erste Einschätzung oder einen Richtzins wünschen,
            können Sie indikative Offerten anfragen. Basierend auf wenigen
            Basisangaben (Einkommen, Objekt, Belehnung etc.) erhalten Sie
            unverbindliche Richtpreise. Diese Offerten sind indikativ und stehen
            unter Vorbehalt der vollständigen Prüfung Ihrer Unterlagen sowie der
            finalen Kreditfreigabe durch den Finanzierungspartner.
          </li>
        </ul>
      </div>
    ),
  },

  {
    question: "Was kostet der Service von HYPOTEQ?",
    answer: (
      <div className="flex flex-col gap-[3px] text-[16px] leading-[150%]">
        <p>
          Für Kund:innen ist unsere Dienstleistung grundsätzlich kostenlos.
          Wir werden von den Finanzierungspartnern entschädigt, sobald eine
          Hypothek abgeschlossen wird.
        </p>

        <p><strong>Fairness Clause:</strong></p>

        <p>
          Wenn wir auf Ihren Wunsch definitive Offerten einholen und Sie sich trotz
          gleichwertiger oder schlechterer Konkurrenzangebote gegen uns
          entscheiden, behalten wir uns vor, eine Aufwandsentschädigung von
          CHF 500.– zu verrechnen. Damit stellen wir sicher, dass die
          umfangreiche Analyse und Offertbeschaffung fair honoriert wird.
        </p>
      </div>
    ),
  },

{
  question: "Welche Arten von Finanzierungen bietet HYPOTEQ an?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
      <p>
        Wir bieten Finanzierungen für Privatpersonen, Selbstständige und juristische Personen in folgenden Bereichen:
      </p>

      <ul className="list-disc pl-[18px]">
        <li>Erst- und Zweitwohnungen</li>
        <li>Neue Hypothek für Kauf oder Eigentumserwerb</li>
        <li>Refinanzierung / Ablösung bestehender Hypotheken</li>
        <li>Neubau- oder Umbaufinanzierung</li>
        <li>Renditeobjekte</li>
        <li>Mezzanine–Finanzierungen</li>
      </ul>

      <p>(Keine Gewerbeobjekte, ausser im Rahmen von Mezzanine–Strukturen.)</p>
    </div>
  ),
},
{
  question: "Wie lange dauert es, bis ich ein Angebot erhalte?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">

      <ul className="list-disc pl-[18px]">
        <li>
          <strong>Indikative Offerte:</strong><br/>
          innerhalb weniger Stunden bis maximal 1 Arbeitstag.
        </li>

        <li>
          <strong>Definitive Offerte:</strong><br/>
          sobald alle relevanten Unterlagen vollständig vorliegen,
          in der Regel innert 2–3 Arbeitstagen.<br/>
          Bei komplexen Fällen (z. B. juristische Personen, Neubauten
          oder gemischt genutzte Objekte) kann es etwas länger dauern.
        </li>
      </ul>

    </div>
  )
},

{
  question: "Warum dauert mein Kreditantrag länger als erwartet?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
      <p>
        Die Bearbeitungsdauer hängt stark von der Vollständigkeit der Unterlagen,
        der Komplexität des Falls und den internen Prüfprozessen der Banken ab.
      </p>

      <p>
        Verzögerungen entstehen häufig, wenn Nachweise fehlen oder Rückfragen geklärt
        werden müssen – insbesondere bei Selbstständigen, Neubauten, juristischen
        Personen oder Ablösungen.
      </p>

      <p>
        Mit einem vollständigen Dossier und klaren Angaben kann der Prozess deutlich
        beschleunigt werden.
      </p>
    </div>
  )
},

{
  question: "Welche Dokumente benötige ich für eine definitive Offerte?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
      <p>
        Die vollständige Dokumentenliste finden Sie über den folgenden Link:
        <br/> <strong>[Dokumentenliste]</strong>
      </p>

      <p>
        Alternativ können Sie unseren Online-Funnel ausfüllen – am Ende des Prozesses
        wird automatisch eine Liste mit allen benötigten Unterlagen angezeigt,
        passend zu Ihrer Situation.
      </p>
    </div>
  )
},

{
  question: "Mit welchen Banken arbeitet HYPOTEQ zusammen?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
      <p>
        Wir arbeiten mit einem breiten Netzwerk aus über 30 Banken, Versicherungen
        und alternativen Kreditgebern in der Schweiz zusammen.
      </p>
      <p>
        Dadurch können wir unabhängig und objektiv vergleichen und für jede Kundin
        und jeden Kunden die bestmögliche Lösung finden.
      </p>
    </div>
  )
},

{
  question: "Was ist der Unterschied zwischen HYPOTEQ und einer Bank?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">

      <p>
        HYPOTEQ ist kein Kreditgeber, sondern ein unabhängiger Hypothekenvermittler.  
        Wir arbeiten mit über 30 Banken, Versicherungen und alternativen Finanzierungspartnern zusammen.
      </p>

      <p>
        Dadurch unterscheiden wir uns in folgenden Punkten von einer klassischen Bank:
      </p>

      <ul className="list-disc pl-[18px]">
        <li>
          <strong>Unabhängiger Vergleich:</strong>  
          Wir vergleichen Angebote verschiedener Banken – eine Bank bietet nur ihre eigenen Produkte an.
        </li>

        <li>
          <strong>Bessere Konditionen:</strong>  
          Durch den Vergleich profitieren Kund:innen häufig von tieferen Zinsen und besseren Bedingungen.
        </li>

        <li>
          <strong>Ein Ansprechpartner:</strong>  
          Statt mit mehreren Banken zu sprechen, führen Sie das gesamte Gespräch nur mit uns.
        </li>

        <li>
          <strong>Massgeschneiderte Lösungen:</strong>  
          Wir finden individuelle Finanzierungslösungen – auch bei komplexeren Fällen,  
          bei denen Banken oft keine Offerte ausstellen.
        </li>

        <li>
          <strong>Effizienter Prozess:</strong>  
          Wir übernehmen die Analyse, Offertbeschaffung und Verhandlungen mit den Kreditpartnern.
        </li>
      </ul>

      <p>
        Kurz gesagt:  
        <strong>
          Die Bank verkauft Hypotheken.  
          HYPOTEQ vergleicht Hypotheken und findet für Sie die beste Lösung.
        </strong>
      </p>

    </div>
  )
}
,
{
  question: "Wie kann ich direkt einen Termin vereinbaren?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">

      <p>
        Sie können jederzeit einen unverbindlichen 15-Minuten-Termin mit einem unserer Finanzierungsexperten buchen – bequem online über unseren Terminbuchungs-Link.
      </p>

      <p>
        Das Gespräch ist kostenlos und dient dazu, Ihre Situation kurz zu analysieren und das weitere Vorgehen zu planen.
      </p>

      <ul className="list-disc pl-[18px]">
        <li>Online-Terminbuchung rund um die Uhr möglich</li>
        <li>Kostenfreies Erstgespräch</li>
        <li>Beratung durch einen HYPOTEQ-Experten</li>
      </ul>

    </div>
  )
}
,
{
  question: "Was ist HYPOTEQ Advisory?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
      <p>
        HYPOTEQ Advisory richtet sich an Kund:innen mit komplexeren Finanzierungsbedürfnissen.  
        Mit unserem kostenpflichtigen Beratungsmandat erhalten Sie Zugang zu fundierter Analyse, 
        gezielter Strukturierung und individuellen Lösungen – über Standardangebote hinaus.
      </p>

      <p>Wir unterstützen Sie insbesondere bei:</p>

      <ul className="list-disc pl-[18px]">
        <li>Finanzierung im Ruhestand</li>
        <li>Komplexen Liegenschaften (z. B. Mehrfamilienhäuser, gemischte Objekte)</li>
        <li>Nach Bankabsagen</li>
        <li>Mezzanine- oder Zwischenfinanzierungen</li>
        <li>Eigentümerstrukturen mit mehreren Parteien oder juristischen Personen</li>
      </ul>

      <p>So läuft es ab:</p>

      <ul className="list-disc pl-[18px]">
        <li>Sie buchen ein kostenloses Erstgespräch mit einem Advisory-Experten.</li>
        <li>Wir analysieren Ihre Situation und erstellen eine Offerte für ein Advisory-Mandat.</li>
        <li>
          Wir begleiten Sie bis zur Umsetzung – vom Offertvergleich bis zur Vertragsverhandlung.
        </li>
      </ul>

      <p>
        Der Advisory-Service ist kostenpflichtig, bietet aber echten Mehrwert: tiefes Marktwissen, 
        persönliche Begleitung und massgeschneiderte Finanzierungslösungen.
      </p>
    </div>
  )
}
,
{
  question: "Wie kann man Mezzanine-Finanzierungen anfragen?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">

      <p>
        Eine flexible Finanzierungsform zwischen Bankdarlehen und Eigenkapital. 
        Sie ist nachrangig gegenüber klassischen Hypotheken, aber vorrangig vor Gesellschaftskapital.
      </p>

      <p>Wann ist Mezzanine sinnvoll?</p>
      <ul className="list-disc pl-[18px]">
        <li>Wenn zusätzliches Kapital benötigt wird, ohne Beteiligung zu verwässern.</li>
        <li>Wenn die Bank nur einen Teil des Projekts finanziert.</li>
        <li>
          Wenn rasche Finanzierungslösungen gefragt sind 
          (z. B. bei Akquisitionen, Zwischenfinanzierungen, Projektstarts).
        </li>
      </ul>

      <p>Typische Struktur:</p>
      <ul className="list-disc pl-[18px]">
        <li>Nachrangdarlehen mit fixem oder variablem Zins</li>
        <li>Laufzeit 2–5 Jahre</li>
        <li>Optionale Gewinnbeteiligung</li>
        <li>Rückzahlung endfällig oder mit Amortisation</li>
      </ul>

      <p>
        Wir bringen Sie mit passenden Kapitalpartnern zusammen – diskret, lösungsorientiert und effizient.
      </p>

    </div>
  )
}
,
{
  question: "Wie kann ich HYPOTEQ kontaktieren?",
  answer: (
    <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
      <p>
        Sie erreichen uns über das Kontaktformular auf der Website, per E-Mail an 
        <strong> info@hypoteq.ch </strong> oder telefonisch.
      </p>

      <p>
        Gerne vereinbaren wir auch einen Termin – online oder persönlich.
      </p>
    </div>
  )
}
,
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

  // Generate FAQ data dynamically using translations
  const getFaqData = () => [
    {
      question: t("faqItems.q1"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a1_intro")}</p>
          <ul className="list-disc pl-[18px]">
            <li>
              <strong>{t("faqItems.a1_definitive")}</strong><br />
              {t("faqItems.a1_definitive_text")}
            </li>
            <li>
              <strong>{t("faqItems.a1_indicative")}</strong><br />
              {t("faqItems.a1_indicative_text")}
            </li>
          </ul>
        </div>
      ),
    },
    {
      question: t("faqItems.q2"),
      answer: (
        <div className="flex flex-col gap-[3px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a2_p1")}</p>
          <p><strong>{t("faqItems.a2_fairness")}</strong></p>
          <p>{t("faqItems.a2_p2")}</p>
        </div>
      ),
    },
    {
      question: t("faqItems.q3"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a3_intro")}</p>
          <ul className="list-disc pl-[18px]">
            <li>{t("faqItems.a3_item1")}</li>
            <li>{t("faqItems.a3_item2")}</li>
            <li>{t("faqItems.a3_item3")}</li>
            <li>{t("faqItems.a3_item4")}</li>
            <li>{t("faqItems.a3_item5")}</li>
            <li>{t("faqItems.a3_item6")}</li>
          </ul>
          <p>{t("faqItems.a3_note")}</p>
        </div>
      ),
    },
    {
      question: t("faqItems.q4"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <ul className="list-disc pl-[18px]">
            <li>
              <strong>{t("faqItems.a4_indicative")}</strong><br />
              {t("faqItems.a4_indicative_text")}
            </li>
            <li>
              <strong>{t("faqItems.a4_definitive")}</strong><br />
              {t("faqItems.a4_definitive_text")}
            </li>
          </ul>
        </div>
      ),
    },
    {
      question: t("faqItems.q5"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a5_p1")}</p>
          <p>{t("faqItems.a5_p2")}</p>
          <p>{t("faqItems.a5_p3")}</p>
        </div>
      ),
    },
    {
      question: t("faqItems.q6"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a6_p1")}<br /><strong><Link href={`/${pathLocale}/documents`} className="underline hover:opacity-70 transition cursor-pointer">{t("faqItems.a6_link")}</Link></strong></p>
          <p>{t("faqItems.a6_p2")}</p>
        </div>
      ),
    },
    {
      question: t("faqItems.q7"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a7_p1")}</p>
          <p>{t("faqItems.a7_p2")}</p>
        </div>
      ),
    },
    {
      question: t("faqItems.q8"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a8_p1")}</p>
          <p>{t("faqItems.a8_p2")}</p>
          <ul className="list-disc pl-[18px]">
            <li>
              <strong>{t("faqItems.a8_item1_title")}</strong>{" "}
              {t("faqItems.a8_item1_text")}
            </li>
            <li>
              <strong>{t("faqItems.a8_item2_title")}</strong>{" "}
              {t("faqItems.a8_item2_text")}
            </li>
            <li>
              <strong>{t("faqItems.a8_item3_title")}</strong>{" "}
              {t("faqItems.a8_item3_text")}
            </li>
            <li>
              <strong>{t("faqItems.a8_item4_title")}</strong>{" "}
              {t("faqItems.a8_item4_text")}
            </li>
            <li>
              <strong>{t("faqItems.a8_item5_title")}</strong>{" "}
              {t("faqItems.a8_item5_text")}
            </li>
          </ul>
          <p><strong>{t("faqItems.a8_summary")}</strong></p>
        </div>
      ),
    },
    {
      question: t("faqItems.q9"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a9_p1")}</p>
          <p>{t("faqItems.a9_p2")}</p>
          <ul className="list-disc pl-[18px]">
            <li>{t("faqItems.a9_item1")}</li>
            <li>{t("faqItems.a9_item2")}</li>
            <li>{t("faqItems.a9_item3")}</li>
          </ul>
        </div>
      ),
    },
    {
      question: t("faqItems.q10"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a10_p1")}</p>
          <p>{t("faqItems.a10_support")}</p>
          <ul className="list-disc pl-[18px]">
            <li>{t("faqItems.a10_item1")}</li>
            <li>{t("faqItems.a10_item2")}</li>
            <li>{t("faqItems.a10_item3")}</li>
            <li>{t("faqItems.a10_item4")}</li>
            <li>{t("faqItems.a10_item5")}</li>
          </ul>
          <p>{t("faqItems.a10_process")}</p>
          <ul className="list-disc pl-[18px]">
            <li>{t("faqItems.a10_step1")}</li>
            <li>{t("faqItems.a10_step2")}</li>
            <li>{t("faqItems.a10_step3")}</li>
          </ul>
          <p>{t("faqItems.a10_p2")}</p>
        </div>
      ),
    },
    {
      question: t("faqItems.q11"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a11_p1")}</p>
          <p>{t("faqItems.a11_when")}</p>
          <ul className="list-disc pl-[18px]">
            <li>{t("faqItems.a11_when1")}</li>
            <li>{t("faqItems.a11_when2")}</li>
            <li>{t("faqItems.a11_when3")}</li>
          </ul>
          <p>{t("faqItems.a11_structure")}</p>
          <ul className="list-disc pl-[18px]">
            <li>{t("faqItems.a11_struct1")}</li>
            <li>{t("faqItems.a11_struct2")}</li>
            <li>{t("faqItems.a11_struct3")}</li>
            <li>{t("faqItems.a11_struct4")}</li>
          </ul>
          <p>{t("faqItems.a11_p2")}</p>
        </div>
      ),
    },
    {
      question: t("faqItems.q12"),
      answer: (
        <div className="flex flex-col gap-[12px] text-[16px] leading-[150%]">
          <p>{t("faqItems.a12_p1")} <strong>{t("faqItems.a12_email")}</strong> {t("faqItems.a12_p2")}</p>
        </div>
      ),
    },
  ];

  const faqData = getFaqData();

  return (
    <section className="w-full bg-white py-[120px] px-[116px]font-sfpro text-[#132219]">
      <div className="px-4 w-full max-w-[1340px] mx-auto flex flex-col gap-[60px]">

        {/* TITLE */}
        <h1 className="text-[48px] md:text-[72px] font-medium leading-[100%] tracking-[-0.72px]">
          Frequently Asked <br /> Questions
        </h1>

        {/* LIST */}
        <div className="flex flex-col gap-[18px]">
          {faqData.map((item, index) => {
            const isOpen = openIndex === index;

            return (
              <div key={index} className="w-full">

                {/* Question Row */}
                <div
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex justify-between items-center w-full border border-[#132219] rounded-[58px]
                  px-[24px] py-[12px] cursor-pointer hover:bg-[#132219]/5 transition"
                >
                  <p className="text-[16px] md:text-[20px] font-medium">
                    {item.question}
                  </p>
                  <span className="text-[26px] font-light leading-none">
                    {isOpen ? "×" : "+"}
                  </span>
                </div>

                {/* Dropdown Content */}
                {isOpen && (
          <div
  className="mt-[12px] border border-[#132219] rounded-[16px] p-[24px] 
  bg-white shadow-sm
  text-[20px] leading-[150%] font-normal font-sfpro text-[#132219]"
>
  {item.answer}
</div>

                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
