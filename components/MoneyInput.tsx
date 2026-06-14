'use client'
import { useState } from 'react'
import { toCents, toUnits } from '@/lib/money'

interface Props {
  cents: number
  onChange: (cents: number) => void
  className?: string
  placeholder?: string
}

/** 金額輸入欄：失焦時以千分位顯示，聚焦時切換為純數字方便編輯 */
export default function MoneyInput({ cents, onChange, className = '', placeholder = '0' }: Props) {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState('')

  const units = toUnits(cents)
  const displayValue = focused
    ? raw
    : units === 0
    ? ''
    : new Intl.NumberFormat('zh-TW').format(units)

  function handleFocus() {
    setRaw(units === 0 ? '' : String(units))
    setFocused(true)
  }

  function handleBlur() {
    setFocused(false)
    const cleaned = raw.replace(/,/g, '').trim()
    onChange(toCents(cleaned === '' ? '0' : cleaned))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // 只允許數字、小數點與負號
    setRaw(e.target.value.replace(/[^0-9.-]/g, ''))
  }

  return (
    <input
      className={`${className} text-right tabular-nums`}
      type="text"
      inputMode="decimal"
      placeholder={focused ? '' : placeholder}
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  )
}
