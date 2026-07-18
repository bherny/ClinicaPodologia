export function SkeletonBlock({ height = 16 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonBlock key={index} height={42} />
      ))}
    </div>
  );
}
