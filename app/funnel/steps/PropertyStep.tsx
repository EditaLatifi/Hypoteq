"use client";
import SwissDatePicker from "@/components/SwissDatePicker";

import { useTranslation } from "@/hooks/useTranslation";

import { useState, useEffect } from "react";

function PropertyStep({ data, setData, saveStep, borrowers, back, customerType, borrowerType, projectData, clientData }: any) {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<Record<string, string>>({
    artImmobilie: "",
    artLiegenschaft: "",
    nutzung: "",
    renovation: "",
    finanzierungsangebote: "",
  });
  
  // Pre-fill first borrower with client data from StartStep
  useEffect(() => {
    if (clientData && data.kreditnehmer && data.kreditnehmer.length > 0) {
      const firstBorrower = data.kreditnehmer[0];
      // Only pre-fill if the first borrower is empty
      if (!firstBorrower.vorname && !firstBorrower.email && clientData.email) {
        const updatedKreditnehmer = [...data.kreditnehmer];
        updatedKreditnehmer[0] = {
          ...updatedKreditnehmer[0],
          vorname: clientData.firstName || "",
          name: clientData.lastName || "",
          email: clientData.email || "",
          telefon: clientData.phone || "",
        };
        setData((prev: any) => ({
          ...prev,
          kreditnehmer: updatedKreditnehmer,
        }));
      }
    }
  }, [clientData]); // Only run when clientData changes
  
  const update = (key: string, value: any) => {
    setData((prev: any) => ({ ...prev, [key]: value }));
    setErrors((prev: any) => ({ ...prev, [key]: "" }));
  };

  // Check if project type is Ablösung (redemption) - Neubau not allowed
  const isAbloesung = projectData?.projektArt === "abloesung";

  const ToggleButton = ({ active, children, onClick, showCircle = false, disabled = false }: any) => {
    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`
          flex items-center gap-3
          px-6 py-2.5 rounded-full border text-sm transition-all
          ${disabled
            ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-50"
            : active
            ? "bg-[#CAF476] border-[#132219] text-[#132219]"
            : "bg-white border-[#C8C8C8] text-[#132219]"}
        `}
        style={{ minHeight: "40px" }}
      >
        {showCircle && <span className="w-4 h-4 rounded-full bg-[#132219]"></span>}
        {children}
      </button>
    );
  };

  const formatCHF = (value: string | number) => {
    if (!value) return "";
    const num = typeof value === "string" ? Number(value.replace(/'/g, "")) : value;
    return num.toLocaleString("de-CH"); // Swiss formatting
  };
const bt = borrowerType || "nat";


const propertyUseOptions =
    bt === "jur"
      ? [t("funnel.investmentProperty" as any), t("funnel.forOwnBusiness" as any)]
      : [
          t("funnel.ownerOccupied" as any),
          t("funnel.investmentProperty" as any),
          t("funnel.secondHome" as any),
          t("funnel.rentedAndOwnerOccupied" as any),
        ];


  return (
    <div className="w-full max-w-[1400px] pt-[180px] md:pt-0 mx-auto px-4 md:px-6 lg:px-4 lg:pl-28 space-y-6 lg:space-y-[30px] -mt-10">
      {/* ========================================================= */}
      {/*  ART DER IMMOBILIE                                        */}
      {/* ========================================================= */}
      <div>
        <h3 className="text-sm md:text-[15px] lg:text-[16px] font-semibold mb-3 md:mb-3.5 lg:mb-[16px]">{t("funnel.propertyType" as any)}</h3>
        <div className="flex flex-wrap gap-3 md:gap-4 lg:gap-[24px]">
          <ToggleButton
            active={data.artImmobilie === "bestehend"}
            onClick={() => update("artImmobilie", "bestehend")}
          >
            {t("funnel.existingProperty" as any)}
          </ToggleButton>
          <ToggleButton
            active={data.artImmobilie === "neubau"}
            onClick={() => update("artImmobilie", "neubau")}
            disabled={isAbloesung}
          >
            {t("funnel.newConstruction" as any)}
          </ToggleButton>
        </div>
        {errors.artImmobilie && (
          <p className="text-red-500 text-[12px] mt-1">{errors.artImmobilie}</p>
        )}
        {data.artImmobilie === "neubau" && !isAbloesung && (
          <div className="flex flex-wrap gap-[24px] mt-[16px]">
            <ToggleButton
              active={data.neubauArt === "bereits_erstellt"}
              onClick={() => update("neubauArt", "bereits_erstellt")}
            >
              {t("funnel.alreadyBuilt" as any)}
            </ToggleButton>
            <ToggleButton
              active={data.neubauArt === "bauprojekt"}
              onClick={() => update("neubauArt", "bauprojekt")}
            >
              {t("funnel.constructionProject" as any)}
            </ToggleButton>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/*  ART DER LIEGENSCHAFT                                     */}
      {/* ========================================================= */}
      <div>
        <h3 className="text-sm lg:text-[16px] font-semibold mb-3 lg:mb-[16px]">{t("funnel.propertyKind" as any)}</h3>
        <div className="flex flex-wrap gap-3 lg:gap-[24px]">
          {[t("funnel.singleFamilyHome" as any), t("funnel.apartment" as any), t("funnel.multiFamily" as any), t("funnel.agriculturalZone" as any)].map(
            (item) => (
              <ToggleButton
                key={item}
                active={data.artLiegenschaft === item}
                onClick={() => update("artLiegenschaft", item)}
              >
                {item}
              </ToggleButton>
            )
          )}
        </div>
        {errors.artLiegenschaft && (
          <p className="text-red-500 text-[12px] mt-1">{errors.artLiegenschaft}</p>
        )}
      </div>

      {/* ========================================================= */}
      {/*  NUTZUNG DER IMMOBILIE                                    */}
      {/* ========================================================= */}
      <div>
        <h3 className="text-sm lg:text-[16px] font-semibold mb-3 lg:mb-[16px]">{t("funnel.propertyUsage" as any)}</h3>
        <div className="flex flex-wrap gap-3 lg:gap-[24px]">
          {propertyUseOptions.map((item) => (
            <ToggleButton
              key={item}
              active={data.nutzung === item}
              onClick={() => update("nutzung", item)}
            >
              {item}
            </ToggleButton>
          ))}
        </div>
        {errors.nutzung && (
          <p className="text-red-500 text-[12px] mt-1">{errors.nutzung}</p>
        )}
      </div>

      {/* ========================================================= */}
      {/*  RENOVATIONEN                                             */}
      {/* ========================================================= */}
      <div>
        <h3 className="text-[16px] font-semibold mb-[16px]">
          {customerType === "jur"
            ? t("funnel.renovationsJur" as any)
            : t("funnel.renovations" as any)}
        </h3>

        <div className="flex gap-[24px]">
          <ToggleButton
            active={data.renovation === "ja"}
            onClick={() => update("renovation", "ja")}
            showCircle={true}
          >
            {t("funnel.yes" as any)}
          </ToggleButton>
          <ToggleButton
            active={data.renovation === "nein"}
            onClick={() => update("renovation", "nein")}
            showCircle={true}
          >
            {t("funnel.no" as any)}
          </ToggleButton>
        </div>
        {errors.renovation && (
          <p className="text-red-500 text-[12px] mt-1">{errors.renovation}</p>
        )}

        {data.renovation === "ja" && (
          <>
            <label className="block mt-[16px] mb-1 text-sm font-medium">{t("funnel.renovationAmount" as any)}</label>
            <input
              type="text"
              placeholder={t("funnel.amountInCHF" as any)}
              className="px-5 py-2 border border-[#C8C8C8] rounded-full w-full md:w-[260px] text-sm"
              value={data.renovationsBetrag ? `CHF ${formatCHF(data.renovationsBetrag)}` : ""}
              onChange={(e) => {
                const rawValue = e.target.value.replace(/CHF\s?|'/g, "");
                const numericValue = rawValue.replace(/\D/g, "");
                update("renovationsBetrag", numericValue);
              }}
            />
          </>
        )}
      </div>

      {/* ========================================================= */}
      {/*  RESERVIERUNG – SHOW ALWAYS                              */}
      {/* ========================================================= */}
      <div>
        <h3 className="text-[16px] font-semibold mb-[16px]">
          {t("funnel.propertyReserved" as any)}
        </h3>
        <div className="flex gap-[24px]">
          <ToggleButton
            active={data.reserviert === "ja"}
            onClick={() => update("reserviert", "ja")}
            showCircle={true}
          >
            {t("funnel.yes" as any)}
          </ToggleButton>
          <ToggleButton
            active={data.reserviert === "nein"}
            onClick={() => update("reserviert", "nein")}
            showCircle={true}
          >
            {t("funnel.no" as any)}
          </ToggleButton>
        </div>
      </div>

      {/* ========================================================= */}
      {/*  FINANZIERUNGSANGEBOTE                                    */}
      {/* ========================================================= */}
      <div>
        <h3 className="text-[16px] font-semibold mb-[16px]">
          {t("funnel.financingOffers" as any)}
        </h3>
        <div className="flex gap-[24px]">
          <ToggleButton
            active={data.finanzierungsangebote === "ja"}
            onClick={() => {
              update("finanzierungsangebote", "ja");
              if (!data.angebote || !Array.isArray(data.angebote) || data.angebote.length === 0) {
                update("angebote", [{ bank: "", zins: "", laufzeit: "" }]);
              }
            }}
            showCircle={true}
          >
            {t("funnel.yes" as any)}
          </ToggleButton>
          <ToggleButton
            active={data.finanzierungsangebote === "nein"}
            onClick={() => update("finanzierungsangebote", "nein")}
            showCircle={true}
          >
            {t("funnel.no" as any)}
          </ToggleButton>
        </div>
        {errors.finanzierungsangebote && (
          <p className="text-red-500 text-[12px] mt-1">{errors.finanzierungsangebote}</p>
        )}
        {data.finanzierungsangebote === "ja" && (
          <div className="space-y-4 mt-[16px]">
            {(data.angebote || [{ bank: "", zins: "", laufzeit: "" }]).map((offer: any, idx: number) => (
              <div key={idx} className="flex items-center gap-4">
                {/* Add Button */}
                <button
                  onClick={() => {
                    const updated = [...(data.angebote || [{ bank: data.bank || "", zins: data.zins || "", laufzeit: data.laufzeit || "" }])];
                    updated.splice(idx + 1, 0, { bank: "", zins: "", laufzeit: "" });
                    update("angebote", updated);
                  }}
                  className="text-3xl leading-none text-[#132219]"
                >
                  +
                </button>

                {/* Delete Button */}
                {((data.angebote || []).length > 1 || idx > 0) && (
                  <button
                    onClick={() => {
                      const updated = (data.angebote || []).filter((_: any, i: number) => i !== idx);
                      update("angebote", updated.length > 0 ? updated : undefined);
                    }}
                    className="text-3xl leading-none text-red-600"
                  >
                    −
                  </button>
                )}

                {/* Offer Fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                  <input
                    placeholder={t("funnel.whichBank" as any)}
                    className="px-5 py-2 border border-[#C8C8C8] rounded-full text-sm w-full"
                    value={offer.bank || ""}
                    onChange={(e) => {
                      const updated = [...(data.angebote || [{ bank: data.bank || "", zins: data.zins || "", laufzeit: data.laufzeit || "" }])];
                      updated[idx].bank = e.target.value;
                      update("angebote", updated);
                    }}
                  />
                  <div className="relative w-full">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={t("funnel.interestRate" as any)}
                      className="px-5 py-2 border border-[#C8C8C8] rounded-full text-sm w-full pr-8"
                      value={offer.zins || ""}
                      onChange={(e) => {
                        // Only allow numbers and dot/comma
                        let val = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
                        const updated = [...(data.angebote || [{ bank: data.bank || "", zins: data.zins || "", laufzeit: data.laufzeit || "" }])];
                        updated[idx].zins = val;
                        update("angebote", updated);
                      }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder={t("funnel.term" as any)}
                    className="px-5 py-2 border border-[#C8C8C8] rounded-full text-sm w-full"
                    value={offer.laufzeit || ""}
                    onChange={(e) => {
                      // Only allow numbers
                      let val = e.target.value.replace(/[^\d]/g, "");
                      const updated = [...(data.angebote || [{ bank: data.bank || "", zins: data.zins || "", laufzeit: data.laufzeit || "" }])];
                      updated[idx].laufzeit = val;
                      update("angebote", updated);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

{/* ========================================================= */}
{/*  KREDITNEHMER FORM                                        */}
{/* ========================================================= */}
<div>
  <h3 className="text-[16px] font-semibold mb-[16px] flex items-center gap-2">
    {(customerType === "jur" || customerType === "partner")
      ? t("funnel.kreditnehmerMultiple" as any)
      : t("funnel.kreditnehmerSingle" as any)}
    <span className="text-red-500">*</span>
  </h3>
      {errors.kreditnehmer && (
        <div className="text-red-500 text-[15px] mb-4 font-semibold">{errors.kreditnehmer}</div>
      )}

  <div className="space-y-[24px]">
    {data.kreditnehmer.map((kn: any, index: number) => (
      <div key={index} className="flex items-center gap-[16px]">
        
        {/* ADD BUTTON */}
        <button
          onClick={() => {
            if (data.kreditnehmer.length >= 3) return; // Max 3 persons
            const updated = [...data.kreditnehmer];
            updated.splice(
              index + 1,
              0,
              (customerType === "jur" || customerType === "partner")
                ? { firmenname: "", adresse: "", vorname: "", name: "", email: "", telefon: "" }
                : {
                    vorname: "",
                    name: "",
                    email: "",
                    telefon: "",
                    geburtsdatum: "",
                    erwerb: "",
                    zivilstand: "",
                  }
            );
            update("kreditnehmer", updated);
          }}
          className="text-3xl leading-none text-[#132219] mt-[5px]"
          disabled={data.kreditnehmer.length >= 3}
        >
          +
        </button>

        {/* DELETE BUTTON */}
        {data.kreditnehmer.length > 1 && (
          <button
            onClick={() => {
              const updated = data.kreditnehmer.filter((_: any, i: number) => i !== index);
              update("kreditnehmer", updated);
            }}
            className="text-3xl leading-none text-red-600 mt-[5px]"
          >
            −
          </button>
        )}

        {/* ======================== */}
        {/*   JUR / PARTNER VIEW     */}
        {/* ======================== */}
  {borrowerType === "jur" ? (

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-[16px] w-full max-w-[600px]">
            {/* Firmenname */}
            <input
              type="text"
              placeholder={t("funnel.companyName" as any)}
              className="px-5 py-2 border border-[#132219] rounded-full text-sm w-full"
              value={kn.firmenname || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].firmenname = e.target.value;
                update("kreditnehmer", updated);
              }}
            />

            {/* Adresse */}
            <input
              type="text"
              placeholder={t("funnel.address" as any)}
              className="px-5 py-2 border border-[#132219] rounded-full text-sm w-full"
              value={kn.adresse || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].adresse = e.target.value;
                update("kreditnehmer", updated);
              }}
            />

            {/* Kontaktperson Vorname */}
            <input
              type="text"
              placeholder={t("funnel.firstName" as any) + " (Kontaktperson)"}
              className="px-5 py-2 border border-[#132219] rounded-full text-sm w-full"
              value={kn.vorname || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].vorname = e.target.value;
                update("kreditnehmer", updated);
              }}
            />

            {/* Kontaktperson Nachname */}
            <input
              type="text"
              placeholder={t("funnel.lastName" as any) + " (Kontaktperson)"}
              className="px-5 py-2 border border-[#132219] rounded-full text-sm w-full"
              value={kn.name || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].name = e.target.value;
                update("kreditnehmer", updated);
              }}
            />

            {/* Kontaktperson Email */}
            <input
              type="email"
              placeholder={t("funnel.email" as any) + " (Kontaktperson)"}
              className="px-5 py-2 border border-[#132219] rounded-full text-sm w-full"
              value={kn.email || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].email = e.target.value;
                update("kreditnehmer", updated);
              }}
            />

            {/* Kontaktperson Telefon */}
            <input
              type="tel"
              placeholder={t("funnel.phone" as any) + " (Kontaktperson)"}
              className="px-5 py-2 border border-[#132219] rounded-full text-sm w-full"
              value={kn.telefon || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].telefon = e.target.value;
                update("kreditnehmer", updated);
              }}
            />
          </div>
        ) : (
          /* ======================== */
          /*  NATÜRLICHE PERSON VIEW  */
          /* ======================== */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-3 lg:gap-[16px] flex-1">
            <input
              type="text"
              placeholder={t("funnel.firstName" as any)}
              className={`px-5 py-2 border rounded-full text-sm ${
                errors[`kreditnehmer_${index}_vorname`] ? 'border-red-500' : 'border-[#132219]'
              }`}
              value={kn.vorname || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].vorname = e.target.value;
                update("kreditnehmer", updated);
                setErrors((prev: any) => ({ ...prev, [`kreditnehmer_${index}_vorname`]: "" }));
              }}
            />
            <input
              type="text"
              placeholder={t("funnel.lastName" as any)}
              className={`px-5 py-2 border rounded-full text-sm ${
                errors[`kreditnehmer_${index}_name`] ? 'border-red-500' : 'border-[#132219]'
              }`}
              value={kn.name || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].name = e.target.value;
                update("kreditnehmer", updated);
                setErrors((prev: any) => ({ ...prev, [`kreditnehmer_${index}_name`]: "" }));
              }}
            />
            {/* Always show email and phone fields for kreditnehmer, even for partner */}
            <input
              type="email"
              placeholder={t("funnel.email" as any)}
              className={`px-5 py-2 border rounded-full text-sm ${
                errors[`kreditnehmer_${index}_email`] ? 'border-red-500' : 'border-[#132219]'
              }`}
              value={kn.email || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].email = e.target.value;
                update("kreditnehmer", updated);
                setErrors((prev: any) => ({ ...prev, [`kreditnehmer_${index}_email`]: "" }));
              }}
            />
            <input
              type="tel"
              placeholder={t("funnel.phone" as any)}
              className={`px-5 py-2 border rounded-full text-sm ${
                errors[`kreditnehmer_${index}_telefon`] ? 'border-red-500' : 'border-[#132219]'
              }`}
              value={kn.telefon || ""}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].telefon = e.target.value;
                update("kreditnehmer", updated);
                setErrors((prev: any) => ({ ...prev, [`kreditnehmer_${index}_telefon`]: "" }));
              }}
            />
            <div className="relative w-full">
              <select
                className={`px-5 py-2 rounded-full text-sm w-full bg-white border appearance-none pr-10 ${
                  errors[`kreditnehmer_${index}_erwerb`] ? 'border-red-500' : 'border-[#132219]'
                }`}
                value={kn.erwerb || ""}
                onChange={(e) => {
                  const updated = [...data.kreditnehmer];
                  updated[index].erwerb = e.target.value;
                  update("kreditnehmer", updated);
                  setErrors((prev: any) => ({ ...prev, [`kreditnehmer_${index}_erwerb`]: "" }));
                }}
              >
                <option value="">{t("funnel.employmentStatus" as any)}</option>
                <option value="angestellt">{t("funnel.employed" as any)}</option>
                <option value="selbständig">{t("funnel.selfEmployed" as any)}</option>
                <option value="rentner">{t("funnel.retired" as any)}</option>
              </select>
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 border-r-2 border-b-2 border-[#132219] rotate-45" />
            </div>
              <SwissDatePicker
                value={kn.geburtsdatum || ""}
                onChange={val => {
                  const updated = [...data.kreditnehmer];
                  updated[index].geburtsdatum = val;
                  update("kreditnehmer", updated);
                  setErrors((prev: any) => ({ ...prev, [`kreditnehmer_${index}_geburtsdatum`]: "" }));
                }}
                placeholder={t("funnel.birthdayPlaceholder" as any)}
                className={errors[`kreditnehmer_${index}_geburtsdatum`] ? 'border-red-500' : ''}
                showYearDropdown
                showMonthDropdown
                scrollableYearDropdown
                yearDropdownItemNumber={100}
              />
            <div className="relative w-full">
              <select
                className={`px-5 py-2 rounded-full text-sm w-full bg-white border appearance-none pr-10 ${
                  errors[`kreditnehmer_${index}_zivilstand`] ? 'border-red-500' : 'border-[#132219]'
                }`}
                value={kn.zivilstand || ""}
                onChange={(e) => {
                  const updated = [...data.kreditnehmer];
                  updated[index].zivilstand = e.target.value;
                  update("kreditnehmer", updated);
                  setErrors((prev: any) => ({ ...prev, [`kreditnehmer_${index}_zivilstand`]: "" }));
                }}
              >
                <option value="">{t("funnel.maritalStatus" as any)}</option>
                <option value="ledig">{t("funnel.single" as any)}</option>
                <option value="verheiratet">{t("funnel.married" as any)}</option>
                <option value="geschieden">{t("funnel.divorced" as any)}</option>
                <option value="verwitwet">{t("funnel.widowed" as any)}</option>
              </select>
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 border-r-2 border-b-2 border-[#132219] rotate-45" />
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
</div>


      {/* ========================================================= */}
      {/*  BUTTONS                                                  */}
      {/* ========================================================= */}
      <div className="flex flex-col gap-2 mt-6 lg:mt-10">
        <div className="flex justify-between">
          <button onClick={back} className="px-4 lg:px-6 py-2 border border-[#132219] rounded-full text-sm lg:text-base">
            {t("funnel.back" as any)}
          </button>
          <button 
            onClick={() => {
              const newErrors: any = {};
              // Basic property fields required for everyone (including partners)
              if (!data.artImmobilie) {
                newErrors.artImmobilie = t("funnel.errorPropertyType" as any) || "Please select property type";
              }
              if (!data.artLiegenschaft) {
                newErrors.artLiegenschaft = t("funnel.errorPropertyKind" as any) || "Please select property kind";
              }
              if (!data.nutzung) {
                newErrors.nutzung = t("funnel.errorPropertyUsage" as any) || "Please select property usage";
              }
              // For non-partners, validate additional fields
              if (customerType !== "partner") {
                if (!data.renovation) {
                  newErrors.renovation = t("funnel.errorRenovation" as any) || "Please select renovation option";
                }
                if (!data.finanzierungsangebote) {
                  newErrors.finanzierungsangebote = t("funnel.errorFinancingOffers" as any) || "Please select financing offers option";
                }
                // Validate reserved field if visible (for kauf, not abloesung)
                if (customerType !== "jur" && data.artImmobilie && !isAbloesung && !data.reserviert) {
                  newErrors.reserviert = t("funnel.errorReserved" as any) || "Please select whether the property is reserved";
                }
                // Validate borrowers
                if (!data.kreditnehmer || data.kreditnehmer.length === 0) {
                  newErrors.kreditnehmer = t("funnel.errorBorrowerRequired" as any);
                } else {
                  // Validate each borrower
                  data.kreditnehmer.forEach((kn: any, idx: number) => {
                    if (borrowerType === "jur") {
                      // Juristic person validation
                      if (!kn.firmenname) {
                        newErrors[`kreditnehmer_${idx}_firmenname`] = t("funnel.errorCompanyName" as any);
                      }
                      if (!kn.adresse) {
                        newErrors[`kreditnehmer_${idx}_adresse`] = t("funnel.errorAddress" as any);
                      }
                      // Validate contact person fields for juristische Person
                      if (!kn.vorname) {
                        newErrors[`kreditnehmer_${idx}_vorname`] = t("funnel.errorFirstName" as any);
                      }
                      if (!kn.name) {
                        newErrors[`kreditnehmer_${idx}_name`] = t("funnel.errorLastName" as any);
                      }
                      if (!kn.email) {
                        newErrors[`kreditnehmer_${idx}_email`] = t("funnel.errorEmail" as any);
                      } else {
                        // Stricter email validation
                        const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
                        if (!emailRegex.test(kn.email.trim())) {
                          newErrors[`kreditnehmer_${idx}_email`] = t("validEmailError" as any) || "Please enter a valid email address";
                        }
                      }
                      if (!kn.telefon) {
                        newErrors[`kreditnehmer_${idx}_telefon`] = t("funnel.errorPhone" as any);
                      }
                    } else {
                      // Natural person validation
                      if (!kn.vorname) {
                        newErrors[`kreditnehmer_${idx}_vorname`] = t("funnel.errorFirstName" as any);
                      }
                      if (!kn.name) {
                        newErrors[`kreditnehmer_${idx}_name`] = t("funnel.errorLastName" as any);
                      }
                      if (!kn.email) {
                        newErrors[`kreditnehmer_${idx}_email`] = t("funnel.errorEmail" as any);
                      }
                      if (!kn.telefon) {
                        newErrors[`kreditnehmer_${idx}_telefon`] = t("funnel.errorPhone" as any);
                      }
                      if (!kn.geburtsdatum) {
                        newErrors[`kreditnehmer_${idx}_geburtsdatum`] = t("funnel.errorBirthday" as any);
                      } else {
                        // Check if under 18 years old
                        let birthDate: Date | null = null;
                        if (kn.geburtsdatum.includes("-")) {
                          // yyyy-mm-dd
                          const [y, m, d] = kn.geburtsdatum.split("-");
                          birthDate = new Date(Number(y), Number(m) - 1, Number(d));
                        } else if (kn.geburtsdatum.includes(".")) {
                          // dd.mm.yyyy
                          const [d, m, y] = kn.geburtsdatum.split(".");
                          birthDate = new Date(Number(y), Number(m) - 1, Number(d));
                        }
                        if (birthDate) {
                          const today = new Date();
                          const age = today.getFullYear() - birthDate.getFullYear() - (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate()) ? 1 : 0);
                          if (age < 18) {
                            newErrors[`kreditnehmer_${idx}_geburtsdatum`] = t("funnel.errorUnder18" as any) || "Borrower must be at least 18 years old.";
                          }
                        }
                      }
                      if (!kn.erwerb) {
                        newErrors[`kreditnehmer_${idx}_erwerb`] = t("funnel.errorEmploymentStatus" as any);
                      }
                      if (!kn.zivilstand) {
                        newErrors[`kreditnehmer_${idx}_zivilstand`] = t("funnel.errorMaritalStatus" as any);
                      }
                    }
                  });
                }
              }
              if (Object.keys(newErrors).length > 0) {
                setErrors((prev: any) => ({ ...prev, ...newErrors }));
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
              }
              saveStep();
            }}
            className="px-4 lg:px-6 py-2 bg-[#CAF476] text-[#132219] rounded-full text-sm lg:text-base">
            {t("funnel.continue" as any)}
          </button>
        </div>
        {/* General error message below buttons */}
        {Object.keys(errors).some(key => errors[key]) && (
          <div className="text-red-500 text-[14px] mt-2 text-center">
            {t("funnel.requiredFieldsError" as any) || "Please fill all required fields marked below."}
          </div>
        )}
      </div>
    </div>
  );
}

export default PropertyStep;
