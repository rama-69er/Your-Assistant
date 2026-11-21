import React, { useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  Home,
  Mic,
  MicOff,
  Square,
  GripHorizontal,
} from 'lucide-react';
import { RobotCharacter } from './RobotCharacter';
import type { AssistantPreferences, RobotState } from '../core/types';

interface FloatingRobotOverlayProps {
  preferences: AssistantPreferences;
  robotState: RobotState;
  isListening: boolean;
  isPaused: boolean;
  audioLevel: number;
  latestBubble: string;
  onToggleListening: () => void;
  onTogglePause: () => void;
  onHide: () => void;
  onOpenMain: () => void;
  onStopAssistant: () => void;
}

export const FloatingRobotOverlay: React.FC<FloatingRobotOverlayProps> = ({
  preferences,
  robotState,
  isListening,
  isPaused,
  audioLevel,
  latestBubble,
  onToggleListening,
  onTogglePause,
  onHide,
  onOpenMain,
  onStopAssistant,
}) => {
  const [expanded, setExpanded] = useState(false);

  const computeSafePosition = (w: number, h: number, current?: { x: number; y: number }) => {
    const isMobile = w < 768;
    const podWidth = isMobile ? 96 : 112;
    const bottomSafe = isMobile ? 168 : 132;
    const topSafe = isMobile ? 64 : 76;
    const defaultX = Math.max(12, w - podWidth - 16);
    const defaultY = Math.max(topSafe, h - bottomSafe);
    if (!current) {
      return { x: defaultX, y: defaultY };
    }
    return {
      x: Math.max(12, Math.min(current.x, w - podWidth - 12)),
      y: Math.max(topSafe, Math.min(current.y, h - bottomSafe)),
    };
  };

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 24, y: 120 };
    return computeSafePosition(window.innerWidth, window.innerHeight);
  });

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => computeSafePosition(window.innerWidth, window.innerHeight, prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(
      computeSafePosition(window.innerWidth, window.innerHeight, {
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      })
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const robotPx =
    preferences.floatingSize === 'small'
      ? 60
      : preferences.floatingSize === 'large'
        ? 92
        : 76;

  return (
    <aside
      aria-label={`Floating ${preferences.name} companion`}
      data-testid="floating-robot-overlay"
      className="fixed z-40 flex flex-col items-end gap-2 touch-none"
      style={{
        left: 0,
        top: 0,
        opacity: Math.max(0.45, Math.min(1, preferences.floatingOpacity ?? 0.94)),
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
      }}
    >
      {/* Compact Speech Bubble (shown when expanded) */}
      {expanded && latestBubble && (
        <div className="max-w-[230px] rounded-2xl bg-white/95 backdrop-blur-md px-3.5 py-2.5 text-xs leading-relaxed text-slate-800 shadow-lg border border-slate-200/80">
          <p className="font-medium text-slate-900">{preferences.name}</p>
          <p className="mt-0.5 text-slate-600 line-clamp-3">{latestBubble}</p>
        </div>
      )}

      {/* Draggable Floating Character Pod */}
      <div className="flex flex-col items-center rounded-3xl bg-white/85 backdrop-blur-md p-1.5 shadow-lg border border-slate-200/80">
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="flex w-full items-center justify-center py-0.5 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
          title="Drag to move"
        >
          <GripHorizontal className="w-4 h-4" aria-hidden="true" />
        </div>

        <RobotCharacter
          state={isPaused ? 'SLEEPING' : robotState}
          themeId={preferences.themeId}
          robotStyle={preferences.robotStyle}
          accessory={preferences.accessory}
          audioLevel={audioLevel}
          size={robotPx}
          batterySaver={preferences.batterySaver}
          onClick={() => setExpanded((prev) => !prev)}
          ariaLabel={`Toggle floating ${preferences.name} controls`}
        />

        {expanded && (
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={isPaused ? onTogglePause : onToggleListening}
              aria-label={
                isPaused
                  ? `Resume ${preferences.name} listening`
                  : isListening
                    ? `Pause ${preferences.name} microphone`
                    : `Talk to ${preferences.name}`
              }
              className={`min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center transition-colors ${
                isListening
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title={isPaused ? 'Resume listening' : isListening ? 'Pause microphone' : 'Tap to talk'}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onOpenMain}
              aria-label={`Open ${preferences.name} main screen`}
              className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors"
              title="Open main screen"
            >
              <Home className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onHide}
              aria-label={`Hide floating ${preferences.name}`}
              className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors"
              title="Hide floating robot"
            >
              <EyeOff className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onStopAssistant}
              aria-label={`Stop ${preferences.name}`}
              className="min-h-[36px] min-w-[36px] rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center justify-center transition-colors"
              title="Stop assistant"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
