"use client";

import { useMemo } from "react";

interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
}

interface ChartData {
  type: "bar" | "line" | "pie" | "doughnut" | "scatter" | "area";
  title?: string;
  labels: string[];
  datasets: ChartDataset[];
}

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

/**
 * DataViz — Client-side chart renderer using inline SVG.
 * Parses chart JSON blocks from AI responses and renders them.
 */
export function ChartRenderer({ data }: { data: ChartData }) {
  const width = 480;
  const height = 280;
  const padding = { top: 30, right: 20, bottom: 50, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const rendered = useMemo(() => {
    switch (data.type) {
      case "bar":
        return renderBar(data, chartW, chartH);
      case "line":
      case "area":
        return renderLine(data, chartW, chartH, data.type === "area");
      case "pie":
      case "doughnut":
        return renderPie(data, data.type === "doughnut");
      case "scatter":
        return renderScatter(data, chartW, chartH);
      default:
        return renderBar(data, chartW, chartH);
    }
  }, [data, chartW, chartH]);

  if (data.type === "pie" || data.type === "doughnut") {
    return (
      <div className="my-3 bg-surface border border-border rounded-lg p-4">
        {data.title && <div className="text-xs font-medium mb-3 text-foreground">{data.title}</div>}
        <svg viewBox="0 0 300 300" className="w-full max-w-[300px] mx-auto" role="img" aria-label={data.title || "Chart"}>
          {rendered}
        </svg>
        <Legend datasets={data.datasets} labels={data.labels} isPie />
      </div>
    );
  }

  return (
    <div className="my-3 bg-surface border border-border rounded-lg p-4">
      {data.title && <div className="text-xs font-medium mb-3 text-foreground">{data.title}</div>}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={data.title || "Chart"}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {rendered}
          {/* X-axis labels */}
          {data.labels.map((label, i) => (
            <text
              key={`xl-${i}`}
              x={(i + 0.5) * (chartW / data.labels.length)}
              y={chartH + 20}
              textAnchor="middle"
              className="fill-[#71717a] text-[9px]"
            >
              {label.length > 10 ? label.slice(0, 10) + "…" : label}
            </text>
          ))}
        </g>
      </svg>
      <Legend datasets={data.datasets} labels={data.labels} />
    </div>
  );
}

function Legend({ datasets, labels, isPie }: { datasets: ChartDataset[]; labels?: string[]; isPie?: boolean }) {
  const items = isPie
    ? (labels || []).map((l, i) => ({ label: l, color: COLORS[i % COLORS.length] }))
    : datasets.map((ds, i) => ({ label: ds.label, color: ds.color || COLORS[i % COLORS.length] }));

  if (items.length <= 1 && !isPie) return null;

  return (
    <div className="flex flex-wrap gap-3 mt-3 justify-center">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

// ─── Chart Renderers ───

function renderBar(data: ChartData, w: number, h: number) {
  const allValues = data.datasets.flatMap((ds) => ds.data);
  const maxVal = Math.max(...allValues, 1);
  const numGroups = data.labels.length;
  const numSeries = data.datasets.length;
  const groupW = w / numGroups;
  const barW = Math.min((groupW * 0.7) / numSeries, 40);
  const elements: React.ReactNode[] = [];

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * h;
    const val = Math.round(maxVal * (1 - i / 4));
    elements.push(
      <g key={`grid-${i}`}>
        <line x1={0} y1={y} x2={w} y2={y} stroke="#27272a" strokeWidth="0.5" />
        <text x={-8} y={y + 3} textAnchor="end" className="fill-[#71717a] text-[9px]">{val}</text>
      </g>
    );
  }

  // Bars
  data.datasets.forEach((ds, si) => {
    ds.data.forEach((val, gi) => {
      const barH = (val / maxVal) * h;
      const x = gi * groupW + (groupW - barW * numSeries) / 2 + si * barW;
      const color = ds.color || COLORS[si % COLORS.length];
      elements.push(
        <rect
          key={`bar-${si}-${gi}`}
          x={x}
          y={h - barH}
          width={barW - 1}
          height={barH}
          fill={color}
          rx={2}
          opacity={0.85}
        >
          <title>{`${ds.label}: ${val}`}</title>
        </rect>
      );
    });
  });

  return <>{elements}</>;
}

function renderLine(data: ChartData, w: number, h: number, isArea: boolean) {
  const allValues = data.datasets.flatMap((ds) => ds.data);
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;
  const elements: React.ReactNode[] = [];

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * h;
    const val = Math.round(maxVal - (i / 4) * range);
    elements.push(
      <g key={`grid-${i}`}>
        <line x1={0} y1={y} x2={w} y2={y} stroke="#27272a" strokeWidth="0.5" />
        <text x={-8} y={y + 3} textAnchor="end" className="fill-[#71717a] text-[9px]">{val}</text>
      </g>
    );
  }

  data.datasets.forEach((ds, si) => {
    const color = ds.color || COLORS[si % COLORS.length];
    const points = ds.data.map((val, i) => ({
      x: (i + 0.5) * (w / ds.data.length),
      y: h - ((val - minVal) / range) * h,
    }));

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    if (isArea) {
      const areaD = pathD + ` L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;
      elements.push(
        <path key={`area-${si}`} d={areaD} fill={color} opacity={0.15} />
      );
    }

    elements.push(
      <path key={`line-${si}`} d={pathD} fill="none" stroke={color} strokeWidth="2" />
    );

    // Dots
    points.forEach((p, i) => {
      elements.push(
        <circle key={`dot-${si}-${i}`} cx={p.x} cy={p.y} r={3} fill={color}>
          <title>{`${ds.label}: ${ds.data[i]}`}</title>
        </circle>
      );
    });
  });

  return <>{elements}</>;
}

function renderPie(data: ChartData, isDoughnut: boolean) {
  const values = data.datasets[0]?.data || [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = 150, cy = 150, r = 120;
  const innerR = isDoughnut ? 60 : 0;
  const elements: React.ReactNode[] = [];

  let startAngle = -Math.PI / 2;
  values.forEach((val, i) => {
    const angle = (val / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    let d: string;
    if (isDoughnut) {
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);
      d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    } else {
      d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    const color = COLORS[i % COLORS.length];
    elements.push(
      <path key={`slice-${i}`} d={d} fill={color} opacity={0.85} stroke="#0a0a14" strokeWidth="1.5">
        <title>{`${data.labels[i] || `Item ${i + 1}`}: ${val} (${Math.round((val / total) * 100)}%)`}</title>
      </path>
    );

    // Label
    const midAngle = startAngle + angle / 2;
    const labelR = isDoughnut ? (r + innerR) / 2 : r * 0.65;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    if (angle > 0.3) {
      elements.push(
        <text key={`label-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="fill-white text-[10px] font-medium">
          {Math.round((val / total) * 100)}%
        </text>
      );
    }

    startAngle = endAngle;
  });

  if (isDoughnut) {
    elements.push(
      <text key="center" x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-[#a1a1aa] text-[11px] font-mono">
        {total}
      </text>
    );
  }

  return <>{elements}</>;
}

function renderScatter(data: ChartData, w: number, h: number) {
  const allValues = data.datasets.flatMap((ds) => ds.data);
  const maxVal = Math.max(...allValues, 1);
  const elements: React.ReactNode[] = [];

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * h;
    elements.push(
      <line key={`grid-${i}`} x1={0} y1={y} x2={w} y2={y} stroke="#27272a" strokeWidth="0.5" />
    );
  }

  data.datasets.forEach((ds, si) => {
    const color = ds.color || COLORS[si % COLORS.length];
    ds.data.forEach((val, i) => {
      const x = (i / Math.max(ds.data.length - 1, 1)) * w;
      const y = h - (val / maxVal) * h;
      elements.push(
        <circle key={`pt-${si}-${i}`} cx={x} cy={y} r={4} fill={color} opacity={0.7}>
          <title>{`${ds.label}: ${val}`}</title>
        </circle>
      );
    });
  });

  return <>{elements}</>;
}

// ─── Chart Block Parser ───

/** Parse a ```chart block from AI response into ChartData */
export function parseChartBlock(content: string): ChartData | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed.type || !parsed.labels || !parsed.datasets) return null;
    if (!Array.isArray(parsed.labels) || !Array.isArray(parsed.datasets)) return null;
    return parsed as ChartData;
  } catch {
    return null;
  }
}
