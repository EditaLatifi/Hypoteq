"use client"
import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

export default function PersonAccordion({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-4 py-2 text-left font-medium bg-gray-100 hover:bg-gray-200"
      >
        {title}
        <span className="text-lg">{open ? "−" : "+"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-4 py-3 bg-white"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
