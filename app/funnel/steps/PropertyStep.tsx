"use client";
import SwissDatePicker from "@/components/SwissDatePicker";

import { useTranslation } from "@/hooks/useTranslation";

import { useState } from "react";

function PropertyStep({ data, setData, saveStep, borrowers, back, customerType, borrowerType, projectData }: any) {
  const { t } = useTranslation();
  const [errors, setErrors] = useState({
    artImmobilie: "",
    artLiegenschaft: "",
    nutzung: "",
    renovation: "",
    finanzierungsangebote: "",
  });
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
          <input
            type="text"
            placeholder={t("funnel.amountInCHF" as any)}
            className="mt-[16px] px-5 py-2 border border-[#C8C8C8] rounded-full w-full md:w-[260px] text-sm"
            value={data.renovationsBetrag ? `CHF ${formatCHF(data.renovationsBetrag)}` : ""}
            onChange={(e) => {
              const rawValue = e.target.value.replace(/CHF\s?|'/g, "");
              const numericValue = rawValue.replace(/\D/g, "");
              update("renovationsBetrag", numericValue);
            }}
          />
        )}
      </div>

      {/* ========================================================= */}
      {/*  RESERVIERUNG – ONLY FOR NEUBAU (NEW CONSTRUCTION)        */}
      {/* ========================================================= */}
      {customerType !== "jur" && data.artImmobilie === "neubau" && (
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
      )}

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
            onClick={() => update("finanzierungsangebote", "ja")}
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
                  <input
                    placeholder={t("funnel.interestRate" as any)}
                    className="px-5 py-2 border border-[#C8C8C8] rounded-full text-sm w-full"
                    value={offer.zins || ""}
                    onChange={(e) => {
                      const updated = [...(data.angebote || [{ bank: data.bank || "", zins: data.zins || "", laufzeit: data.laufzeit || "" }])];
                      updated[idx].zins = e.target.value;
                      update("angebote", updated);
                    }}
                  />
                  <input
                    placeholder={t("funnel.term" as any)}
                    className="px-5 py-2 border border-[#C8C8C8] rounded-full text-sm w-full"
                    value={offer.laufzeit || ""}
                    onChange={(e) => {
                      const updated = [...(data.angebote || [{ bank: data.bank || "", zins: data.zins || "", laufzeit: data.laufzeit || "" }])];
                      updated[idx].laufzeit = e.target.value;
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
  <h3 className="text-[16px] font-semibold mb-[16px]">
    {(customerType === "jur" || customerType === "partner")
      ? t("funnel.kreditnehmerMultiple" as any)
      : t("funnel.kreditnehmerSingle" as any)}
  </h3>

  <div className="space-y-[24px]">
    {data.kreditnehmer.map((kn: any, index: number) => (
      <div key={index} className="flex items-center gap-[16px]">
        
        {/* ADD BUTTON */}
        <button
          onClick={() => {
            if (data.kreditnehmer.length >= 6) return; // Max 6 borrowers
            const updated = [...data.kreditnehmer];
            updated.splice(
              index + 1,
              0,
              (customerType === "jur" || customerType === "partner")
                ? { firmenname: "", adresse: "" }
                : {
                    vorname: "",
                    name: "",
                    geburtsdatum: "",
                    beschaeftigung: "",
                    zivilstand: "",
                  }
            );
            update("kreditnehmer", updated);
          }}
          className="text-3xl leading-none text-[#132219] mt-[5px]"
          disabled={data.kreditnehmer.length >= 6}
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
          </div>
        ) : (
          /* ======================== */
          /*  NATÜRLICHE PERSON VIEW  */
          /* ======================== */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 md:gap-3 lg:gap-[16px] flex-1">
            <input
              type="text"
              placeholder={t("funnel.firstName" as any)}
              className="px-5 py-2 border border-[#132219] rounded-full text-sm"
              value={kn.vorname}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].vorname = e.target.value;
                update("kreditnehmer", updated);
              }}
            />
            <input
              type="text"
              placeholder={t("funnel.lastName" as any)}
              className="px-5 py-2 border border-[#132219] rounded-full text-sm"
              value={kn.name}
              onChange={(e) => {
                const updated = [...data.kreditnehmer];
                updated[index].name = e.target.value;
                update("kreditnehmer", updated);
              }}
            />
            <div className="relative w-full">
              <select
                className="px-5 py-2 rounded-full text-sm w-full bg-white border border-[#132219] appearance-none pr-10"
                value={kn.erwerb || ""}
                onChange={(e) => {
                  const updated = [...data.kreditnehmer];
                  updated[index].erwerb = e.target.value;
                  update("kreditnehmer", updated);
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
                value={kn.geburtsdatum}
                onChange={val => {
                  const updated = [...data.kreditnehmer];
                  updated[index].geburtsdatum = val;
                  update("kreditnehmer", updated);
                }}
                className="ml-2"
              />
            <div className="relative w-full">
              <select
                className="px-5 py-2 rounded-full text-sm w-full bg-white border border-[#132219] appearance-none pr-10"
                value={kn.zivilstand}
                onChange={(e) => {
                  const updated = [...data.kreditnehmer];
                  updated[index].zivilstand = e.target.value;
                  update("kreditnehmer", updated);
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
      <div className="flex justify-between mt-6 lg:mt-10">
        <button onClick={back} className="px-4 lg:px-6 py-2 border border-[#132219] rounded-full text-sm lg:text-base">
          {t("funnel.back" as any)}
        </button>
        <button 
          onClick={() => {
            const newErrors: any = {};
            if (!data.artImmobilie) {
              newErrors.artImmobilie = t("funnel.errorPropertyType" as any) || "Please select property type";
            }
            if (!data.artLiegenschaft) {
              newErrors.artLiegenschaft = t("funnel.errorPropertyKind" as any) || "Please select property kind";
            }
            if (!data.nutzung) {
              newErrors.nutzung = t("funnel.errorPropertyUsage" as any) || "Please select property usage";
            }
            if (!data.renovation) {
              newErrors.renovation = t("funnel.errorRenovation" as any) || "Please select renovation option";
            }
            if (!data.finanzierungsangebote) {
              newErrors.finanzierungsangebote = t("funnel.errorFinancingOffers" as any) || "Please select financing offers option";
            }
            if (Object.keys(newErrors).length > 0) {
              setErrors((prev: any) => ({ ...prev, ...newErrors }));
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
            setErrors({
              artImmobilie: "",
              artLiegenschaft: "",
              nutzung: "",
              renovation: "",
              finanzierungsangebote: ""
            });
            saveStep();
          }}
          className="px-4 lg:px-6 py-2 bg-[#CAF476] text-[#132219] rounded-full text-sm lg:text-base">
          {t("funnel.continue" as any)}
        </button>
      </div>
    </div>
  );
}

export default PropertyStep;
