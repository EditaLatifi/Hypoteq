"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState } from "react";

export default function ContactPage() {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    phone: "",
    inquiryType: "",
    message: ""
  });

  const [errors, setErrors] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    inquiryType: "",
    message: ""
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://assets.calendly.com/assets/external/widget.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    // Swiss phone format: +41 or 0, then 9 digits (allowing spaces/dashes)
    const phoneRegex = /^(\+41|0)[0-9\s\-]{9,}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors = {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      inquiryType: "",
      message: ""
    };

    // Validate required fields
    if (!formData.firstName.trim()) {
      newErrors.firstName = "Vorname ist erforderlich";
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = "Nachname ist erforderlich";
    }
    if (!formData.email.trim()) {
      newErrors.email = "E-Mail ist erforderlich";
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Bitte geben Sie eine gültige E-Mail-Adresse ein";
    }
    if (!formData.phone.trim()) {
      newErrors.phone = "Telefonnummer ist erforderlich";
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = "Bitte geben Sie eine gültige Schweizer Telefonnummer ein";
    }
    if (!formData.inquiryType) {
      newErrors.inquiryType = "Bitte wählen Sie eine Anfrageart";
    }
    if (!formData.message.trim()) {
      newErrors.message = "Nachricht ist erforderlich";
    }

    setErrors(newErrors);

    // Check if there are any errors
    const hasErrors = Object.values(newErrors).some(error => error !== "");
    if (hasErrors) {
      return;
    }

    // Submit form to API
    setIsSubmitting(true);
    
    fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert("✅ Ihre Nachricht wurde erfolgreich gesendet! Wir melden uns in Kürze bei Ihnen.");
          setFormData({
            firstName: "",
            lastName: "",
            company: "",
            email: "",
            phone: "",
            inquiryType: "",
            message: ""
          });
        } else {
          alert("❌ Fehler beim Senden: " + (data.error || "Unbekannter Fehler"));
        }
      })
      .catch(error => {
        console.error("Contact form error:", error);
        alert("❌ Serverfehler. Bitte versuchen Sie es später erneut.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

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
        <div className="w-full md:w-[628px] bg-[#D9FF8F] rounded-[10px] border border-[#000] p-[20px] sm:p-[24px] flex flex-col gap-[20px] sm:gap-[24px]">
          <h3 className="text-[28px] sm:text-[32px] md:text-[36px] font-[500] leading-[140%] tracking-[-0.36px]">
            {t("contact.faqSubtitle")}
          </h3>

          <p className="text-[17px] sm:text-[18px] md:text-[20px] leading-[140%] font-[400]">
            {t("contact.faqDescription")} {" "}
<Link
  href={`/${pathLocale}/faq`}
  className="font-medium underline underline-offset-[2px] decoration-solid hover:text-[#CAF476] transition-colors duration-200"
>
              {t("contact.faqButton")}
</Link>{" "}
            

          </p>

          <Link href={`/${pathLocale}/faq`} className="w-fit">
            <button className="bg-[#132219] text-[#CAF476] rounded-full px-[24px] py-[10px] sm:py-[8px] text-[16px] font-[600] hover:opacity-80 transition min-h-[44px] sm:min-h-auto">
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

          <form className="flex flex-col gap-[16px]" onSubmit={handleSubmit}>

            {/* First Name */}
            <div className="flex flex-col gap-1">
              <input 
                type="text" 
                placeholder="Vorname *"
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                className={`w-full h-[50px] border ${errors.firstName ? 'border-red-500' : 'border-[#132219]'} rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none`} 
              />
              {errors.firstName && <span className="text-red-500 text-sm px-6">{errors.firstName}</span>}
            </div>

            {/* Last Name */}
            <div className="flex flex-col gap-1">
              <input 
                type="text" 
                placeholder="Nachname *"
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                className={`w-full h-[50px] border ${errors.lastName ? 'border-red-500' : 'border-[#132219]'} rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none`} 
              />
              {errors.lastName && <span className="text-red-500 text-sm px-6">{errors.lastName}</span>}
            </div>

            {/* Company (optional) */}
            <input 
              type="text" 
              placeholder="Firmenname (optional)"
              value={formData.company}
              onChange={(e) => handleInputChange("company", e.target.value)}
              className="w-full h-[50px] border border-[#132219] rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none" 
            />

            {/* Email */}
            <div className="flex flex-col gap-1">
              <input 
                type="email" 
                placeholder={`${t("contact.email")} *`}
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className={`w-full h-[50px] border ${errors.email ? 'border-red-500' : 'border-[#132219]'} rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none`} 
              />
              {errors.email && <span className="text-red-500 text-sm px-6">{errors.email}</span>}
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1">
              <input 
                type="text" 
                placeholder={`${t("contact.phone")} *`}
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                className={`w-full h-[50px] border ${errors.phone ? 'border-red-500' : 'border-[#132219]'} rounded-full px-6 text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none`} 
              />
              {errors.phone && <span className="text-red-500 text-sm px-6">{errors.phone}</span>}
            </div>

            {/* Inquiry Type */}
            <div className="flex flex-col gap-1">
              <div className="relative">
                <select 
                  value={formData.inquiryType}
                  onChange={(e) => handleInputChange("inquiryType", e.target.value)}
                  className={`w-full h-[50px] border ${errors.inquiryType ? 'border-red-500' : 'border-[#132219]'} rounded-full px-6 text-[16px] font-medium text-[#132219]/70 bg-white outline-none appearance-none`}
                >
                  <option value="">Anfrageart auswählen *</option>
                  <option value="general">Allgemeine Anfrage</option>
                  <option value="partnership">Partnerschaft</option>
                  <option value="financing">Finanzierung</option>
                </select>

                <svg className="absolute right-6 top-1/2 -translate-y-1/2 w-[12px] h-[7px] fill-[#132219]/70 pointer-events-none"
                  viewBox="0 0 12 7">
                  <path d="M6 7L0 0.71875L0.28125 0L6 5.28125L11.7188 0L12 0.71875L6 7Z" />
                </svg>
              </div>
              {errors.inquiryType && <span className="text-red-500 text-sm px-6">{errors.inquiryType}</span>}
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1">
              <textarea 
                placeholder={`${t("contact.message")} *`}
                value={formData.message}
                onChange={(e) => handleInputChange("message", e.target.value)}
                className={`w-full h-[120px] border ${errors.message ? 'border-red-500' : 'border-[#132219]'} rounded-[10px] px-[24px] py-[8px] text-[16px] font-medium text-[#132219]/70 placeholder:text-[#132219]/70 outline-none resize-none`} 
              />
              {errors.message && <span className="text-red-500 text-sm px-6">{errors.message}</span>}
            </div>

            <div className="flex justify-end">
              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-[170px] px-[24px] py-[8px] rounded-full border border-[#132219] text-[#132219] text-[16px] font-medium opacity-70 hover:opacity-100 transition disabled:opacity-40 disabled:cursor-not-allowed">
                {isSubmitting ? "Senden..." : t("contact.submit")}
              </button>
            </div>

          </form>
        </div>

        {/* RIGHT SIDE – BOOK CALL */}
        <div className="flex flex-col w-full max-w-[629px] gap-[24px] mt-[80px] lg:mt-0">
          <h3 className="text-[28px] md:text-[36px] font-normal leading-[40px] md:leading-[50px]">
            {t("buttons.bookAppointment")}
          </h3>

          <div className="w-full h-[420px] md:h-[530px] border border-[#132219] rounded-[10px] overflow-hidden">
            <div className="calendly-inline-widget" data-url="https://calendly.com/hypoteq/hypoteq-intro-call" style={{minWidth: '320px', height: '100%'}}></div>
          </div>
        </div>

      </div>

      {/* ===== MAP ===== */}
      <div className="w-full max-w-[1300px] px-[16px] md:px-[10px] mt-[80px] md:mt-[140px] rounded-[10px] overflow-hidden border border-[#132219]/10">
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2701.903054835955!2d8.533314476619616!3d47.374810571169505!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47900a05ce8582db%3A0x8227a52e01443909!2sL%C3%B6wenstrasse%2029%2C%208001%20Z%C3%BCrich%2C%20Switzerland!5e0!3m2!1sen!2s!4v1764146163573!5m2!1sen!2s"
          width="100%"
          height="300"
          className="md:h-[450px]"
          style={{ border: 0 }}
          loading="lazy"
        ></iframe>
      </div>

    </section>
  );
}
