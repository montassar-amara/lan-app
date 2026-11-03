type SparklineProps = {
  values: number[];
};

export function Sparkline({ values }: SparklineProps) {
  if (values.length === 0) {
    return <p className="spark-empty">The trace starts with the first reading.</p>;
  }

  const width = 640;
  const height = 150;
  const pad = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) =>
    values.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (values.length - 1);
  const y = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  const last = points[points.length - 1].split(',');

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trace of ${values.length} readings between ${min} and ${max}`}
    >
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          x1={pad}
          x2={width - pad}
          y1={pad + fraction * (height - pad * 2)}
          y2={pad + fraction * (height - pad * 2)}
          className="spark-guide"
        />
      ))}
      {values.length > 1 && <polyline className="spark-line" points={points.join(' ')} />}
      <circle className="spark-dot" cx={last[0]} cy={last[1]} r={4} />
    </svg>
  );
}
