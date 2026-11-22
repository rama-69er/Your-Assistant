import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react';
import type { DebugStage, DebugTraceEntry, TaskPlanPreview, TaskStepStatus } from '../core/types';

interface DebugPipelinePanelProps {
  traces: DebugTraceEntry[];
  activeTaskPlan?: TaskPlanPreview | null;
  nativeConnected: boolean;
  serviceRunning: boolean;
  wakeWord: string;
  aiMode: string;
  onClear: () => void;
}

const STAGE_LABEL: Record<DebugStage, string> = {
  WAKE_WORD: 'Wake word',
  SPEECH: 'Speech',
  INTENT: 'Intent',
  EXECUTOR: 'Executor',
  ANDROID_ACTION: 'Android action',
  RESULT: 'Result',
  BRIDGE: 'Native bridge',
  ERROR: 'Error',
};

function stepStatusTone(status: TaskStepStatus): { label: string; className: string } {
  switch (status) {
    case 'COMPLETED':
      return { label: 'OK', className: 'text-emerald-700' };
    case 'WAITING_CONFIRMATION':
      return { label: 'WAITING CONFIRMATION', className: 'text-amber-700' };
    case 'RUNNING':
      return { label: 'RUNNING', className: 'text-blue-700' };
    case 'FAILED':
      return { label: 'FAILED', className: 'text-rose-700' };
    case 'CANCELLED':
      return { label: 'CANCELLED', className: 'text-slate-500' };
    case 'PENDING':
    default:
      return { label: 'PENDING', className: 'text-slate-500' };
  }
}

export const DebugPipelinePanel: React.FC<DebugPipelinePanelProps> = ({
  traces,
  activeTaskPlan,
  nativeConnected,
  serviceRunning,
  wakeWord,
  aiMode,
  onClear,
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <section
      aria-label="Developer debug pipeline"
      data-testid="debug-pipeline-panel"
      className="rounded-3xl bg-white p-5 md:p-6 shadow-sm border border-slate-200/80"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-2.5 text-left cursor-pointer"
        >
          <Terminal className="w-4 h-4 text-slate-700" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Developer Debug Pipeline</h2>
            <p className="text-xs text-slate-500">
              Bridge: {nativeConnected ? 'Connected (Android WebView)' : 'Browser PWA only'} · Service:{' '}
              {serviceRunning ? 'Running' : 'Stopped'} · Wake word: &ldquo;{wakeWord}&rdquo; · Mode:{' '}
              {aiMode === 'offline_only' ? 'Offline Only' : 'Auto (Offline-First)'}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500 ml-1" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 ml-1" aria-hidden="true" />
          )}
        </button>

        {(traces.length > 0 || activeTaskPlan) && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-[34px] rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Clear trace
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          {/* Multi-Step Task Plan Preview */}
          {activeTaskPlan && (
            <div
              data-testid="debug-task-plan"
              className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 font-mono text-xs space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  Task Plan: {activeTaskPlan.title}
                </span>
                <span className="text-[11px] text-slate-500">
                  {activeTaskPlan.requiresAccessibility
                    ? 'Android Accessibility Executor'
                    : 'Android Intent Executor'}
                </span>
              </div>
              <div className="space-y-1">
                {activeTaskPlan.steps.map((step) => {
                  const tone = stepStatusTone(step.status);
                  return (
                    <div
                      key={`${activeTaskPlan.id}_${step.index}`}
                      data-testid={`task-step-${step.index}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 border border-slate-200/60"
                    >
                      <span className="text-slate-800">
                        <strong className="text-slate-900">
                          Task step {step.index} ({step.type}):
                        </strong>{' '}
                        {step.description}
                      </span>
                      <span className={`text-[11px] font-semibold ${tone.className}`}>
                        {tone.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {traces.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 border border-slate-200/70 px-4 py-3 text-xs text-slate-500 font-mono">
              Pipeline idle. Issue a voice or text command to inspect Wake word -&gt; Speech -&gt; Intent -&gt; Executor -&gt; Android action -&gt; Result.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 font-mono text-xs">
              {traces.map((entry) => (
                <div
                  key={entry.id}
                  data-testid={`debug-trace-${entry.stage}`}
                  className="rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900">
                        {STAGE_LABEL[entry.stage]}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-800 truncate">{entry.summary}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {typeof entry.durationMs === 'number' && (
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {entry.durationMs}ms
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-semibold ${
                          entry.ok ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {entry.ok ? 'OK' : 'WARN'}
                      </span>
                    </div>
                  </div>
                  {entry.detail && (
                    <p className="mt-1 text-[11px] text-slate-600 leading-relaxed break-words">
                      {entry.detail}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
