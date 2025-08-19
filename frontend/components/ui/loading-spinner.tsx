'use client'

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export default function LoadingSpinner({ size = 'medium', className = '' }: LoadingSpinnerProps) {
  const getSizeClass = () => {
    switch (size) {
      case 'small': return 'loading-sm'
      case 'large': return 'loading-lg'
      default: return 'loading-md'
    }
  }

  return (
    <span className={`loading loading-spinner ${getSizeClass()} ${className}`}></span>
  )
}