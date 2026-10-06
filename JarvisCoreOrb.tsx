import React from 'react';
import { AssistantState, CameraMode, EmotionState, ResponseStyle } from '../types/jarvis';

interface JarvisCoreOrbProps {
  state: AssistantState;
  audioLevels: number[];
  emotionState: EmotionState;
  responseStyle: ResponseStyle;
  cameraMode: CameraMode;
  screenSharing: boolean;
  wakeWordEnabled: boolean;
  onPrimaryAction: () => void;
  onInterruptSpeech: () => void;
}

export const JarvisCoreOrb: React.FC<JarvisCoreOrbProps> = ({
  state,
  audioLevels,
  emotionState,
  responseStyle,
  cameraMode,
  screenSharing,
  wakeWordEnabled,
  onPrimaryAction,
  onInterruptSpeech,
}) => {
  const getStateLabel = (s: AssistantState): string => {
    switch (s) {
      case 'IDLE':
        return wakeWordEnabled ? 'Silent Standby · Wake Phrase Ready' : 'Silent Standby';
      case 'LISTENING':
        return 'Listening to Voice Input';
      case 'PROCESSING':
        return 'Processing Speech Input';
      case 'THINKING':
        return 'AI Brain Reasoning & Context Analysis';
      case 'EXECUTING':
        return 'Executing Validated Android Task Plan';
      case 'SPEAKING':
        return 'Speaking Natural Response (Tap to Interrupt)';
      case 'WAITING':
        return 'Awaiting User Clarification';
      case 'ERROR':
      default:
        return 'Action Verification Alert';
    }
  };

  const getCoreColor = (s: AssistantState) => {
    switch (s) {
      case 'LISTENING':
        return { stroke: '#38BDF8', glow: 'rgba(56, 189, 248, 0.25)' };
      case 'PROCESSING':
      case 'THINKING':
        return { stroke: '#818CF8', glow: 'rgba(129, 140, 248, 0.25)' };
      case 'EXECUTING':
        return { stroke: '#F59E0B', glow: 'rgba(245, 158, 11, 0.25)' };
      case 'SPEAKING':
        return { stroke: '#10B981', glow: 'rgba(16, 185, 129, 0.25)' };
      case 'WAITING':
        return { stroke: '#FBBF24', glow: 'rgba(251, 191, 36, 0.22)' };
      case 'ERROR':
        return { stroke: '#EF4444', glow: 'rgba(239, 68, 68, 0.25)' };
      case 'IDLE':
      default:
        return { stroke: '#475569', glow: 'rgba(71, 85, 105, 0.12)' };
    }
  };

  const { stroke, glow } = getCoreColor(state);

  return (
    <div className="flex flex-col items-center justify-center py-4 select-none">
      {/* Subtle Reactive AI Brain Core */}
      <div className="relative flex items-center justify-center w-52 h-52">
        {/* Ambient radial field */}
        <div
          className="absolute inset-4 rounded-full transition-opacity duration-300 pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${glow} 0%, rgba(9, 13, 22, 0) 72%)`,
            transform: state === 'IDLE' ? 'scale(0.95)' : 'scale(1.08)',
          }}
        />

        {/* SVG Precision Core */}
        <svg
          viewBox="0 0 220 220"
          className="w-full h-full overflow-visible cursor-pointer"
          onClick={state === 'SPEAKING' ? onInterruptSpeech : onPrimaryAction}
          role="button"
          aria-label="JARVIS Core Action Trigger"
        >
          {/* Outer precision ring */}
          <circle
            cx="110"
            cy="110"
            r="94"
            fill="none"
            stroke="#1E293B"
            strokeWidth="1"
          />

          {/* Dynamic state ring */}
          <circle
            cx="110"
            cy="110"
            r="82"
            fill="none"
            stroke={stroke}
            strokeWidth={state === 'IDLE' ? '1.5' : '2.5'}
            strokeDasharray={
              state === 'THINKING'
                ? '18 10'
                : state === 'EXECUTING'
                ? '40 12'
                : state === 'IDLE'
                ? '260'
                : '120 6'
            }
            className={
              state === 'THINKING' || state === 'EXECUTING'
                ? 'origin-center animate-spin'
                : 'transition-all duration-300'
            }
            style={{
              animationDuration: state === 'THINKING' ? '6s' : '3.5s',
            }}
          />

          {/* Secondary inner orbital ring */}
          <circle
            cx="110"
            cy="110"
            r="64"
            fill="#0D1322"
            stroke={stroke}
            strokeOpacity={state === 'IDLE' ? 0.35 : 0.75}
            strokeWidth="1.25"
          />

          {/* Center label inside core */}
          <text
            x="110"
            y="105"
            textAnchor="middle"
            fill="#F8FAFC"
            className="font-display text-sm font-bold tracking-wider"
          >
            JARVIS
          </text>
          <text
            x="110"
            y="123"
            textAnchor="middle"
            fill="#94A3B8"
            className="font-mono text-[11px]"
          >
            {state}
          </text>
        </svg>
      </div>

      {/* Reactive 16-bar Voice & Brain Waveform */}
      <div
        className="flex items-center justify-center gap-1.5 h-9 mt-1 px-4"
        aria-label="Voice and Brain Activity Waveform"
      >
        {audioLevels.map((lvl, idx) => {
          const activeScale =
            state === 'LISTENING' || state === 'SPEAKING'
              ? Math.max(0.2, Math.min(1, lvl))
              : state === 'THINKING' || state === 'EXECUTING'
              ? 0.35 + ((idx % 4) * 0.12)
              : 0.16;
          return (
            <div
              key={idx}
              className="w-1 rounded-full transition-transform duration-150"
              style={{
                height: '32px',
                backgroundColor: stroke,
                opacity: state === 'IDLE' ? 0.35 : 0.9,
                transform: `scaleY(${activeScale})`,
              }}
            />
          );
        })}
      </div>

      {/* Clean unboxed state & tone metadata (Zero-Pill discipline) */}
      <div className="mt-3 text-center">
        <p className="text-sm font-medium text-slate-200">{getStateLabel(state)}</p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
          <span>Tone: {emotionState}</span>
          <span aria-hidden="true">·</span>
          <span>Style: {responseStyle}</span>
          <span aria-hidden="true">·</span>
          <span>Camera: {cameraMode}</span>
          <span aria-hidden="true">·</span>
          <span>Screen Share: {screenSharing ? 'Active' : 'Off'}</span>
        </div>
      </div>
    </div>
  );
};
