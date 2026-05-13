import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-btn-bg text-white hover:bg-accent-deep disabled:bg-bg-alt disabled:text-ink-mute',
  outline: 'border border-border text-ink hover:bg-bg-alt disabled:text-ink-subtle',
  ghost: 'text-ink-soft hover:bg-bg-alt disabled:text-ink-subtle',
  danger: 'text-danger hover:bg-danger-soft disabled:text-ink-subtle',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-secondary rounded-button',
  md: 'h-11 px-4 text-body rounded-button',
  lg: 'h-12 px-5 text-card rounded-button',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center font-semibold transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
