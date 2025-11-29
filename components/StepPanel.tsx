 "use client"
import React, { useMemo } from "react"
import FieldRow from "./FieldRow"
import { flattenAny } from "./utils"
import PersonAccordion from "./PersonAccordion"

export default function StepPanel({ panel, answers, onAnswer, showErrors }: any) {
  if (!panel) return null

  const subPanels = (panel.components || []).filter((c: any) => c.type === "panel")
  const otherFields = (panel.components || []).filter((c: any) => c.type !== "panel")

  return (
    <div className="space-y-4">
      {subPanels.length > 0 &&
        subPanels.map((sub: any, i: number) => {
          const isPersonPanel =
            sub.key?.startsWith("tab_person") || sub.label?.toLowerCase().includes("person")

          const content = flattenAny(sub.components || []).map((f: any) => (
            <FieldRow
              key={f.key}
              field={f}
              value={answers[f.key]}
              setValue={(v: any) => onAnswer(f.key, v)}
              
            />
          ))

          return isPersonPanel ? (
            <PersonAccordion
              key={i}
              title={sub.title || sub.label || `Person ${i + 1}`}
            >
              {content}
            </PersonAccordion>
          ) : (
            <div key={i} className="border p-3 rounded">
              <h4 className="font-semibold mb-2">{sub.title || sub.label}</h4>
              {content}
            </div>
          )
        })}

      {otherFields.length > 0 &&
        flattenAny(otherFields).map((f: any) => (
          <FieldRow
            key={f.key}
            field={f}
            value={answers[f.key]}
            setValue={(v: any) => onAnswer(f.key, v)}
        
          />
        ))}

      {subPanels.length === 0 && otherFields.length === 0 && (
        <p className="text-gray-600 text-sm">
          Keine Eingabefelder in diesem Schritt.
        </p>
      )}
    </div>
  )
}
