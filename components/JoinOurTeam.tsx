"use client";

import React from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { usePathname } from "next/navigation";

const jobs = [
  {
    title: "joinOurTeam.jobs.0.title",
    subtext: "joinOurTeam.jobs.0.subtext",
    description: "joinOurTeam.jobs.0.description",
  },
  // Add more jobs here as needed, using translation keys
];

const JoinOurTeam: React.FC = () => {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section className="py-20 bg-white">
      <div className="w-full max-w-[1579px] mx-auto px-[20px] md:px-[60px] lg:px-[100px]">
        <div className="mb-16 flex flex-col md:flex-row lg:flex-row justify-between items-start gap-6 md:gap-8 lg:gap-10">
          <h2
            style={{
              color: "#132219",
              fontFamily: "SF Pro Display",
              fontSize: isMobile ? "32px" : "40px",
              fontWeight: 500,
              lineHeight: "120%",
              letterSpacing: "-0.4px",
            }}
          >
            {t("joinOurTeam.header")}
          </h2>
          <p
            style={{
              color: "#132219",
              fontFamily: "SF Pro Display",
              fontSize: isMobile ? "18px" : "24px",
              fontWeight: 400,
              lineHeight: "140%",
              maxWidth: "628px",
            }}
          >
            {t("joinOurTeam.paragraph1")}
            <br />
            {t("joinOurTeam.paragraph2")}
            <br />
            {t("joinOurTeam.paragraph3")}
          </p>
        </div>
        <div className="flex flex-col gap-6">
          {jobs.map((job, index) => (
            <div
              key={index}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              className="flex rounded-[10px] border border-[#132219] w-full transition-all duration-300 flex-wrap"
              style={{
                padding: isMobile ? "20px" : "24px",
                background:
                  hovered === index
                    ? "linear-gradient(270deg, #CAF476 0%, #E0F4BF 100%)"
                    : "#FFFFFF",
                flexDirection: isMobile ? "column" : "row",
                gap: isMobile ? "16px" : "32px",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  width: isMobile ? "100%" : "493px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                  <h3
                    style={{
                      fontFamily: "SF Pro Display",
                      color: "#132219",
                      fontSize: isMobile ? "20px" : "24px",
                      fontWeight: 500,
                      lineHeight: "140%",
                    }}
                  >
                    {t(`joinOurTeam.jobs.${index}.title`)}
                  </h3>

                  <p
                    style={{
                      fontFamily: "SF Pro Display",
                      color: "#132219",
                      fontSize: isMobile ? "14px" : "18px",
                      fontWeight: 400,
                      lineHeight: "140%",
                    }}
                  >
                    {t(`joinOurTeam.jobs.${index}.subtext`).split("\n").map((line: string, i: number) => (
                      <React.Fragment key={i}>
                        {line}
                        <br />
                      </React.Fragment>
                    ))}
                  </p>
              </div>
              <div
                style={{
                  width: isMobile ? "100%" : "591px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <p
                  style={{
                    fontFamily: "SF Pro Display",
                    color: "#132219",
                    fontSize: isMobile ? "14px" : "18px",
                    fontWeight: 400,
                    lineHeight: "140%",
                    marginBottom: isMobile ? "16px" : "32px",
                  }}
                >
                    {t(`joinOurTeam.jobs.${index}.description`)}
                </p>
                <a
                  href="https://www.linkedin.com/company/hypoteq-ag/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ width: "100%" }}
                >
                  <button
                    className="font-sfpro"
                    style={{
                      width: "100%",
                      alignSelf: "stretch",
                      textAlign: "center",
                      border: "1px solid #000",
                      borderRadius: "58px",
                      padding: isMobile ? "6px 16px" : "8px 20px",
                      fontSize: isMobile ? "14px" : "18px",
                      fontWeight: 600,
                      color: "#132219",
                      background: "transparent",
                      transition: "all 0.3s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#132219";
                      e.currentTarget.style.color = "#CAF476";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#132219";
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = "scale(0.98)";
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    {t("joinOurTeam.applyButton")}
                  </button>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default JoinOurTeam;
