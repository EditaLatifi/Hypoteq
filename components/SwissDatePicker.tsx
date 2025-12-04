import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./datepicker-fix.css";

// Utility to convert DD.MM.YYYY <-> Date
export function swissToDate(str?: string): Date | null {
  if (!str) return null;
  const [d, m, y] = str.split(".");
  if (!d || !m || !y) return null;
  return new Date(Number(y), Number(m) - 1, Number(d));
}
export function dateToSwiss(date?: Date | null): string {
  if (!date) return "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

export default function SwissDatePicker({ value, onChange, className = "", ...props }: {
  value?: string;
  onChange: (val: string) => void;
  className?: string;
  [key: string]: any;
}) {
  return (
    <DatePicker
      selected={swissToDate(value)}
      onChange={date => onChange(dateToSwiss(date))}
      dateFormat="dd.MM.yyyy"
      className={`px-5 py-2 border border-[#132219] rounded-full text-sm w-full ${className}`}
      placeholderText="DD.MM.YYYY"
      popperPlacement="bottom-start"
      {...props}
    />
  );
}
