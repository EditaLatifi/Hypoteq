import InputControl from './InputControl'
import { isReq } from './utils'

export default function FieldRow({ field, value, setValue }: { field: any; value: any; setValue: (v: any) => void }) {
  const invalid = isReq(field) && (value === undefined || value === null || value === '')

  if (field.type === 'checkbox') {
    return (
      <div className={'py-1 ' + (invalid ? 'ring-2 ring-red-500 rounded-xl p-2' : '')}>
        <InputControl field={field} value={value} setValue={setValue} />
      </div>
    )
  }

  return (
    <label className="block">
      <span className={'block text-sm mb-1 ' + (invalid ? 'label-invalid' : '')}>
        {field.label}
        {isReq(field) && <span className="text-red-600"> *</span>}
      </span>
      <InputControl field={field} value={value} setValue={setValue} />
    </label>
  )
}