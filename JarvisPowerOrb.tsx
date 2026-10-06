import React from 'react';

export type OrbMode = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

const COLORS: Record<OrbMode, string> = {
  off: '#475569',
  idle: '#22d3ee',
  listening: '#38bdf8',
  thinking: '#818cf8',
  speaking: '#34d399',
  error: '#fb7185',
};

interface Props {
  mode: OrbMode;
  level: number; // 0..1 average audio level
  onClick?: () => void;
}

/** Animated JARVIS reactor core: gold arcs, rotating rings, hex frame and a glowing energy sphere. */
export const JarvisPowerOrb: React.FC<Props> = ({ mode, level, onClick }) => {
  const c = COLORS[mode];
  const active = mode !== 'off';
  const scale = active ? 1 + Math.min(0.14, Math.max(0, level - 0.16) * 0.3) : 1;
  const fast = mode === 'thinking' ? '3s' : '14s';
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${100 + 46 * Math.cos(a)},${100 + 46 * Math.sin(a)}`;
  }).join(' ');
  const rays = Array.from({ length: 24 }, (_, i) => i * 15);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="JARVIS core"
      className="relative block w-full h-full bg-transparent border-0 p-0 cursor-pointer"
      style={{ color: c }}
    >
      <svg viewBox="0 0 200 200" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="orbCore" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#031a26" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="orbHalo" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
          </radialGradient>
        </defs>

        <circle cx="100" cy="100" r="98" fill="url(#orbHalo)" />

        <g className="jarvis-orb-spin" style={{ transformOrigin: '100px 100px', animationDuration: '24s' }}>
          <circle cx="100" cy="100" r="92" fill="none" stroke="#d9a441" strokeWidth="2.5" strokeDasharray="60 190 40 230" strokeLinecap="round" />
        </g>
        <g className="jarvis-orb-spin-rev" style={{ transformOrigin: '100px 100px', animationDuration: fast }}>
          <circle cx="100" cy="100" r="82" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="110 40 30 40" strokeLinecap="round" opacity="0.9" />
        </g>
        <g className="jarvis-orb-spin" style={{ transformOrigin: '100px 100px', animationDuration: '40s' }}>
          {rays.map((deg) => (
            <line key={deg} x1="100" y1="12" x2="100" y2={deg % 45 === 0 ? 22 : 17} stroke="currentColor" strokeWidth="1.2" opacity="0.55" transform={`rotate(${deg} 100 100)`} />
          ))}
        </g>
        <circle cx="100" cy="100" r="68" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        <g className="jarvis-orb-spin-rev" style={{ transformOrigin: '100px 100px', animationDuration: '30s' }}>
          <polygon points={hex} fill="none" stroke="#d9a441" strokeWidth="1.8" opacity="0.8" transform="scale(1.35) translate(-26 -26)" />
        </g>

        <g style={{ transformOrigin: '100px 100px', transform: `scale(${scale})`, transition: 'transform 120ms ease-out' }}>
          <circle cx="100" cy="100" r="42" fill="url(#orbCore)" className={active ? 'jarvis-orb-pulse' : ''} />
          <circle cx="100" cy="100" r="42" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.2" />
          <path d="M72 100 Q100 70 128 100 Q100 130 72 100 Z" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="9" fill="#ffffff" fillOpacity="0.9" />
        </g>
      </svg>
    </button>
  );
};
