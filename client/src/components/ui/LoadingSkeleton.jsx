export default function LoadingSkeleton({ rows = 3, className = '' }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-md bg-slate-100" style={{ height: index === 0 ? 18 : 14, width: `${100 - (index % 3) * 18}%` }} />
      ))}
    </div>
  )
}
