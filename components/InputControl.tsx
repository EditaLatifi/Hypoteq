'use client'
import { readOptions, sanitizeNumber, numericAllowedKeys } from './utils'
import React from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/hooks/useTranslation'

const DateBox = ({
  value,
  setValue,
}: {
  value: any
  setValue: (v: any) => void
}) => {
  return (
    <div className="date-wrap flex items-center gap-2">
      <input
        className="input-base"
        type="date"
        value={value ?? ''}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="button"
        className="date-btn text-gray-500"
        onClick={(e) => {
          const parent = e.currentTarget.parentElement as HTMLElement
          const input = parent.querySelector('input[type="date"]') as any
          if (input && typeof input.showPicker === 'function') {
            input.showPicker()
          } else {
            input?.focus()
          }
        }}
      >
        📅
      </button>
    </div>
  )
}

export default function InputControl({
  field,
  value,
  setValue,
}: {
  field: any
  value: any
  setValue: (v: any) => void
}) {
  const pathname = usePathname()
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it"
  const { t: translate } = useTranslation(pathLocale)
  
  const t = field.type

  // -------- TEXTAREAS & BASICS --------
  if (t === 'textarea') {
    return (
      <textarea
        className="input-base"
        rows={4}
        value={value ?? ''}
        onChange={(e) => setValue(e.target.value)}
      />
    )
  }

  if (t === 'email') {
    return (
      <input
        type="email"
        className="input-base"
        value={value ?? ''}
        onChange={(e) => setValue(e.target.value)}
      />
    )
  }

  if (t === 'phoneNumber' || t === 'textfield') {
    return (
      <input
        type="text"
        className="input-base"
        value={value ?? ''}
        onChange={(e) => setValue(e.target.value)}
      />
    )
  }

  // -------- NUMERIC --------
  if (t === 'number' || t === 'currency') {
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const key = e.key
      if (numericAllowedKeys.has(key) || e.ctrlKey || e.metaKey) return
      if (
        (key >= '0' && key <= '9') ||
        key === '.' ||
        key === ',' ||
        (key === '-' && e.currentTarget.selectionStart === 0)
      )
        return
      e.preventDefault()
    }
    return (
      <input
        type="text"
        inputMode="decimal"
        pattern="[0-9.,-]*"
        className="input-base"
        value={value ?? ''}
        onKeyDown={onKeyDown}
        onChange={(e) => setValue(sanitizeNumber(e.target.value))}
      />
    )
  }

  // -------- DATES --------
  if (t === 'day' || t === 'datetime' || t === 'date') {
    return <DateBox value={value} setValue={setValue} />
  }

  // -------- CHECKBOX --------
  if (t === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => setValue(e.target.checked)}
        />
        <span className="text-sm">{field.label}</span>
      </label>
    )
  }

  // -------- RADIO --------
  if (t === 'radio') {
    const opts = readOptions(field)
    return (
      <div className="flex flex-wrap gap-3">
        {opts.map((opt: any, idx: number) => (
          <label key={opt.value} className="inline-flex items-center gap-2">
            <input
              type="radio"
              name={field.key}
              checked={value === opt.value}
              onChange={() => setValue(opt.value)}
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
      </div>
    )
  }

  // -------- SELECT --------
  if (t === 'select') {
    const opts = readOptions(field)
    return (
      <select
        className="input-base"
        value={value ?? ''}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">{translate("wizard.pleaseSelect")}</option>
        {opts.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  // -------- SELECTBOXES --------
  if (t === 'selectboxes') {
    const opts = readOptions(field)
    const cur = value || {}
    return (
      <div className="flex flex-col gap-2">
        {opts.map((opt: any) => (
          <label key={opt.value} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!cur[opt.value]}
              onChange={(e) =>
                setValue({ ...cur, [opt.value]: e.target.checked })
              }
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
      </div>
    )
  }

  // -------- FILE --------
  if (t === 'file') {
    const onFile = async (f?: File | null) => {
      if (!f) {
        setValue('')
        return
      }
      const fd = new FormData()
      fd.append('file', f)
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const j = await res.json()
        if (j?.ok) setValue(j.url || f.name)
        else setValue(f.name)
      } catch {
        setValue(f.name)
      }
    }
    return (
      <input
        type="file"
        className="input-base"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
    )
  }

  // -------- DATAGRID / EDITGRID --------
  if (t === 'datagrid' || t === 'editgrid') {
    const rows: Array<any> = Array.isArray(value) ? value : []
    const inner: Array<any> = Array.isArray(field.components)
      ? field.components
      : []

    const updateCell = (i: number, k: string, v: any) => {
      const next = rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r))
      setValue(next)
    }

    const addRow = () => {
      const blank: any = {}
      inner.forEach((c: any) => (blank[c.key] = ''))
      setValue([...(rows || []), blank])
    }

    const removeRow = (i: number) => setValue(rows.filter((_, idx) => idx !== i))

    return (
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-xl border p-3 space-y-2">
            {inner.map((f: any) => (
              <label key={f.key} className="block">
                <span className="block text-sm mb-1">{f.label}</span>
                <InputControl
                  field={f}
                  value={row?.[f.key]}
                  setValue={(v: any) => updateCell(i, f.key, v)}
                />
              </label>
            ))}
            <button
              type="button"
              className="text-xs underline"
              onClick={() => removeRow(i)}
            >
              Zeile entfernen
            </button>
          </div>
        ))}
        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-sm"
          onClick={addRow}
        >
          + Zeile hinzufügen
        </button>
      </div>
    )
  }

  // -------- DEFAULT --------
  return (
    <input
      type="text"
      className="input-base"
      value={value ?? ''}
      onChange={(e) => setValue(e.target.value)}
    />
  )
}