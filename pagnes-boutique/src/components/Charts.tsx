import React, { useState } from 'react';
import { compact, fcfa } from '../lib/format';

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

export function LineChart({ data, ariaLabel }: { data: { label: string; value: number }[]; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 620, H = 230, L = 46, R = 26, T = 12, B = 26;
  const max = Math.max(...data.map(d => d.value), 1);
  const step = niceStep(max / 4);
  const yMax = step * 4;
  const x = (i: number) => L + (data.length <= 1 ? 0 : (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
  const every = Math.ceil(data.length / 8);
  const cur = hover ?? data.length - 1;
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - L) / (W - L - R)) * (data.length - 1)))));
  };
  return (
    <div className="chart">
      <div className="chart-readout"><strong>{fcfa(data[cur]?.value ?? 0)}</strong><span>{data[cur]?.label}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(step * i)} y2={y(step * i)} className="grid" />
            <text x={L - 8} y={y(step * i) + 4} textAnchor="end" className="axis">{compact(step * i)}</text>
          </g>
        ))}
        <path d={area} className="area" />
        <path d={line} className="line" />
        {data.map((d, i) => (i % every === 0 || i === data.length - 1) && (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="axis">{d.label}</text>
        ))}
        {data[cur] && <g><line x1={x(cur)} x2={x(cur)} y1={T} y2={H - B} className="cursor" /><circle cx={x(cur)} cy={y(data[cur].value)} r="4.5" className="dot" /></g>}
      </svg>
    </div>
  );
}

export function BarList({ items, format, color }: { items: { label: string; value: number; sub?: string }[]; format: (n: number) => string; color?: string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <ul className="bars">
      {items.map(i => (
        <li key={i.label}>
          <div className="bars-top"><span className="bars-label">{i.label}</span><span className="bars-val">{format(i.value)}</span></div>
          <div className="bars-track"><div className="bars-fill" style={{ width: `${(i.value / max) * 100}%`, background: color }} /></div>
          {i.sub && <div className="bars-sub">{i.sub}</div>}
        </li>
      ))}
    </ul>
  );
}
