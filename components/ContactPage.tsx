"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function ContactPage() {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  return (
    <section className="flex flex-col items-center mb-[200px] bg-white py-[60px] md:py-[120px] px-4 md:px-[116px] text-[#132219] font-['SF Pro Display']">

      {/* ===== TITLE ===== */}
      <div className="w-full max-w-[1300px] mx-auto">
        <h1 className="text-[36px] md:text-[62px] font-medium leading-none mb-[48px]">
          {t("contact.title")}
        </h1>
      </div>

      {/* ===== TWO BOXES (FAQ & Beratung) ===== */}
<div className="flex flex-col md:flex-row justify-start items-stretch w-full max-w-[1300px] gap-[14px] mx-auto">


        {/* LEFT BOX – FAQ */}
        <div className="w-full md:w-[628px] bg-[#D9FF8F] rounded-[10px] border border-[#000] p-[24px] flex flex-col gap-[24px]">
          <h3 className="text-[36px] font-[500] leading-[140%] tracking-[-0.36px]">
            {t("contact.faqSubtitle")}
          </h3>

          <p className="text-[20px] leading-[140%] font-[400]">
            {t("contact.faqDescription")} {" "}
<Link
  href={`/${pathLocale}/faq`}
  className="font-medium underline underline-offset-[2px] decoration-solid hover:text-[#CAF476] transition-colors duration-200"
>
              {t("contact.faqButton")}
</Link>{" "}
            

          </p>

          <Link href={`/${pathLocale}/faq`} className="w-fit">
            <button className="bg-[#132219] text-[#CAF476] rounded-full px-[24px] py-[8px] text-[16px] font-[600] hover:opacity-80 transition">
              {t("contact.faqButton")}
            </button>
          </Link>
        </div>

{/* RIGHT BOX – Persönliche Beratung */}
<div className="w-full md:w-[628px] bg-[#0B1C14] rounded-[10px] border border-[#000] p-[24px] 
            flex flex-col justify-between">

  {/* TOP content */}
  <div className="flex flex-col gap-[24px]">
    <h3 className="text-[36px] font-[500] leading-[140%] tracking-[-0.36px] mb-[100px] text-[#CAF476]">
      {t("contact.consultationTitle")}
    </h3>

    <p className="text-[20px] leading-[140%] font-[400] mt[20px] text-[#CAF476]">
      {t("contact.consultationDescription")}
    </p>
  </div>

  {/* EMPTY SPACER — pushes the text to bottom */}
  <div className="h-[1px]"></div>

</div>



      </div>

      {/* ===== RIGHT-SIDE TEXT (PARAGRAPH) ===== */}
      <div className="w-full max-w-[1300px] mx-auto mt-[48px]">
  
      </div>

      {/* ===== FORM + CALL ===== */}
      <div className="flex flex-col lg:flex-row justify-center items-start w-full max-w-[1300px] gap-[60px] md:gap-[108px] mx-auto mt-[100px] md:mt-[160px] px-[10px] md:px-[10px]">

        {/* LEFT SIDE – FORM */}
        <div className="flex flex-col w-full max-w-[700px] gap-[24px]">
          <div className="relative">
            <span className="block md:absolute md:top-[-84px] left-0 text-[#132219] text-[32px] md:text-[48px] font-[500] leading-[100%] tracking-[-0.48px] mb-2">
              {t("consultation.title")}
            </span>

            <h3 className="text-[28px] mt-4 md:text-[36px] font-normal leading-[40px] md:leading-[50px]">
              {t("consultation.description")}
            </h3>
          </div>

          <form className="flex flex-col gap-[16px]">

            <input type="text" placeholder={t("contact.email")} // adapt keys if needed
              className="w-full h-[50px] border border-[#132219] rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none" />

            <input type="text" placeholder="Nachname"
              className="w-full h-[50px] border border-[#132219] rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none" />

            <input type="text" placeholder="Firmenname (optional)"
              className="w-full h-[50px] border border-[#132219] rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none" />

            <input type="email" placeholder={t("contact.email")}
              className="w-full h-[50px] border border-[#132219] rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none" />

            <input type="text" placeholder={t("contact.phone")}
              className="w-full h-[50px] border border-[#132219] rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none" />

            {/* Inquiry Type */}
            <div className="relative">
              <select className="w-full h-[50px] border border-[#132219] rounded-full px-6 text-[16px] font-medium text-[#132219]/70 bg-white outline-none appearance-none">
                <option>{t("contact.message")}</option>
                <option>General Inquiry</option>
                <option>Partnership</option>
                <option>Financing</option>
              </select>

              <svg className="absolute right-6 top-1/2 -translate-y-1/2 w-[12px] h-[7px] fill-[#132219]/70 pointer-events-none"
                viewBox="0 0 12 7">
                <path d="M6 7L0 0.71875L0.28125 0L6 5.28125L11.7188 0L12 0.71875L6 7Z" />
              </svg>
            </div>

            <textarea placeholder={t("contact.message")}
              className="w-full h-[120px] border border-[#132219] rounded-[10px] px-[24px] py-[8px] text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none resize-none" />

            <div className="flex justify-end">
              <button type="submit"
                className="w-[170px] px-[24px] py-[8px] rounded-full border border-[#132219] text-[#132219] text-[16px] font-medium opacity-70 hover:opacity-100 transition">
                {t("contact.submit")}
              </button>
            </div>

          </form>
        </div>

        {/* RIGHT SIDE – BOOK CALL */}
        <div className="flex flex-col w-full max-w-[629px] gap-[24px] mt-[80px] lg:mt-0">
          <h3 className="text-[28px] md:text-[36px] font-normal leading-[40px] md:leading-[50px]">
            {t("buttons.bookAppointment")}
          </h3>

          <div className="w-full h-[420px] md:h-[480px] border border-[#132219] rounded-[10px] overflow-hidden flex items-center justify-center">
            <img src="/images/kalendly.png" className="w-full h-full object-contain" alt="Calendly" />
          </div>
        </div>

      </div>

      {/* ===== MAP ===== */}
      <div className="w-full max-w-[1300px] px-[40px] md:px-[10px] mt-[100px] md:mt-[140px] rounded-[10px] overflow-hidden border border-[#132219]/10">
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2701.903054835955!2d8.533314476619616!3d47.374810571169505!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47900a05ce8582db%3A0x8227a52e01443909!2sL%C3%B6wenstrasse%2029%2C%208001%20Z%C3%BCrich%2C%20Switzerland!5e0!3m2!1sen!2s!4v1764146163573!5m2!1sen!2s"
          width="100%"
          height="450"
          style={{ border: 0 }}
          loading="lazy"
        ></iframe>
      </div>

    </section>
  );
}
