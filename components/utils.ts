export type AnyObj = Record<string, any>


export function flattenAny(comps: AnyObj[]): AnyObj[] {
  const acc: AnyObj[] = []
  const walk = (nodes?: AnyObj[]) => {
    if (!nodes) return
    for (const c of nodes) {
      if (!c || typeof c !== 'object') continue
      if (Array.isArray(c.columns)) {
        for (const col of c.columns) walk(col?.components)
      }
      if (Array.isArray(c.rows)) {
        for (const row of c.rows) for (const col of row) walk(col?.components)
      }
      if (Array.isArray(c.components)) walk(c.components)
      if (c.input || ['file', 'reviewpage', 'datagrid', 'editgrid'].includes(c.type)) {
        acc.push(c)
      }
    }
  }
  walk(comps)
  return acc
}

export const readOptions = (c: any) => {
  if (Array.isArray(c.values)) return c.values
  if (c.data && Array.isArray(c.data.values)) return c.data.values
  return []
}


export const isReq = (f: any) => {
  const v = f.validate
  return !!(v && (v.required || v.unique || v.minLength > 0))
}

export const sanitizeNumber = (raw: string) => {
  if (raw == null) return ''
  let v = raw.replace(/[^0-9.,-]/g, '')
  v = v.replace(/(?!^)-/g, '') // only keep leading minus
  v = v.replace(/,/g, '.') // normalize commas to dots
  const parts = v.split('.')
  if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
  return v
}

export const numericAllowedKeys = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
])
