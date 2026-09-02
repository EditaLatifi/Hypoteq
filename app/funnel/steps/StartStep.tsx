"use client";
import { useState, useEffect } from "react";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import FunnelHeading from "../FunnelHeading";

function StartStep({
  customerType,
  setCustomerType,
  clientData,
  setClientData,
  saveStep,
}: any) {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<ErrorFields>({});

  interface ErrorFields {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    zip?: string;
    ort?: string;
    partnerEmail?: string;
  }

  const validateDirectCustomer = () => {
    const newErrors: ErrorFields = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Swiss phone: allow +41, 0, spaces, dashes, min 9 digits
    const phoneRegex = /^((\+41|0)[\d\s\-]{8,})$/;

if (!clientData.firstName)
  newErrors.firstName = t("funnel.errorFirstName" as any);

if (!clientData.lastName)
  newErrors.lastName = t("funnel.errorLastName" as any);

if (!clientData.email) {
  newErrors.email = t("funnel.errorEmail" as any);
} else if (!emailRegex.test(clientData.email)) {
  newErrors.email = t("funnel.validEmailError" as any);
}

if (!clientData.phone) {
  newErrors.phone = t("funnel.errorPhone" as any);
} else if (!phoneRegex.test(clientData.phone)) {
  newErrors.phone = t("funnel.validPhoneError" as any);
}

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  // Default to direct (fix infinite re-render)
  useEffect(() => {
    if (!customerType) {
      setCustomerType("direct");
    }
  }, []);
  const { setEmail } = useFunnelStore();

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8 pt-[150px] lg:pt-0 lg:pl-20 lg:pr-32">
      <FunnelHeading
        title={t("funnel.startTitle" as any)}
        lead={t("funnel.startSubtitle" as any)}
      />

      {/* The mockup's two entry cards. Same two choices the step always offered — the
          partner banner and the private-customer heading — but as a choice you can see and
          change, rather than a button that switches the page and a paragraph that describes
          where you already are. Nothing about who is filling in the funnel changed; this is
          the same customerType, selected differently. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 md:mb-10">
        {[
          {
            key: "direct",
            title: t("funnel.privateCustomerTitle" as any),
            sub: t("funnel.privateCustomerDescription" as any),
          },
          {
            key: "partner",
            title: t("funnel.partnerTitle" as any),
            sub: t("funnel.partnerDescription" as any),
          },
        ].map((e) => {
          const active = customerType === e.key;
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => setCustomerType(e.key as any)}
              className="flex flex-col gap-2 text-left"
              style={{
                border: `1px solid ${active ? "var(--forest-800)" : "var(--paper-400)"}`,
                background: active ? "var(--lime-100)" : "#fff",
                borderRadius: "var(--radius-lg)",
                padding: "20px 22px",
                transition: "var(--transition-control)",
              }}
            >
              <span className="flex items-center justify-between gap-3">
                <span
                  style={{
                    fontSize: "var(--text-lead)",
                    fontWeight: "var(--weight-semibold)" as any,
                    color: "var(--fg-heading)",
                  }}
                >
                  {e.title}
                </span>
                <span
                  className="flex items-center justify-center flex-none"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    background: active ? "var(--lime-500)" : "transparent",
                    border: active ? "1px solid var(--forest-800)" : "1px solid var(--paper-400)",
                    color: "var(--forest-800)",
                    fontSize: 13,
                    fontWeight: "var(--weight-bold)" as any,
                  }}
                >
                  {active ? "✓" : ""}
                </span>
              </span>
              <span style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>
                {e.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* === DIRECT CUSTOMER FORM === */}
      {customerType === "direct" && (
        <>
          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 md:mb-7 lg:mb-8">
            <div>
              <label className="text-[14px] font-medium text-[#132219]">
                {t("funnel.firstName" as any)}
              </label>

              <input
                className={`w-full mt-1 rounded-full px-5 py-2 text-[#132219]
      border 
      ${errors.firstName ? "border-red-500" : "border-[#132219] opacity-80"}
    `}
                value={clientData.firstName}
                onChange={(e) => {
                  setClientData((p: any) => ({
                    ...p,
                    firstName: e.target.value,
                  }));
                  setErrors((prev: any) => ({ ...prev, firstName: "" })); // remove error when typing
                }}
              />

              {errors.firstName && (
                <p className="text-red-500 text-[12px] mt-1">
                  {errors.firstName}
                </p>
              )}
            </div>

            <div>
              <label className="text-[14px] font-medium text-[#132219]">
                {t("funnel.lastName" as any)}
              </label>

              <input
                className={`w-full mt-1 rounded-full px-5 py-2 text-[#132219]
      border 
      ${errors.lastName ? "border-red-500" : "border-[#132219] opacity-80"}
    `}
                value={clientData.lastName}
                onChange={(e) => {
                  setClientData((p: any) => ({
                    ...p,
                    lastName: e.target.value,
                  }));
                  setErrors((prev: any) => ({ ...prev, lastName: "" }));
                }}
              />

              {errors.lastName && (
                <p className="text-red-500 text-[12px] mt-1">
                  {errors.lastName}
                </p>
              )}
            </div>
          </div>

          {/* Row 2 */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <div>
              <label className="text-[14px] font-medium text-[#132219]">
                {t("funnel.email" as any)}
              </label>

              <input
                className={`w-full mt-1 rounded-full px-5 py-2 text-[#132219]
      border 
      ${errors.email ? "border-red-500" : "border-[#132219] opacity-80"}
    `}
                value={clientData.email}
                onChange={(e) => {
                  setClientData((p: any) => ({ ...p, email: e.target.value }));
                  setErrors((prev: any) => ({ ...prev, email: "" }));
                }}
              />

              {errors.email && (
                <p className="text-red-500 text-[12px] mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <label className="text-[14px] font-medium text-[#132219]">
                {t("funnel.phone" as any)}
              </label>

              <input
                className={`w-full mt-1 rounded-full px-5 py-2 text-[#132219]
      border 
      ${errors.phone ? "border-red-500" : "border-[#132219] opacity-80"}
    `}
                value={clientData.phone}
                onChange={(e) => {
                  setClientData((p: any) => ({ ...p, phone: e.target.value }));
                  setErrors((prev: any) => ({ ...prev, phone: "" }));
                }}
              />

              {errors.phone && (
                <p className="text-red-500 text-[12px] mt-1">{errors.phone}</p>
              )}
            </div>
          </div>

          {/* Footer */}
<div className="flex flex-row items-center justify-end w-full mt-0 gap-4">
            <button
              onClick={() => {
                if (!validateDirectCustomer()) return; // STOP if invalid
                setEmail(clientData.email);
                saveStep();
              }}
              className="px-8 py-2 mt-2 lg:mt-0 bg-[#CAF476] border border-[#132219] rounded-full text-[14px] font-medium text-[#132219]"
            >
              {t("funnel.startMortgageRequest" as any)}
            </button>
          </div>
        </>
      )}

      {/* === PARTNER FORM === */}
      {customerType === "partner" && (
        <>
          <div className="grid grid-cols-1 gap-10 mb-10">
            <div>
              <label className="text-[14px] font-medium text-[#132219]">
                {t("funnel.email" as any)}
              </label>
 <input
  className={`w-full mt-1 rounded-full px-5 py-2 text-[#132219]
    border 
    ${errors.partnerEmail ? "border-red-500" : "border-[#132219] opacity-80"}
  `}
  value={clientData.partnerEmail}
  onChange={(e) => {
    setClientData((p: any) => ({
      ...p,
      partnerEmail: e.target.value,
    }));
    setErrors((prev: any) => ({ ...prev, partnerEmail: "" }));
  }}
/>

{errors.partnerEmail && (
  <p className="text-red-500 text-[12px] mt-1">{errors.partnerEmail}</p>
)}

            </div>
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setCustomerType("direct")}
              className="px-8 py-2 rounded-full border border-[#132219] text-[#132219] hover:bg-[#F7F7F7]"
            >
              {t("funnel.backButtonText" as any)}
            </button>
            <button
        onClick={() => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!clientData.partnerEmail) {
    setErrors((prev: any) => ({ ...prev, partnerEmail: t("funnel.errorPartnerEmail" as any) }));
    return;
  }
  
  if (!emailRegex.test(clientData.partnerEmail)) {
    setErrors((prev: any) => ({ ...prev, partnerEmail: t("funnel.validEmailError" as any) }));
    return;
  }

  setEmail(clientData.partnerEmail);
  saveStep();
}}
              className="px-8 py-2 bg-[#CAF476] border border-[#132219] rounded-full text-[14px] font-medium text-[#132219]"
            >
              {t("funnel.continue" as any)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* REUSABLE COMPONENTS */
function InputField({ label, value, onChange, type = "text" }: any) {
  return (
    <div className="flex flex-col">
      <label className="font-medium text-[#132219]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-2 border px-4 py-3 rounded-xl"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: any) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      <label className="font-medium text-[#132219]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-2 border px-4 py-3 rounded-xl"
      >
        <option value="">{t("funnel.pleaseSelect" as any)}</option>
        {options.map(([val, text]: any) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

export default StartStep;
