"use client";

interface FunnelCalcProps {
  data: any;
  projectData?: any;
  borrowers?: any[];
}

const getRealRate = (modell: string) => {
  switch (modell) {
    case "saron":
      return 0.0085;
    case "1":
    case "2":
    case "3":
    case "4":
      return 0.0105;
    case "5":
    case "6":
    case "7":
    case "8":
    case "9":
    case "10":
      return 0.0140;
    case "mix":
      return (0.0105 + 0.0140) / 2;
    default:
      return 0.01;
  }
};

const STRESS_RATE = 0.05;

export default function FunnelCalc({ data, projectData, borrowers }: FunnelCalcProps) {
  const projektArt = projectData?.projektArt?.toLowerCase();

  const borrowerType = borrowers?.[0]?.type;
  const isJur = borrowerType === "jur";

  const CHF = (v: number) => "CHF " + Math.round(v).toLocaleString("de-CH");

  /* ------------------------------------------
     KAUF
  -------------------------------------------*/
  if (projektArt === "kauf") {
    const kaufpreis = Number(data.kaufpreis || 0);

    const eigenmittel = isJur
      ? Number(data.eigenmittel_bar || 0)
      : Number(data.eigenmittel_bar || 0) +
        Number(data.eigenmittel_saeule3 || 0) +
        Number(data.eigenmittel_pk || 0) +
        Number(data.eigenmittel_schenkung || 0);

    const hypothek = Math.max(kaufpreis - eigenmittel, 0);

    /* ======================================
       HAS INPUTS → prevents early red color
       ====================================== */
    const hasInputs = kaufpreis > 0 || eigenmittel > 0;

    const eigenmittelPct =
      kaufpreis > 0 ? Math.round((eigenmittel / kaufpreis) * 100) : 0;

    let isNegative = false;

    /* For Juristische Personen */
    if (isJur) {
      isNegative = hasInputs && eigenmittelPct < 20;
    } else {
      /* NATÜRLICHE PERSON */
      const einkommen = Number(data.brutto || 0) + Number(data.bonus || 0);
      const tragbarkeitPct =
        einkommen > 0
          ? Math.round(((hypothek * STRESS_RATE + kaufpreis * 0.008) / einkommen) * 100)
          : 0;

      isNegative = hasInputs && (eigenmittelPct < 20 || tragbarkeitPct > 33);
    }

    /* ------------------------------------------
       JURISTISCHE PERSON VIEW
    -------------------------------------------*/
    if (isJur) {
      return (
        <BoxWrapper>
          <TopBox
            title={isNegative ? "Not eligible" : "Berechnung"}
            subtitle="Geschätzter Finanzierungsbedarf:"
            value={CHF(hypothek)}
            error={isNegative}
          />

          <TwoBoxGrid
            leftLabel="Eigenmittel"
            leftValue={CHF(eigenmittel)}
            rightLabel="Hypothek"
            rightValue={CHF(hypothek)}
          />
        </BoxWrapper>
      );
    }

    /* ------------------------------------------
       NATÜRLICHE PERSON VIEW
    -------------------------------------------*/
    return (
      <BoxWrapper>
        <TopBox
          title={isNegative ? "Not eligible" : "Eligibility confirmed."}
          subtitle="Estimated mortgage need:"
          value={CHF(hypothek)}
          error={isNegative}
        />

        <TwoBoxGrid
          leftLabel="Eigenmittel"
          leftValue={`${eigenmittelPct}%`}
          rightLabel="Tragbarkeit"
          rightValue={`${(
            ((hypothek * STRESS_RATE + kaufpreis * 0.008) /
              (Number(data.brutto || 0) + Number(data.bonus || 0) || 1)) *
            100
          ).toFixed(0)}%`}
        />
      </BoxWrapper>
    );
  }

  /* ------------------------------------------
     ABLÖSUNG
  -------------------------------------------*/
  if (projektArt === "abloesung") {
    const betrag = Number(data.abloesung_betrag || 0);
    const erhoehung =
      data.erhoehung === "Ja" ? Number(data.erhoehung_betrag || 0) : 0;

    const hypothek = betrag + erhoehung;

    const kaufpreis = Number(data.kaufpreis || 0);

    const hasInputs = hypothek > 0 || kaufpreis > 0;

    let isNegative = false;

    if (isJur) {
      const eigenmittelPct =
        kaufpreis > 0
          ? Math.round(((kaufpreis - hypothek) / kaufpreis) * 100)
          : 0;

      isNegative = hasInputs && eigenmittelPct < 20;
    } else {
      const einkommen = Number(data.brutto || 0);

      const zinssatz = getRealRate(data.modell);
      const zinsen = (hypothek * zinssatz) / 12;
      const unterhalt = (kaufpreis ? kaufpreis * 0.008 : 0) / 12;

      const zweiteHypothek =
        kaufpreis > 0 ? Math.max(hypothek - kaufpreis * 0.8, 0) : 0;

      const amortisation =
        zweiteHypothek > 0 ? zweiteHypothek / 15 / 12 : 0;

      const total = zinsen + unterhalt + amortisation;

      const tragbarkeitPct =
        einkommen > 0 ? Math.round(((total * 12) / einkommen) * 100) : 0;

      isNegative = hasInputs && tragbarkeitPct > 33;
    }

    /* ------------------------------------------
       JURISTISCHE PERSON
    -------------------------------------------*/
    if (isJur) {
      return (
        <BoxWrapper>
          <TopBox
            title={isNegative ? "Not eligible" : "Berechnung"}
            subtitle="Geschätzter Finanzierungsbedarf:"
            value={CHF(hypothek)}
            error={isNegative}
          />

          <TwoBoxGrid
            leftLabel="Hypothek"
            leftValue={CHF(hypothek)}
            rightLabel="Erhöhung"
            rightValue={CHF(erhoehung)}
          />
        </BoxWrapper>
      );
    }

    /* ------------------------------------------
       NATÜRLICHE PERSON
    -------------------------------------------*/
    return (
      <BoxWrapper>
        <TopBox
          title={isNegative ? "Not eligible" : "Eligibility confirmed."}
          subtitle="Estimated mortgage need:"
          value={CHF(hypothek)}
          error={isNegative}
        />

        <TwoBoxGrid
          leftLabel="Hypothek"
          leftValue={CHF(hypothek)}
          rightLabel="Tragbarkeit"
          value={`${(
            ((Number(data.brutto || 0) === 0 ? 0 : (hypothek * getRealRate(data.modell) + kaufpreis * 0.008) /
              Number(data.brutto || 0))) * 100
          ).toFixed(0)}%`}
        />
      </BoxWrapper>
    );
  }

  return null;
}

/* UI COMPONENTS */
function BoxWrapper({ children }: any) {
  return (
    <div className="w-full max-w-[444px] border border-black rounded-[10px] bg-white flex flex-col gap-[12px] p-[12px]">
      {children}
    </div>
  );
}

function TopBox({ title, subtitle, value, error = false }: any) {
  return (
    <div
      className={`w-full border border-black rounded-[10px]
      flex flex-col items-center gap-[12px] py-[14px] px-[12px]
      ${error ? "bg-[#FF9A9A]" : "bg-[#CAF476]"}`}
    >
      <p className="text-center text-[16px] font-medium text-[#132219]">
        {title}
        <br />
        {subtitle}
      </p>

      <div className="text-[38px] font-semibold">{value}</div>
    </div>
  );
}

function TwoBoxGrid({ leftLabel, leftValue, rightLabel, rightValue }: any) {
  return (
    <div className="w-full grid grid-cols-2 gap-[12px]">
      <SmallBox label={leftLabel} value={leftValue} />
      <SmallBox label={rightLabel} value={rightValue} />
    </div>
  );
}

function SmallBox({ label, value }: any) {
  return (
    <div className="bg-[#CAF476] border border-black rounded-[10px]
    flex flex-col items-center py-[14px] px-[12px] gap-[12px]">
      <p className="text-[20px] font-medium">{label}</p>
      <div className="border-t border-black w-full" />
      <p className="text-[32px] font-bold">{value}</p>
    </div>
  );
}
