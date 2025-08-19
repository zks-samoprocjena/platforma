'use client'

import { useRef } from 'react'

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  min?: string
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function DateInput({ 
  value, 
  onChange, 
  min, 
  disabled, 
  placeholder,
  className = ''
}: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      // Try to open the picker if the browser supports it
      if ('showPicker' in HTMLInputElement.prototype) {
        inputRef.current.showPicker()
      } else {
        // Fallback: focus and simulate click
        inputRef.current.focus()
        inputRef.current.click()
      }
    }
  }

  return (
    <input
      ref={inputRef}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={min}
      disabled={disabled}
      placeholder={placeholder}
      className={`${className} cursor-pointer`}
      onClick={handleClick}
      style={{ colorScheme: 'light dark' }}
    />
  )
}