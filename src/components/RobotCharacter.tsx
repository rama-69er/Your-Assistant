import React, { useEffect, useId, useState } from 'react';
import { getThemeById, ROBOT_STATE_META } from '../core/robotStateMachine';
import type { RobotAccessory, RobotState, RobotStyle } from '../core/types';

interface RobotCharacterProps {
  state: RobotState;
  themeId: string;
  robotStyle: RobotStyle;
  accessory: RobotAccessory;
  audioLevel?: number; // 0..1 live microphone / speech amplitude
  size?: number;
  batterySaver?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

export const RobotCharacter: React.FC<RobotCharacterProps> = ({
  state,
  themeId,
  robotStyle,
  accessory,
  audioLevel = 0,
  size = 220,
  batterySaver = false,
  onClick,
  ariaLabel = 'Animated Shimi robot character',
}) => {
  const uid = useId().replace(/:/g, '');
  const theme = getThemeById(themeId);
  const stateMeta = ROBOT_STATE_META[state];

  const [isBlinking, setIsBlinking] = useState(false);
  const [gazeOffset, setGazeOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [speakPhase, setSpeakPhase] = useState(0);

  // Subtle natural blinking & looking around in IDLE / LISTENING
  useEffect(() => {
    if (state === 'SLEEPING') {
      setIsBlinking(false);
      setGazeOffset({ x: 0, y: 2 });
      return;
    }

    const blinkIntervalMs = batterySaver ? 6500 : 3800;
    let blinkTimeout: number | undefined;
    const blinkInterval = window.setInterval(() => {
      if (state === 'IDLE' || state === 'LISTENING' || state === 'SPEAKING') {
        setIsBlinking(true);
        blinkTimeout = window.setTimeout(() => setIsBlinking(false), 150);
      }
    }, blinkIntervalMs);

    const gazeIntervalMs = batterySaver ? 5200 : 2800;
    const gazePositions = [
      { x: 0, y: 0 },
      { x: 4, y: -1 },
      { x: -4, y: -1 },
      { x: 2, y: 2 },
      { x: -2, y: 0 },
    ];
    let idx = 0;
    const gazeInterval = window.setInterval(() => {
      if (state === 'IDLE') {
        idx = (idx + 1) % gazePositions.length;
        setGazeOffset(gazePositions[idx]);
      } else if (state === 'THINKING') {
        setGazeOffset((prev) => (prev.x >= 0 ? { x: -5, y: -4 } : { x: 5, y: -4 }));
      } else if (state === 'SORRY') {
        setGazeOffset({ x: 0, y: 5 });
      } else if (state === 'CONFUSED') {
        setGazeOffset({ x: 3, y: -2 });
      } else {
        setGazeOffset({ x: 0, y: 0 });
      }
    }, gazeIntervalMs);

    return () => {
      window.clearInterval(blinkInterval);
      window.clearInterval(gazeInterval);
      if (blinkTimeout) window.clearTimeout(blinkTimeout);
    };
  }, [state, batterySaver]);

  // Smooth mouth movement cadence while SPEAKING
  useEffect(() => {
    if (state !== 'SPEAKING') {
      setSpeakPhase(0);
      return;
    }
    const interval = window.setInterval(() => {
      setSpeakPhase((p) => (p + 1) % 4);
    }, batterySaver ? 220 : 130);
    return () => window.clearInterval(interval);
  }, [state, batterySaver]);

  const clampedAudio = Math.max(0, Math.min(1, audioLevel));
  const listeningPulse = state === 'LISTENING' ? 1 + clampedAudio * 0.25 : 1;

  // Chassis geometry per robotStyle (preserves same recognizable Shimi silhouette & face)
  const headRx = robotStyle === 'deskbot' ? 32 : robotStyle === 'aero' ? 68 : 60;
  const headWidth = robotStyle === 'aero' ? 156 : 148;
  const headX = (240 - headWidth) / 2;

  const renderEyes = () => {
    const leftCx = 94 + gazeOffset.x;
    const rightCx = 146 + gazeOffset.x;
    const eyeY = 114 + gazeOffset.y;

    if (state === 'SLEEPING') {
      return (
        <g stroke={theme.eyeGlow} strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.85">
          <path d={`M ${leftCx - 11} ${eyeY + 2} Q ${leftCx} ${eyeY + 9} ${leftCx + 11} ${eyeY + 2}`} />
          <path d={`M ${rightCx - 11} ${eyeY + 2} Q ${rightCx} ${eyeY + 9} ${rightCx + 11} ${eyeY + 2}`} />
        </g>
      );
    }

    if (state === 'SUCCESS') {
      return (
        <g stroke={theme.eyeGlow} strokeWidth="5" strokeLinecap="round" fill="none">
          <path d={`M ${leftCx - 11} ${eyeY + 3} Q ${leftCx} ${eyeY - 11} ${leftCx + 11} ${eyeY + 3}`} />
          <path d={`M ${rightCx - 11} ${eyeY + 3} Q ${rightCx} ${eyeY - 11} ${rightCx + 11} ${eyeY + 3}`} />
        </g>
      );
    }

    if (isBlinking) {
      return (
        <g stroke={theme.eyeGlow} strokeWidth="4.5" strokeLinecap="round">
          <line x1={leftCx - 11} y1={eyeY} x2={leftCx + 11} y2={eyeY} />
          <line x1={rightCx - 11} y1={eyeY} x2={rightCx + 11} y2={eyeY} />
        </g>
      );
    }

    if (state === 'CONFUSED') {
      return (
        <g>
          {/* Asymmetrical curious eyes */}
          <ellipse cx={leftCx} cy={eyeY + 1} rx="10" ry="9" fill={theme.eyeGlow} />
          <circle cx={leftCx - 3} cy={eyeY - 2} r="3" fill="#FFFFFF" opacity="0.92" />
          <ellipse cx={rightCx} cy={eyeY - 1} rx="12.5" ry="13.5" fill={theme.eyeGlow} />
          <circle cx={rightCx - 4} cy={eyeY - 5} r="4" fill="#FFFFFF" opacity="0.95" />
          {/* Raised eyebrow curve */}
          <path
            d={`M ${rightCx - 10} ${eyeY - 18} Q ${rightCx} ${eyeY - 23} ${rightCx + 10} ${eyeY - 16}`}
            fill="none"
            stroke={theme.eyeGlow}
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>
      );
    }

    if (state === 'SORRY') {
      return (
        <g>
          <ellipse cx={leftCx} cy={eyeY + 2} rx="10" ry="9.5" fill={theme.eyeGlow} opacity="0.85" />
          <circle cx={leftCx - 2} cy={eyeY} r="3" fill="#FFFFFF" opacity="0.85" />
          <ellipse cx={rightCx} cy={eyeY + 2} rx="10" ry="9.5" fill={theme.eyeGlow} opacity="0.85" />
          <circle cx={rightCx - 2} cy={eyeY} r="3" fill="#FFFFFF" opacity="0.85" />
          {/* Gentle worried brows */}
          <path
            d={`M ${leftCx - 11} ${eyeY - 9} Q ${leftCx} ${eyeY - 15} ${leftCx + 9} ${eyeY - 13}`}
            fill="none"
            stroke={theme.eyeGlow}
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.8"
          />
          <path
            d={`M ${rightCx - 9} ${eyeY - 13} Q ${rightCx} ${eyeY - 15} ${rightCx + 11} ${eyeY - 9}`}
            fill="none"
            stroke={theme.eyeGlow}
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.8"
          />
        </g>
      );
    }

    const rY = 12.5 * stateMeta.eyeScaleY * (state === 'LISTENING' ? 1 + clampedAudio * 0.1 : 1);
    const rX = state === 'THINKING' ? 10.5 : 11.5;

    return (
      <g>
        {state === 'LISTENING' && (
          <>
            <circle
              cx={leftCx}
              cy={eyeY}
              r={15.5 * listeningPulse}
              fill="none"
              stroke={theme.eyeGlow}
              strokeWidth="1.8"
              opacity={0.35 + clampedAudio * 0.45}
            />
            <circle
              cx={rightCx}
              cy={eyeY}
              r={15.5 * listeningPulse}
              fill="none"
              stroke={theme.eyeGlow}
              strokeWidth="1.8"
              opacity={0.35 + clampedAudio * 0.45}
            />
          </>
        )}
        <ellipse cx={leftCx} cy={eyeY} rx={rX} ry={rY} fill={theme.eyeGlow} />
        <circle cx={leftCx - 3.5} cy={eyeY - 4} r="3.6" fill="#FFFFFF" opacity="0.95" />
        <circle cx={leftCx + 3} cy={eyeY + 4} r="1.6" fill="#FFFFFF" opacity="0.55" />

        <ellipse cx={rightCx} cy={eyeY} rx={rX} ry={rY} fill={theme.eyeGlow} />
        <circle cx={rightCx - 3.5} cy={eyeY - 4} r="3.6" fill="#FFFFFF" opacity="0.95" />
        <circle cx={rightCx + 3} cy={eyeY + 4} r="1.6" fill="#FFFFFF" opacity="0.55" />
      </g>
    );
  };

  const renderMouth = () => {
    const cx = 120 + gazeOffset.x * 0.4;
    const cy = 138;

    if (state === 'SLEEPING') {
      return <ellipse cx={cx} cy={cy} rx="4" ry="2.5" fill={theme.eyeGlow} opacity="0.55" />;
    }

    if (state === 'SPEAKING') {
      const heights = [4, 9.5, 6, 11];
      const ry = heights[speakPhase] + clampedAudio * 3;
      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={10 + (speakPhase % 2) * 2}
          ry={ry}
          fill={theme.eyeGlow}
          opacity="0.92"
        />
      );
    }

    if (state === 'LISTENING') {
      const barH = 4 + clampedAudio * 10;
      return (
        <g fill={theme.eyeGlow} opacity="0.9">
          <rect x={cx - 12} y={cy - barH * 0.4} width="3.5" height={barH * 0.8} rx="1.75" />
          <rect x={cx - 5.5} y={cy - barH * 0.7} width="3.5" height={barH * 1.4} rx="1.75" />
          <rect x={cx + 2} y={cy - barH * 0.7} width="3.5" height={barH * 1.4} rx="1.75" />
          <rect x={cx + 8.5} y={cy - barH * 0.4} width="3.5" height={barH * 0.8} rx="1.75" />
        </g>
      );
    }

    if (state === 'THINKING') {
      return (
        <g fill={theme.eyeGlow} opacity="0.85">
          <circle cx={cx - 8} cy={cy} r="2.4" />
          <circle cx={cx} cy={cy - 1.5} r="2.8" />
          <circle cx={cx + 8} cy={cy} r="2.4" />
        </g>
      );
    }

    if (state === 'CONFUSED') {
      return (
        <path
          d={`M ${cx - 8} ${cy + 2} Q ${cx - 2} ${cy - 3} ${cx + 3} ${cy + 1} T ${cx + 10} ${cy}`}
          fill="none"
          stroke={theme.eyeGlow}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      );
    }

    if (state === 'SORRY') {
      return (
        <path
          d={`M ${cx - 9} ${cy + 4} Q ${cx} ${cy - 3} ${cx + 9} ${cy + 4}`}
          fill="none"
          stroke={theme.eyeGlow}
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.85"
        />
      );
    }

    if (state === 'SUCCESS') {
      return (
        <path
          d={`M ${cx - 13} ${cy - 3} Q ${cx} ${cy + 12} ${cx + 13} ${cy - 3}`}
          fill={theme.eyeGlow}
          opacity="0.95"
        />
      );
    }

    // IDLE friendly gentle smile
    return (
      <path
        d={`M ${cx - 10} ${cy - 1} Q ${cx} ${cy + 7} ${cx + 10} ${cy - 1}`}
        fill="none"
        stroke={theme.eyeGlow}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.92"
      />
    );
  };

  const renderAccessory = () => {
    if (accessory === 'none') return null;

    if (accessory === 'halo') {
      return (
        <ellipse
          cx="120"
          cy="34"
          rx="34"
          ry="8.5"
          fill="none"
          stroke={theme.accent}
          strokeWidth="4.5"
          opacity="0.9"
        />
      );
    }

    if (accessory === 'beanie') {
      return (
        <g>
          <path
            d="M 62 76 C 66 36, 174 36, 178 76 Z"
            fill={theme.accent}
          />
          <rect x="57" y="69" width="126" height="16" rx="8" fill={theme.accent} filter={`url(#shade-${uid})`} />
          <circle cx="120" cy="36" r="10" fill={theme.shell} stroke={theme.accent} strokeWidth="3" />
        </g>
      );
    }

    if (accessory === 'glasses') {
      return (
        <g fill="none" stroke="#E2E8F0" strokeWidth="3.5">
          <circle cx="94" cy="114" r="18" fill="rgba(255,255,255,0.08)" />
          <circle cx="146" cy="114" r="18" fill="rgba(255,255,255,0.08)" />
          <line x1="112" y1="114" x2="128" y2="114" />
        </g>
      );
    }

    if (accessory === 'headphones') {
      return (
        <g>
          <path
            d="M 44 114 C 44 40, 196 40, 196 114"
            fill="none"
            stroke={theme.accent}
            strokeWidth="7"
            strokeLinecap="round"
          />
          <rect x="33" y="96" width="16" height="40" rx="8" fill={theme.accent} />
          <rect x="191" y="96" width="16" height="40" rx="8" fill={theme.accent} />
        </g>
      );
    }

    if (accessory === 'star') {
      return (
        <path
          d="M 164 66 L 167.5 74 L 176 75 L 169.5 80.5 L 171.5 89 L 164 84.5 L 156.5 89 L 158.5 80.5 L 152 75 L 160.5 74 Z"
          fill="#FBBF24"
          stroke="#FFFFFF"
          strokeWidth="1.5"
        />
      );
    }

    return null;
  };

  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{ width: size, height: size }}
      data-testid="shimi-robot"
      data-robot-state={state}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        disabled={!onClick}
        className={`relative w-full h-full flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
          onClick ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <svg
          viewBox="0 0 240 240"
          width={size}
          height={size}
          className="overflow-visible"
          role="img"
          aria-label={`${ariaLabel} (${stateMeta.label})`}
        >
          <defs>
            <linearGradient id={`shell-${uid}`} x1="18%" y1="8%" x2="82%" y2="92%">
              <stop offset="0%" stopColor={theme.shell} />
              <stop offset="68%" stopColor={theme.shell} />
              <stop offset="100%" stopColor={theme.shellShade} />
            </linearGradient>
            <linearGradient id={`body-${uid}`} x1="20%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor={theme.shell} />
              <stop offset="100%" stopColor={theme.shellShade} />
            </linearGradient>
            <linearGradient id={`visor-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={theme.visor} />
              <stop offset="100%" stopColor="#090F1D" />
            </linearGradient>
            <linearGradient id={`gloss-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <filter id={`drop-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0F172A" floodOpacity="0.14" />
            </filter>
            <filter id={`shade-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.18" />
            </filter>
          </defs>

          {/* Ground Contact Shadow */}
          <ellipse
            cx="120"
            cy="220"
            rx="48"
            ry="9"
            fill="#0F172A"
            className={`shimi-anim-shadow ${batterySaver ? 'shimi-battery-saver' : ''}`}
            style={{ transformOrigin: '120px 220px' }}
          />

          {/* Animated Character Group */}
          <g
            className={`${stateMeta.animationClass} ${batterySaver ? 'shimi-battery-saver' : ''}`}
            style={{ transformOrigin: '120px 128px' }}
            filter={`url(#drop-${uid})`}
          >
            {/* Floating Little Hands */}
            <ellipse
              cx={state === 'SUCCESS' ? 40 : 45}
              cy={state === 'SUCCESS' ? 148 : 178}
              rx="10"
              ry="14"
              transform={state === 'SUCCESS' ? 'rotate(-30 40 148)' : 'rotate(14 45 178)'}
              fill={`url(#body-${uid})`}
              stroke="#CBD5E1"
              strokeWidth="1.5"
            />
            <ellipse
              cx={state === 'SUCCESS' ? 200 : 195}
              cy={state === 'SUCCESS' ? 148 : 178}
              rx="10"
              ry="14"
              transform={state === 'SUCCESS' ? 'rotate(30 200 148)' : 'rotate(-14 195 178)'}
              fill={`url(#body-${uid})`}
              stroke="#CBD5E1"
              strokeWidth="1.5"
            />

            {/* Compact Rounded Torso */}
            <path
              d="M 84 162 C 84 156, 156 156, 156 162 L 150 198 C 148 208, 92 208, 90 198 Z"
              fill={`url(#body-${uid})`}
              stroke="#CBD5E1"
              strokeWidth="1.5"
            />
            {/* Chest Accent Core */}
            <rect x="107" y="176" width="26" height="8" rx="4" fill={theme.accent} opacity="0.9" />

            {/* Side Ear Pods (Style-adaptive) */}
            {robotStyle === 'aero' ? (
              <>
                <path d="M 46 96 C 34 80, 44 64, 62 78 Z" fill={theme.accent} />
                <path d="M 194 96 C 206 80, 196 64, 178 78 Z" fill={theme.accent} />
              </>
            ) : (
              <>
                <rect x="38" y="102" width="12" height="32" rx="6" fill={theme.accent} />
                <rect x="190" y="102" width="12" height="32" rx="6" fill={theme.accent} />
              </>
            )}

            {/* Top Antenna (hidden when beanie covers crown) */}
            {accessory !== 'beanie' && (
              <g>
                <rect x="117" y="42" width="6" height="22" rx="3" fill="#94A3B8" />
                <circle
                  cx="120"
                  cy="38"
                  r={state === 'LISTENING' ? 9 + clampedAudio * 3 : 8}
                  fill={theme.accent}
                />
                <circle cx="117.5" cy="35.5" r="2.5" fill="#FFFFFF" opacity="0.7" />
              </g>
            )}

            {/* Main Sculpted Head Shell */}
            <rect
              x={headX}
              y="60"
              width={headWidth}
              height="112"
              rx={headRx}
              fill={`url(#shell-${uid})`}
              stroke="#CBD5E1"
              strokeWidth="2"
            />

            {/* Subtle Top Rim Highlight for 3D ceramic depth */}
            <ellipse cx="120" cy="70" rx="44" ry="6" fill="#FFFFFF" opacity="0.72" />

            {/* Recessed Glossy Visor Faceplate */}
            <rect
              x="64"
              y="80"
              width="112"
              height="76"
              rx={robotStyle === 'deskbot' ? 22 : 34}
              fill={`url(#visor-${uid})`}
            />
            {/* Visor Top Glass Reflection */}
            <path
              d="M 78 86 Q 120 80 162 86 Q 156 102 120 100 Q 84 102 78 86 Z"
              fill={`url(#gloss-${uid})`}
            />

            {/* Cheek Blushes */}
            <ellipse
              cx="80"
              cy="132"
              rx="7.5"
              ry="4"
              fill={state === 'SORRY' ? '#F59E0B' : '#FB7185'}
              opacity={state === 'SUCCESS' ? 0.55 : state === 'SLEEPING' ? 0.2 : 0.34}
            />
            <ellipse
              cx="160"
              cy="132"
              rx="7.5"
              ry="4"
              fill={state === 'SORRY' ? '#F59E0B' : '#FB7185'}
              opacity={state === 'SUCCESS' ? 0.55 : state === 'SLEEPING' ? 0.2 : 0.34}
            />

            {/* Expressive Eyes & Mouth */}
            {renderEyes()}
            {renderMouth()}

            {/* Accessories */}
            {renderAccessory()}

            {/* State-specific Floating Accents */}
            {state === 'SLEEPING' && (
              <g fill={theme.accent} fontFamily="var(--font-display)" fontWeight="700">
                <text
                  x="176"
                  y="72"
                  fontSize="16"
                  style={{ animation: 'shimi-zzz 2.8s ease-in-out infinite' }}
                >
                  z
                </text>
                <text
                  x="190"
                  y="56"
                  fontSize="20"
                  style={{ animation: 'shimi-zzz 2.8s ease-in-out 0.9s infinite' }}
                >
                  Z
                </text>
              </g>
            )}

            {state === 'SUCCESS' && (
              <g fill={theme.accent}>
                <path
                  d="M 48 64 L 51 71 L 58 74 L 51 77 L 48 84 L 45 77 L 38 74 L 45 71 Z"
                  style={{ transformOrigin: '48px 74px', animation: 'shimi-sparkle 1.3s ease-in-out infinite' }}
                />
                <path
                  d="M 194 58 L 196.5 64 L 202.5 66.5 L 196.5 69 L 194 75 L 191.5 69 L 185.5 66.5 L 191.5 64 Z"
                  style={{ transformOrigin: '194px 66px', animation: 'shimi-sparkle 1.3s ease-in-out 0.45s infinite' }}
                />
              </g>
            )}

            {state === 'CONFUSED' && (
              <text
                x="182"
                y="72"
                fontSize="24"
                fontWeight="700"
                fontFamily="var(--font-display)"
                fill={theme.accent}
              >
                ?
              </text>
            )}
          </g>
        </svg>
      </button>
    </div>
  );
};
