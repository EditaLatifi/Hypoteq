'use client'
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import StepPanel from './StepPanel'
import { flattenAny } from './utils'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from '@/hooks/useTranslation'

type AnyObj = Record<string, any>

export default function JsonWizard({
  version
}: {
  version: 'internal' | 'external'
}) {
  const pathname = usePathname()
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it"
  const { t } = useTranslation(pathLocale)
  
  const [schema, setSchema] = useState<AnyObj | null>(null)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<AnyObj>({})
  const [submitted, setSubmitted] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const router = useRouter()

  // Load schema JSON
  useEffect(() => {
    const url =
      version === 'internal'
        ? '/schemas/hypoteqmockform30.json'
        : '/schemas/beraterVersionForm30.json'

    fetch(url)
      .then(r => r.json())
      .then(j => {
        const formKey =
          version === 'internal' ? 'hypoteqmockform30' : 'beraterVersionForm30'
        const form = j.forms?.[formKey]

        if (form) {
          flattenAny(form.components).forEach((f: any) => {
            if (f.validate) f.validate.required = false
          })
        }

        setSchema(j)
      })
  }, [version])

  const form = schema?.forms?.[
    version === 'internal' ? 'hypoteqmockform30' : 'beraterVersionForm30'
  ]

  // Flatten panels (exclude summary & submit)
  const panels = useMemo(() => {
    if (!form) return []
    const all: AnyObj[] = []
    ;(form.components || []).forEach((c: AnyObj) => {
      if (
        c?.type === 'panel' &&
        !c.key?.toLowerCase().includes('summary') &&
        c.key !== 'submit'
      ) {
        all.push(c)
        if (Array.isArray(c.components)) {
          c.components.forEach((sub: AnyObj) => {
            if (
              sub?.type === 'panel' &&
              !sub.key?.toLowerCase().includes('summary') &&
              sub.key !== 'submit'
            ) {
              all.push(sub)
            }
          })
        }
      }
    })
    return all
  }, [form])

  // total steps = panels + 1 summary step
  const totalSteps = panels.length + 1
  const currentPanel = step < panels.length ? panels[step] : null

  // Progress bar logic
  const progress = useMemo(() => {
    if (totalSteps === 0) return 0
    if (submitted) return 100
    return Math.round((step / totalSteps) * 100)
  }, [step, totalSteps, submitted])

  const handleAnswer = useCallback((key: string, value: any) => {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }, [])

  const next = () => {
    setShowErrors(true)
    setStep(s => Math.min(totalSteps - 1, s + 1))
  }

  const back = () => {
    setStep(s => Math.max(0, s - 1))
  }

  const submit = () => {
    setSubmitted(true)
  }

  // 🔹 10 fusha kryesore
  const importantFields: { key: string; label: string }[] = [
    { key: 'anrede', label: t('wizard.salutation') },
    { key: 'Vorname', label: t('wizard.firstName') },
    { key: 'Name', label: t('wizard.lastName') },
    { key: 'geburtsdatum', label: t('wizard.birthDate') },
    { key: 'email', label: t('form.email') },
    { key: 'phone', label: t('form.phone') },
    { key: 'RBT_Finanzierung', label: t('wizard.financing') },
    { key: 'RBT_Nutzung_der_Immo', label: t('wizard.propertyUsage') },
    { key: 'RBT_Art_der_Liegenschaft', label: t('wizard.propertyType') },
    { key: 'loanAmount', label: t('wizard.mortgageAmount') }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

      <div className="md:col-span-1 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <h3 className="text-lg font-semibold mb-4">Chapters</h3>
        <ul className="space-y-2">
          {(form?.components || [])
            .filter(
              (c: AnyObj) =>
                c.type === 'panel' &&
                !c.key?.toLowerCase().includes('summary') &&
                c.key !== 'submit'
            )
            .map((p: AnyObj, i: number) => {
              const chapterIndex = panels.indexOf(p)
              return (
                <li key={i}>
                  <button
                    onClick={() => setStep(chapterIndex)}
                    className={`w-full text-left px-2 py-1 rounded-md ${
                      step === chapterIndex
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {p.title || `Chapter ${i + 1}`}
                  </button>
                </li>
              )
            })}
        </ul>
      </div>

      <div className="md:col-span-3">
        <div className="flex justify-between text-sm mb-2">
          <span>
            {submitted
              ? 'Abgeschlossen'
              : step === panels.length
              ? 'Zusammenfassung'
              : currentPanel?.title}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded mb-4 overflow-hidden">
          <div
            className="h-2 bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="card p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {submitted ? (
                // 🔹 Vielen Dank + fusha kryesore + buton back
                <div className="text-center py-10">
                  <h2 className="text-2xl font-semibold mb-2">{t("wizard.thankYou")}</h2>
                  <p className="text-gray-600 mb-6">
                    {t("wizard.willContact")}
                  </p>

                  <div className="bg-gray-50 border rounded-lg p-4 text-left max-w-md mx-auto mb-6">
                    <h3 className="text-lg font-semibold mb-3">
                      {t("wizard.yourData")}
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {importantFields.map(item => (
                        <li
                          key={item.key}
                          className="flex justify-between border-b pb-1"
                        >
                          <span className="font-medium">{item.label}:</span>
                          <span>
                            {answers[item.key] && answers[item.key] !== ''
                              ? String(answers[item.key])
                              : '(nicht ausgefüllt)'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="btn-primary"
                  >
                    Zur Startseite
                  </button>
                </div>
              ) : step === panels.length ? (
                // 🔹 Custom Summary screen
                <div>
                  <h2 className="text-xl font-semibold mb-4">
                    Zusammenfassung
                  </h2>
                  <ul className="space-y-2 text-sm">
                    {importantFields.map(item => (
                      <li key={item.key} className="border-b pb-1">
                        <strong>{item.label}:</strong>{' '}
                        {answers[item.key] && answers[item.key] !== ''
                          ? String(answers[item.key])
                          : '(nicht ausgefüllt)'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <StepPanel
                  panel={currentPanel}
                  answers={answers}
                  onAnswer={handleAnswer}
                  showErrors={showErrors}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {!submitted && (
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={back}
                disabled={step === 0}
                className="btn-secondary"
              >
                Zurück
              </button>
              {step === panels.length ? (
                <button type="button" onClick={submit} className="btn-primary">
                  Senden
                </button>
              ) : (
                <button type="button" onClick={next} className="btn-primary">
                  Weiter
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
