export default function ProgressBar({ step, className = "" }: any) {
  const percent = ((step - 1) / 6) * 100;

  return (
    <div className={`progress-wrapper ${className} w-full`}>
      <div
        className="progress-bar"
        style={{
          width: "90%",
          height: "14px",
          background: "#E2E2E2",
          borderRadius: "86px",
          overflow: "hidden",
        }}
      >
        <div
          className="progress-fill"
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "#CAF476",
            borderRadius: "86px",
          }}
        ></div>
      </div>
    </div>
  );
}
