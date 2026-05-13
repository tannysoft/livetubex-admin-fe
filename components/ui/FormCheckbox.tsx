'use client'

import { forwardRef, type ReactNode } from 'react'
import { Checkbox, Field, Label, Description } from '@headlessui/react'
import { CheckIcon } from '@heroicons/react/20/solid'

interface FormCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  invalid?: boolean
  /** ขนาด — default 'md' */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Standard checkbox ของแอป — ใช้ HeadlessUI Checkbox
 *   - มี keyboard support เต็มรูปแบบ
 *   - มี data-states (data-checked, data-disabled, data-focus)
 *   - layout: [checkbox] [label + description]
 */
const FormCheckbox = forwardRef<HTMLButtonElement, FormCheckboxProps>(function FormCheckbox(
  { checked, onChange, label, description, disabled, invalid, size = 'md', className = '' },
  ref,
) {
  const boxSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  return (
    <Field disabled={disabled} className={`flex items-start gap-2.5 ${disabled ? 'opacity-60' : ''} ${className}`}>
      <Checkbox
        ref={ref}
        checked={checked}
        onChange={onChange}
        className={[
          'group relative flex items-center justify-center shrink-0 rounded-md border transition-all cursor-pointer',
          'mt-0.5',
          boxSize,
          'bg-white',
          invalid
            ? 'border-red-400 data-checked:bg-red-500 data-checked:border-red-500'
            : 'border-gray-300 data-checked:bg-[#f73727] data-checked:border-[#f73727]',
          'data-focus:outline-none data-focus:ring-2 data-focus:ring-[#f73727]/30 data-focus:ring-offset-1',
          'data-disabled:cursor-not-allowed',
          'hover:border-[#f73727]/50',
        ].join(' ')}
      >
        <CheckIcon className={`${iconSize} text-white opacity-0 group-data-checked:opacity-100 transition-opacity`} strokeWidth={3} />
      </Checkbox>

      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <Label className="text-sm text-gray-700 cursor-pointer select-none data-disabled:cursor-not-allowed leading-tight">
              {label}
            </Label>
          )}
          {description && (
            <Description className="text-xs text-gray-500 mt-0.5">
              {description}
            </Description>
          )}
        </div>
      )}
    </Field>
  )
})

export default FormCheckbox
