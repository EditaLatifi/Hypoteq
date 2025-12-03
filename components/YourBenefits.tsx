"use client";
import Image from "next/image";
import "keen-slider/keen-slider.min.css";
import { useKeenSlider } from "keen-slider/react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function YourBenefits() {
  const [sliderRef] = useKeenSlider({
    slides: { perView: 3, spacing: 32 },
    loop: true,
  });

  const cards = [
    {
      img: "/images/benefit1.png",
      title: "Quick access to the best offer",
    },
    {
      img: "/images/benefit2.png",
      title: "Transparency",
    },
    {
      img: "/images/benefit3.png",
      title: "Easy home Ownership",
    },
  ];

  return (
    <>
      {/* Section 1: Your Benefits + Hypoteq */}
      <section className="w-full px-[116px]py-[100px] bg-white">
        {/* Header */}
        <div className="flex items-start gap-[164px] mb-[75px]">
          <h2
            className="w-[483px] font-sfpro text-[#132219] font-bold"
            style={{ fontSize: "48px", lineHeight: "50px" }}
          >
            Your Benefits
          </h2>
        </div>

        {/* Slider */}
        <div ref={sliderRef} className="keen-slider mb-[120px]">
          {cards.map((card, idx) => (
            <div
              key={idx}
              className="keen-slider__slide relative flex flex-col justify-end w-[445px] h-[760px] rounded-[10px] overflow-hidden"
            >
              {/* Background Image */}
              <Image
                src={card.img}
                alt={card.title}
                fill
                className="object-cover object-[center_5%] rounded-[10px]"
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent rounded-[10px]" />

              {/* Text + Arrow */}
              <div className="relative z-10 flex justify-between items-center w-full px-[32px] pb-[32px]">
                <p className="text-white font-sfpro text-[24px] font-medium">
                  {card.title}
                </p>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M9 6L15 12L9 18"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>

        {/* Hypoteq AG Section */}
        <div className="flex flex-col gap-[74px]">
          {/* Title + Paragraph in one row */}
          <div className="flex items-start gap-[144px]">
            <h2
              className="w-[463px] font-sfpro text-[#132219] font-bold"
              style={{ fontSize: "48px", lineHeight: "50px" }}
            >
              Hypoteq AG
            </h2>

            <div className="ml-auto max-w-[766px]">
              <p
                className="text-[#656565] font-sfpro font-medium"
                style={{ fontSize: "24px", lineHeight: "32px" }}
              >
                HYPOTEQ AG is your independent partner for the optimal financing
                of your property. Thanks to our strong network of lenders, we
                compare the best mortgage offers for you and find the right
                solution – quickly, easily and at top conditions.
                <br />
                <br />
                Whether you are looking for a new mortgage or want to optimize
                your existing financing, our experts are at your side with
                personal advice. Start your request now and benefit from our
                experience!
              </p>
            </div>
          </div>

          {/* Image */}
          <div className="relative w-full h-[789px] rounded-[10px] overflow-hidden">
            <Image
              src="/images/HYPOTEQ_layout_logo.png"
              alt="Hypoteq AG"
              fill
              className="object-cover object-top rounded-[10px]"
            />
          </div>
        </div>
      </section>

      {/* Section 2: Finance Form */}
      <section className="w-full bg-white font-sfpro">
        <div className="w-full max-w-[1820px] mx-auto px-[116px]py-[116px]">
          {/* Header */}
          <div className="flex items-start gap-[164px] mb-[75px]">
            <h2
              className="w-[483px] font-sfpro text-[#132219] font-bold"
              style={{ fontSize: "48px", lineHeight: "50px" }}
            >
              Neue Finanzierungsanfrage
            </h2>

            <p
              className="w-[766px] font-sfpro text-[#656565] ml-[165px]"
              style={{ fontSize: "24px", fontWeight: 500, lineHeight: "32px" }}
            >
              Füllen Sie bitte dieses Formular aus, damit HYPOTEC für Sie die
              Finanzierung durchführen kann. Dadurch können wir Ihnen rasch den
              Richtzins mitteilen und das weitere Vorgehen miteinander
              besprechen.
              <br />
              <br />
              Unterstützende Unterlagen für eine Finanzierungsanfrage:
              Checkliste für selbst bewohntes Wohneigentum, Checkliste für
              Renditeobjekte, Auskunftsermächtigung (durch Kunde zu
              unterzeichnen).
            </p>
          </div>

          {/* Form */}
          <form className="mt-[75px] grid grid-cols-2 font-sfpro gap-x-[16px] w-[1550px]">
            {/* Left column */}
            <div className="flex flex-col gap-[23px]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`left-${i}`}
                  className="flex items-center font-sfpro px-[24px] h-[65px] bg-[#F6F6F6] rounded-full"
                >
                  <input
                    type="text"
                    placeholder="Name"
                    className="bg-transparent w-full font-sfpro text-[#656565] placeholder-[#656565] text-[16px] font-medium focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-[23px]">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={`right-${i}`}
                  className="flex items-center font-sfpro px-[24px] h-[65px] bg-[#F6F6F6] rounded-full"
                >
                  <input
                    type="text"
                    placeholder="Name"
                    className="bg-transparent w-full font-sfpro text-[#656565] placeholder-[#656565] text-[16px] font-medium focus:outline-none"
                  />
                </div>
              ))}

              {/* Progress + Navigation */}
              <div className="flex justify-between items-center font-sfpro h-[65px]">
                <span className="text-[#848484] font-sfpro text-[16px] font-medium">
                  1/5
                </span>

                <div className="flex items-center gap-[24px]">
                  <button
                    type="button"
                    className="flex items-center gap-1 font-sfpro text-[#132219] text-[16px] hover:opacity-80 transition"
                  >
                    <ArrowLeft size={18} />
                    Back
                  </button>

                  <button
                    type="submit"
                    className="flex items-center gap-1 font-sfpro bg-[#C6F627] hover:bg-[#b4e822] text-[#132219] text-[16px] px-[24px] py-[12px] rounded-full font-bold transition"
                  >
                    Next
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
