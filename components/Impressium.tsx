"use client";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function Impressum() {
    const pathname = usePathname();
    const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
    const { t } = useTranslation(pathLocale);
    return (
        <div className="w-full flex justify-center bg-[#F4F4F4] px-[20px] md:px-[40px] lg:px-6 py-[60px] md:py-[80px] lg:py-20">
            <div className="max-w-[1272px] w-full flex flex-col gap-[50px] md:gap-[70px] lg:gap-[90px]">
                
                {/* Main Title */}
                <h1 
                    className="text-[#132219] font-[600] mt-[20px] md:mt-[20px] font-sfpro
                    text-[32px] md:text-[48px] lg:text-[62px]
                    leading-[40px] md:leading-[58px] lg:leading-[75px]"
                >
                    {t("impressum.title")}
                </h1>

                {/* Kontaktadresse */}
                <div className="flex flex-col gap-[20px] md:gap-[24px]">
                    <h2 
                        className="text-[#132219] font-[600] font-sfpro
                        text-[24px] md:text-[32px] lg:text-[40px]
                        leading-[32px] md:leading-[40px] lg:leading-[50px]"
                    >
                        {t("impressum.contactAddress")}
                    </h2>

                    <p className="text-[#132219] font-sfpro
                    text-[16px] md:text-[18px] lg:text-[20px]
                    leading-[26px] md:leading-[30px] lg:leading-[32px]">
                        HYPOTEQ AG, Löwenstrasse 29, 8001 Zürich<br />
                        Schweiz, info@hypoteq.ch, 044 564 73 70, UID: CHE-249.716.201
                    </p>
                </div>

                {/* Vertretungsberechtigte Personen */}
                <div className="flex flex-col gap-[20px] md:gap-[24px]">
                    <h2 
                        className="text-[#132219] font-[600] font-sfpro
                        text-[24px] md:text-[32px] lg:text-[40px]
                        leading-[32px] md:leading-[40px] lg:leading-[50px]"
                    >
                        {t("impressum.authorizedPersons")}
                    </h2>

                    <p className="text-[#132219] font-sfpro
                    text-[16px] md:text-[18px] lg:text-[20px]
                    leading-[26px] md:leading-[30px] lg:leading-[32px]">
                       Marco Circelli, Davide Iuorno, Fisnik Salihu
                    </p>
                </div>

                {/* Haftungsausschluss */}
                <div className="flex flex-col gap-[20px] md:gap-[24px]">
                    <h2 
                        className="text-[#132219] font-[600] font-sfpro
                        text-[24px] md:text-[32px] lg:text-[40px]
                        leading-[32px] md:leading-[40px] lg:leading-[50px]"
                    >
                        {t("impressum.disclaimerTitle")}
                    </h2>

                    <p className="text-[#132219] whitespace-pre-line font-sfpro
                    text-[16px] md:text-[18px] lg:text-[20px]
                    leading-[26px] md:leading-[30px] lg:leading-[32px]">
Der Autor übernimmt keinerlei Gewähr hinsichtlich der inhaltlichen Richtigkeit, Genauigkeit, Aktualität, Zuverlässigkeit und
Vollständigkeit der Informationen. Haftungsansprüche gegen den Autor wegen Schäden materieller oder immaterieller Art, welche
aus dem Zugriff oder der Nutzung bzw. Nichtnutzung der veröffentlichten Informationen, durch Missbrauch der Verbindung oder durch
technische Störungen entstanden sind, werden ausgeschlossen. Alle Angebote sind unverbindlich. Der Autor behält es sich ausdrücklich
vor, Teile der Seiten oder das gesamte Angebot ohne gesonderte Ankündigung zu verändern, zu ergänzen, zu löschen oder die
Veröffentlichung zeitweise oder endgültig einzustellen.
                    </p>
                </div>

                {/* Haftung für Links */}
                <div className="flex flex-col gap-[20px] md:gap-[24px]">
                    <h2 
                        className="text-[#132219] font-[600] font-sfpro
                        text-[24px] md:text-[32px] lg:text-[40px]
                        leading-[32px] md:leading-[40px] lg:leading-[50px]"
                    >
                        {t("impressum.linksTitle")}
                    </h2>

                    <p className="text-[#132219] font-sfpro
                    text-[16px] md:text-[18px] lg:text-[20px]
                    leading-[26px] md:leading-[30px] lg:leading-[32px]">
                        Verweise und Links auf Webseiten Dritter liegen ausserhalb unseres Verantwortungsbereichs. Es wird jegliche
                        Verantwortung für solche Webseiten abgelehnt. Der Zugriff und die Nutzung solcher Webseiten erfolgen auf 
                        eigene Gefahr des Nutzers oder der Nutzerin.
                    </p>
                </div>

                {/* Urheberrechte */}
                <div className="flex flex-col gap-[20px] md:gap-[24px]">
                    <h2 
                        className="text-[#132219] font-[600] font-sfpro
                        text-[24px] md:text-[32px] lg:text-[40px]
                        leading-[32px] md:leading-[40px] lg:leading-[50px]"
                    >
                        {t("impressum.copyrightTitle")}
                    </h2>

                    <p className="text-[#132219] whitespace-pre-line font-sfpro
                    text-[16px] md:text-[18px] lg:text-[20px]
                    leading-[26px] md:leading-[30px] lg:leading-[32px]">
Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Fotos oder anderen Dateien auf der Website gehören ausschliesslich der
Firma HYPOTEQ AG oder den speziell genannten Rechtsinhabern. Für die Reproduktion jeglicher Elemente ist die schriftliche Zustimmung
der Urheberrechtsträger im Voraus einzuholen.
                    </p>
                </div>
{/* DATENSCHUTZERKLÄRUNG */}
<div className="flex flex-col gap-[50px] md:gap-[70px] lg:gap-[90px]">
    
    <h1 
        className="text-[#132219] font-[600] font-sfpro
        text-[28px] md:text-[42px] lg:text-[56px]
        leading-[38px] md:leading-[52px] lg:leading-[60px]"
    >
        {t("impressum.privacyTitle")}
    </h1>

    {/* 1 */}
    <div className="flex flex-col gap-[20px] md:gap-[24px]">
        <h2 
            className="text-[#132219] font-[600] font-sfpro
            text-[22px] md:text-[28px] lg:text-[32px]
            leading-[30px] md:leading-[36px] lg:leading-[40px]"
        >
            {t("impressum.privacy1Title")}
        </h2>

        <p 
            className="text-[#132219] font-sfpro
            text-[16px] md:text-[18px] lg:text-[20px]
            leading-[26px] md:leading-[30px] lg:leading-[32px]"
        >
            {t("impressum.privacy1Text")}
        </p>
    </div>

    {/* 2 */}
    <div className="flex flex-col gap-[20px] md:gap-[24px]">
        <h2 
            className="text-[#132219] font-[600] font-sfpro
            text-[22px] md:text-[28px] lg:text-[32px]
            leading-[30px] md:leading-[36px] lg:leading-[40px]"
        >
            {t("impressum.privacy2Title")}
        </h2>

        <p 
            className="text-[#132219] font-sfpro
            text-[16px] md:text-[18px] lg:text-[20px]
            leading-[26px] md:leading-[30px] lg:leading-[32px]"
        >
            {t("impressum.privacy2Text")}
        </p>
    </div>

    {/* 3 */}
    <div className="flex flex-col gap-[20px] md:gap-[24px]">
        <h2 
            className="text-[#132219] font-[600] font-sfpro
            text-[22px] md:text-[28px] lg:text-[32px]
            leading-[30px] md:leading-[36px] lg:leading-[40px]"
        >
            {t("impressum.privacy3Title")}
        </h2>

        <p 
            className="text-[#132219] whitespace-pre-line font-sfpro
            text-[16px] md:text-[18px] lg:text-[20px]
            leading-[26px] md:leading-[30px] lg:leading-[32px]"
        >
{t("impressum.privacy3Text")}
        </p>
    </div>

    {/* 4 */}
    <div className="flex flex-col gap-[20px] md:gap-[24px]">
        <h2 
            className="text-[#132219] font-[600] font-sfpro
            text-[22px] md:text-[28px] lg:text-[32px]
            leading-[30px] md:leading-[36px] lg:leading-[40px]"
        >
            {t("impressum.privacy4Title")}
        </h2>

        <p 
            className="text-[#132219] whitespace-pre-line font-sfpro
            text-[16px] md:text-[18px] lg:text-[20px]
            leading-[26px] md:leading-[30px] lg:leading-[32px]"
        >
{t("impressum.privacy4Text")}
        </p>
    </div>

    {/* 5 */}
    <div className="flex flex-col gap-[20px] md:gap-[24px]">
        <h2 
            className="text-[#132219] font-[600] font-sfpro
            text-[22px] md:text-[28px] lg:text-[32px]
            leading-[30px] md:leading-[36px] lg:leading-[40px]"
        >
            {t("impressum.privacy5Title")}
        </h2>

        <p 
            className="text-[#132219] whitespace-pre-line font-sfpro
            text-[16px] md:text-[18px] lg:text-[20px]
            leading-[26px] md:leading-[30px] lg:leading-[32px]"
        >
{t("impressum.privacy5Text")}
        </p>
    </div>

</div>

            </div>
            
        </div>
    );
}
