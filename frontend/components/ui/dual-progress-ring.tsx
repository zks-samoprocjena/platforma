'use client'

interface DualProgressRingProps {
  outerProgress: number  // Overall progress percentage (0-100)
  innerProgress: number  // Mandatory progress percentage (0-100)
  totalControls: number
  mandatoryControls: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function DualProgressRing({
  outerProgress,
  innerProgress,
  totalControls,
  mandatoryControls,
  size = 'md',
  className = ''
}: DualProgressRingProps) {
  // Size configurations
  const sizeConfig = {
    sm: { width: 80, height: 80, strokeWidth: 4, fontSize: 'text-xs' },
    md: { width: 120, height: 120, strokeWidth: 6, fontSize: 'text-sm' },
    lg: { width: 160, height: 160, strokeWidth: 8, fontSize: 'text-base' }
  }

  const config = sizeConfig[size]
  const center = config.width / 2
  const outerRadius = center - config.strokeWidth
  const innerRadius = outerRadius * 0.75 // Inner ring is 75% of outer

  // Calculate circumferences
  const outerCircumference = 2 * Math.PI * outerRadius
  const innerCircumference = 2 * Math.PI * innerRadius

  // Calculate stroke dash offsets for progress
  const outerOffset = outerCircumference - (outerProgress / 100) * outerCircumference
  const innerOffset = innerCircumference - (innerProgress / 100) * innerCircumference

  return (
    <div className={`relative ${className}`}>
      <svg
        width={config.width}
        height={config.height}
        viewBox={`0 0 ${config.width} ${config.height}`}
        className="transform -rotate-90"
      >
        {/* Outer ring background */}
        <circle
          cx={center}
          cy={center}
          r={outerRadius}
          stroke="currentColor"
          strokeWidth={config.strokeWidth}
          fill="none"
          className="text-base-300"
        />
        
        {/* Outer ring progress */}
        <circle
          cx={center}
          cy={center}
          r={outerRadius}
          stroke="currentColor"
          strokeWidth={config.strokeWidth}
          fill="none"
          strokeDasharray={outerCircumference}
          strokeDashoffset={outerOffset}
          className="text-primary transition-all duration-500 ease-out"
          strokeLinecap="round"
        />

        {/* Inner ring background */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          stroke="currentColor"
          strokeWidth={config.strokeWidth}
          fill="none"
          className="text-base-300"
        />
        
        {/* Inner ring progress */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          stroke="currentColor"
          strokeWidth={config.strokeWidth}
          fill="none"
          strokeDasharray={innerCircumference}
          strokeDashoffset={innerOffset}
          className="text-secondary transition-all duration-500 ease-out"
          strokeLinecap="round"
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className={`font-bold ${config.fontSize}`}>
            {totalControls}
          </div>
          <div className={`${config.fontSize} text-base-content/70`}>
            / {mandatoryControls}
          </div>
        </div>
      </div>
    </div>
  )
}