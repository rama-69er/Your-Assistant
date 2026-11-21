import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react';
import type { DebugStage, DebugTraceEntry } from '../core/types';

interface DebugPipelinePanelProps {
  traces: DebugTraceEntry[];
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

export const DebugPipelinePanel: React.FC<DebugPipelinePanelProps> = ({
  traces,
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

        {traces.length > 0 && (
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
        <div className="mt-4">
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
