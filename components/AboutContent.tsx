"use client";
import { useState } from "react";
import Image from "next/image";

export default function AboutSection() {
const [active, setActive] = useState("");


  const buttons = [
    { id: "dna", label: "Unsere DNA" },
    { id: "team", label: "Unser Team" },
    { id: "join", label: "Werde Teil von HYPOTEQ" },
    
  ];

  const handleClick = (id: string) => {
    setActive(id);
    const section = document.getElementById(id);
    if (section) {
      const offset = 120;
      const topPosition =
        section.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: topPosition, behavior: "smooth" });
    }
  };

  return (
<section className="relative w-full overflow-x-hidden font-sfpro min-h-[50vh]">
      {/* Background with Next.js Image */}
      <Image
        src="/images/8329269237.png"
        alt="About background"
        fill
        priority
        quality={85}
        sizes="100vw"
        className="object-cover -z-10"
      />

      {/* Content */}
<div
  className="
    relative z-10 w-full
    h-auto
    flex flex-col justify-start
    px-[24px] md:px-[60px] lg:px-[116px]
    pt-[100px] md:pt-[140px] lg:pt-[160px]
    pb-[20px]
    gap-[10px] text-[#132219]
    max-w-[1579px] mx-auto
  "
>

<div className="flex flex-col w-full">

          {/* Heading */}
          <div className="flex flex-col gap-[20px] md:gap-[24px]">
            <h2
              className="
                font-sfpro text-[#fff]
                text-[42px] md:text-[58px] lg:text-[72px] 
                leading-[110%] md:leading-[105%] lg:leading-[100%] 
                font-medium tracking-[-0.02em]
              "
            >
              Über uns
            </h2>

            <p className="font-sfpro 
              text-[18px] md:text-[21px] lg:text-[24px] 
              font-medium leading-[150%] md:leading-[140%] text-[#fff]">
              Einfach. Klar. Unabhängig. – Das ist HYPOTEQ.
            </p>
          </div>

          {/* Description */}
          <div className="mt-[32px] md:mt-[40px] lg:mt-[55px]">
            <p
              className="
                font-sfpro text-white 
                text-[16px] md:text-[20px] lg:text-[24px] 
                font-light leading-[160%] md:leading-[150%] lg:leading-[140%]
                text-left md:text-left
              "
            >
              Wir sind dein Partner für smarte Immobilienfinanzierung in der <br />
              Schweiz.<br />
              Mit unserer digitalen Plattform erhältst du Zugang zu einer Vielzahl <br />
              geprüfter Finanzierungspartner.<br />
              Wir helfen dir, Hypothekenangebote einfacher zu verstehen und <br />
              fundierte Entscheidungen zu treffen.<br />
              Mit strukturierten Prozessen und persönlichem Support begleiten wir<br />
              dich durch die wichtigsten Schritte deiner Finanzierung.<br />
              Du behältst den Überblick – wir unterstützen im Hintergrund.<br />
              Keine versteckten Kosten, keine Verpflichtung – dafür Transparenz <br />
              und Effizienz.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-[20px] md:gap-[24px] mt-[24px] md:mt-[32px] lg:mt-[40px]">

            {/* Row 1 */}
            <div className="flex flex-wrap gap-[12px] mt-[20px] md:mt-[32px] lg:mt-[46px] justify-start">
              {buttons.slice(0, 2).map((btn) => {
                const isActive = active === btn.id;
                return (
                  <button
                    key={btn.id}
                    onClick={() => handleClick(btn.id)}
                    className={`
                      font-sfpro 
                      text-[16px] md:text-[18px] lg:text-[20px] 
                      font-semibold 
                      px-[20px] md:px-[24px] lg:px-[28px] 
                      py-[10px]
                      rounded-[45px] border border-[#fff]
                      transition-all duration-300
                      w-auto
                      ${
                        isActive
                          ? "bg-[#CAF476] text-[#132219]"
                          : "bg-transparent hover:bg-[#CAF476]/60 text-[#fff]"
                      }
                    `}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>

            {/* Row 2 */}
            <div className="flex flex-wrap gap-[12px] justify-start">
              {buttons.slice(2).map((btn) => {
                const isActive = active === btn.id;
                return (
                  <button
                    key={btn.id}
                    onClick={() => handleClick(btn.id)}
                    className={`
                      font-sfpro 
                      text-[16px] md:text-[18px] lg:text-[20px] 
                      font-semibold 
                      px-[20px] md:px-[24px] lg:px-[28px] 
                      py-[10px]
                      rounded-[45px] border border-[#fff]
                      transition-all duration-300
                      w-auto
                      ${
                        isActive
                          ? "bg-[#CAF476] text-[#132219]"
                          : "bg-transparent hover:bg-[#CAF476]/60 text-[#fff]"
                      }
                    `}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
