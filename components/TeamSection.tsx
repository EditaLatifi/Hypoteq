"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

interface TeamMember {
  name: string;
  position?: string;
  image?: string;
  bgColor?: string;
  description?: string;

  linkedin?: string;
  email?: string;
}
const teamMembers: TeamMember[] = [
  {
    name: "Marco Circelli",
    position: "team.positions.ceo",
    image: "/images/HYPOTEQ_about_team_marco.png",
    linkedin: "https://www.linkedin.com/in/marco-circelli-a1b9172/",
    email: "mailto:marco.circelli@hypoteq.ch",
  },

  {
    name: "Davide Iuorno",
    position: "team.positions.deputyCeo",
    image: "/images/HYPOTEQ_about_team_davide.png",
    linkedin: "https://www.linkedin.com/in/davide-iuorno/",
    email: "mailto:davide.iuorno@hypoteq.ch",
  },

  {
    name: "Fisnik Salihu",
    position: "team.positions.cto",
    image: "/images/HYPOTEQ_about_team_fisnik.png",
    linkedin: "https://www.linkedin.com/in/fisnik-salihu/",
    email: "mailto:fisnik.salihu@hypoteq.ch",
  },

  {
    name: "Alexander von Arx",
    position: "team.positions.headOfBusinessDevelopment",
    image: "/images/HYPOTEQ_about_team_alexander.png",
    linkedin: "https://www.linkedin.com/in/alexander-von-arx-66a416326/",
    email: "mailto:alexander.vonarx@hypoteq.ch",
  },

  {
    name: "Claudio Schneider",
    position: "team.positions.boardPresident",
    image: "/images/HYPOTEQ_about_team_claudio.png",
    linkedin: "https://www.linkedin.com/in/schneider-claudio/",
  },

  {
    name: "Christian Neff",
    position: "team.positions.boardMember",
    image: "/images/HYPOTEQ_about_team_christian.png",
    linkedin: "https://www.linkedin.com/in/christianneff/",
    email: "mailto:christian.neff@hypoteq.ch",
  },

  {
    name: "Cyril Kägi",
    position: "team.positions.initiatorAndAdvisory",
    image: "/images/HYPOTEQ_about_team_cyril.png",
    linkedin: "https://www.linkedin.com/in/cyril-k%C3%A4gi-273a1965/",
    email: "mailto:cyril.kaegi@hypoteq.ch",
  },

  {
    name: "Christian Wyss",
    position: "team.positions.advisoryAndSalesCoach",
    image: "/images/HYPOTEQ_about_team_christianw.png",
    linkedin: "https://www.linkedin.com/in/wyssch/",
    email: "mailto:christian.wyss@hypoteq.ch",
  },

  {
    name: "Markus Abeler",
    position: "team.positions.consultant",
    image: "/images/HYPOTEQ_about_team_markus.png",
    linkedin: "https://www.linkedin.com/in/abelermarkus/",
    email: "mailto:markus.abeler@hypoteq.ch",
  },

  {
    name: "HYPOTEQ",
    bgColor: "#CAF476",
    description: "team.linkedinDescription",
  },
];


const TeamSection: React.FC = () => {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  
  return (
    <section className="w-full flex flex-col items-center py-[120px] bg-white font-sfpro">
      <div className="w-full max-w-[1490px] px-[20px] lg:px-[116px] mx-auto">

        <h2 className="text-[40px] font-medium text-[#132219] mb-[60px]">
          {t("team.title")}
        </h2>

        <div
          className="
            grid grid-cols-4 gap-x-[40px] gap-y-[80px]
            justify-items-start
            max-xl:grid-cols-3
            max-lg:grid-cols-2
            max-md:grid-cols-1
          "
        >
          {teamMembers.map((member, index) => (
            <div
              key={index}
              className="flex flex-col items-start w-full"
            >
              {member.bgColor ? (
                <div
                  className="flex flex-col justify-between lg:w-[970px] h-[340px] rounded-[10px]"
                  style={{
                    backgroundColor: "#CAF476",
                    padding: "14px 24px",
                  }}
                >
                  <p className="text-[#132219] text-[32px] leading-[120%] font-normal font-sfpro">
                    {member.description ? t(member.description as any) : member.description}
                  </p>

                  <div className="flex justify-center lg:justify-start pt-[20px]">
                    <a
                      href="https://www.linkedin.com/company/hypoteq-ag/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="
                        inline-block
                        w-fit
                        border border-[#132219] rounded-[58px] 
                        bg-[#CAF476] text-[#132219]
                        transition-all duration-300
                        hover:bg-[#dffb9b]
                      "
                      style={{
                        fontSize: "20px",
                        lineHeight: "120%",
                        padding: "8px 24px",
                      }}
                    >
                      {t("team.findBestOffer")}
                    </a>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-[10px] overflow-hidden w-full h-[283px]"
                  style={{
                    backgroundImage: `url(${member.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                ></div>
              )}

              {!member.bgColor && (
                <div className="mt-4 w-full flex flex-col gap-[10px]">

                  {/* Name + LinkedIn */}
                  <div className="flex items-center justify-between w-full">
                    <h3
                      className="text-[#132219] text-[20px] font-semibold leading-[24px] 
                                 border border-black rounded-[42px] px-[12px] py-[4px]"
                    >
                      {member.name}
                    </h3>

                    {member.linkedin ? (
                      <a
                        href={member.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="
                          flex justify-center items-center
                          w-[42px] h-[42px]
                          rounded-full border border-black
                          bg-white hover:bg-gray-100 transition
                        "
                      >
                        <img
                          src="/images/HYPOTEQ_about_social_linkedin.svg"
                          alt="LinkedIn"
                          className="w-[18px] h-[18px]"
                        />
                      </a>
                    ) : (
                      <div
                        className="
                          flex justify-center items-center
                          w-[42px] h-[42px]
                          rounded-full border border-black opacity-40
                        "
                      >
                        <img
                          src="/images/HYPOTEQ_about_social_linkedin.svg"
                          alt="LinkedIn"
                          className="w-[18px] h-[18px]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Position + Email */}
                  <div className="flex items-center justify-between w-full">
                    <p
                      className="text-[#132219] text-[16px] font-light leading-[22px] 
                                border border-black rounded-[42px] px-[12px] py-[4px]"
                    >
                      {t(member.position as any)}
                    </p>

                    {member.email ? (
                      <a
                        href={member.email}
                        className="
                          flex justify-center items-center
                          w-[42px] h-[42px]
                          rounded-full border border-black
                          bg-white hover:bg-gray-100 transition
                        "
                      >
                        <img
                          src="/images/HYPOTEQ_about_social_email.svg"
                          alt="Email"
                          className="w-[18px] h-[18px]"
                        />
                      </a>
                    ) : (
                      <div
                        className="
                          flex justify-center items-center
                          w-[42px] h-[42px]
                          rounded-full border border-black opacity-40
                        "
                      >
                        <img
                          src="/images/HYPOTEQ_about_social_email.svg"
                          alt="Email"
                          className="w-[18px] h-[18px]"
                        />
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TeamSection;
