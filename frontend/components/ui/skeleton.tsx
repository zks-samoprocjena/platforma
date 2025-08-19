import { memo } from 'react'

interface SkeletonProps {
  className?: string
  height?: string
  width?: string
  rounded?: boolean
}

const Skeleton = memo(({ 
  className = '', 
  height = 'h-4', 
  width = 'w-full', 
  rounded = false 
}: SkeletonProps) => {
  return (
    <div 
      className={`animate-pulse bg-base-300 ${height} ${width} ${rounded ? 'rounded-full' : 'rounded'} ${className}`}
    />
  )
})

Skeleton.displayName = 'Skeleton'

export default Skeleton
export { Skeleton }

// Pre-built skeleton components for common use cases
export const CardSkeleton = memo(() => (
  <div className="card bg-base-200 shadow-xl">
    <div className="card-body">
      <Skeleton height="h-6" width="w-3/4" className="mb-4" />
      <Skeleton height="h-4" width="w-full" className="mb-2" />
      <Skeleton height="h-4" width="w-5/6" className="mb-2" />
      <Skeleton height="h-4" width="w-2/3" />
    </div>
  </div>
))

CardSkeleton.displayName = 'CardSkeleton'

export const TableSkeleton = memo(({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-4">
    <div className="flex gap-4">
      <Skeleton height="h-10" width="w-1/4" />
      <Skeleton height="h-10" width="w-1/4" />
      <Skeleton height="h-10" width="w-1/4" />
      <Skeleton height="h-10" width="w-1/4" />
    </div>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex gap-4">
        <Skeleton height="h-8" width="w-1/4" />
        <Skeleton height="h-8" width="w-1/4" />
        <Skeleton height="h-8" width="w-1/4" />
        <Skeleton height="h-8" width="w-1/4" />
      </div>
    ))}
  </div>
))

TableSkeleton.displayName = 'TableSkeleton'

export const ChartSkeleton = memo(() => (
  <div className="card bg-base-200 shadow-xl">
    <div className="card-body">
      <Skeleton height="h-6" width="w-1/2" className="mb-6" />
      <div className="flex items-end justify-between h-48 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton 
            key={i} 
            height={`h-${Math.floor(Math.random() * 32) + 16}`} 
            width="w-full" 
          />
        ))}
      </div>
    </div>
  </div>
))

ChartSkeleton.displayName = 'ChartSkeleton'