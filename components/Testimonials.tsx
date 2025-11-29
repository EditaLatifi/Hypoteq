"use client";
import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

interface TestimonialItem {
  id: number;
  name: string;
  date: string;
  image: string;
  text: string;
}

const Testimonials: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const visibleCount = 3; // desktop stays same
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

  const testimonials: TestimonialItem[] = [
    { id: 1, name: "Anna Schmidt", date: "07.10.2025", image: "/images/testimonial-1.svg", text: t("testimonials.testimonial1") },
    { id: 2, name: "Martin Müller", date: "19.4.2023", image: "/images/testimonial-2.svg", text: t("testimonials.testimonial2") },
    { id: 3, name: "Clara Wagner", date: "09.12.2025", image: "/images/testimonial-3.svg", text: t("testimonials.testimonial3") },
    { id: 4, name: "Jonas Becker", date: "15.01.2024", image: "/images/testimonial-4.svg", text: t("testimonials.testimonial4") },
    { id: 5, name: "Laura Hoffmann", date: "28.02.2024", image: "/images/testimonial-5.svg", text: t("testimonials.testimonial5") },
    { id: 6, name: "Stefan Bauer", date: "05.03.2025", image: "/images/testimonial-6.svg", text: t("testimonials.testimonial6") },
  ];

  const nextSlide = () => {
    if (currentIndex < testimonials.length - visibleCount) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const prevSlide = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  return (
    <section className="w-full flex flex-col items-center bg-white py-[60px] md:py-[80px] lg:py-[100px] mt-[48px] md:mt-[60px] lg:mt-[80px] mb-[60px] md:mb-[90px] lg:mb-[116px] overflow-hidden">

      {/* Title */}
      <div className="w-full max-w-[1274px] px-[20px] md:px-[40px] lg:px-1 flex flex-col md:flex-row justify-between items-start mb-[40px] md:mb-[48px] lg:mb-[56px]">

        <div>
          <h2 className="text-[#132219] text-[28px] md:text-[36px] lg:text-[40px] font-[500]">
            {t("testimonials.title")}
          </h2>
        </div>

        {/* Arrows */}
        <div className="flex gap-[12px] mt-[24px] md:mt-[8px] self-start md:self-auto">
          <button
            onClick={prevSlide}
            disabled={currentIndex === 0}
            className={`w-[36px] h-[36px] rounded-full bg-[#132219] flex items-center justify-center transition ${
              currentIndex === 0 ? "opacity-40 cursor-not-allowed" : "hover:opacity-80"
            }`}
          >
            <ChevronLeft size={20} color="#fff" />
          </button>

          <button
            onClick={nextSlide}
            disabled={currentIndex >= testimonials.length - visibleCount}
            className={`w-[36px] h-[36px] rounded-full bg-[#132219] flex items-center justify-center transition ${
              currentIndex >= testimonials.length - visibleCount
                ? "opacity-40 cursor-not-allowed"
                : "hover:opacity-80"
            }`}
          >
            <ChevronRight size={20} color="#fff" />
          </button>
        </div>
      </div>

      {/* Slider */}
<div className="w-full max-w-[1274px] px-[20px] md:px-[40px] lg:px-2">
        <div
          className="flex gap-[16px] md:gap-[20px] transition-transform duration-500 ease-in-out"

          style={{
            transform: `translateX(-${
              currentIndex * (typeof window !== 'undefined' && window.innerWidth < 768 ? 300 : 409 + 20)
            }px)`,
          }}
        >
          {testimonials.map((t) => (
            <div
              key={t.id}
              className="flex flex-col items-start gap-[20px] md:gap-[24px] lg:gap-[30px] 
              w-[calc(100vw-60px)] md:w-[340px] lg:w-[409px] 
              min-w-[260px] md:min-w-[340px] lg:min-w-[409px] 
              rounded-[10px] bg-[#E2E2E2]
              p-[20px] md:p-[22px] lg:p-[24px] shadow-lg flex-shrink-0"
            >
              {/* Header */}
              <div className="flex items-center gap-[10px] md:gap-[12px]">
                <img
                  src={t.image}
                  alt={t.name}
                  className="w-[42px] h-[42px] md:w-[48px] md:h-[48px] rounded-full object-cover"
                />
                <h3 className="text-[16px] md:text-[18px] lg:text-[20px] font-[600] text-[#000]">
                  {t.name}
                </h3>
              </div>

              {/* Text */}
              <p className="text-[14px] md:text-[17px] lg:text-[20px] leading-[150%] text-[#000]/80">
                {t.text}
              </p>

              {/* Date */}
              <p className="text-[13px] md:text-[15px] lg:text-[17px] text-[#000]/70 font-light">
                {t.date}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
