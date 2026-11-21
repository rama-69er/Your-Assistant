import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { RobotCharacter } from './RobotCharacter';
import {
  ALL_ROBOT_STATES,
  ROBOT_COLOR_THEMES,
  validateAssistantName,
} from '../core/robotStateMachine';
import type {
  AssistantPreferences,
  PersonalityStyle,
  RobotAccessory,
  RobotState,
  RobotStyle,
} from '../core/types';

interface CustomizeViewProps {
  preferences: AssistantPreferences;
  onUpdate: (patch: Partial<AssistantPreferences>) => void;
}

const STYLES: { id: RobotStyle; label: string; desc: string }[] = [
  { id: 'pod', label: 'Rounded Pod', desc: 'Soft pill silhouette with classic friendly ears.' },
  { id: 'aero', label: 'Aero Companion', desc: 'Swept playful ear-fins and sleek visor.' },
  { id: 'deskbot', label: 'Desk Bot', desc: 'Sculpted chamfered head with cozy display frame.' },
];

const ACCESSORIES: { id: RobotAccessory; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'halo', label: 'Halo Ring' },
  { id: 'beanie', label: 'Cozy Beanie' },
  { id: 'glasses', label: 'Round Glasses' },
  { id: 'headphones', label: 'Headphones' },
  { id: 'star', label: 'Star Pin' },
];

const PERSONALITIES: { id: PersonalityStyle; label: string; sample: string }[] = [
  { id: 'warm', label: 'Warm & Friendly', sample: '"Opening your camera! Ready when you are."' },
  { id: 'playful', label: 'Playful & Light', sample: '"Camera up! Strike a pose in five seconds!"' },
  { id: 'calm', label: 'Calm & Concise', sample: '"Opening camera. Countdown set to five seconds."' },
];

export const CustomizeView: React.FC<CustomizeViewProps> = ({ preferences, onUpdate }) => {
  const [nameDraft, setNameDraft] = useState(preferences.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [previewState, setPreviewState] = useState<RobotState>('IDLE');

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateAssistantName(nameDraft);
    if (!check.valid) {
      setNameError(check.error ?? 'Invalid name');
      setNameSaved(false);
      return;
    }
    setNameError(null);
    onUpdate({ name: check.cleaned });
    setNameDraft(check.cleaned);
    setNameSaved(true);
    setPreviewState('SUCCESS');
    window.setTimeout(() => setNameSaved(false), 2500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Live Character Preview */}
      <section className="lg:col-span-5 rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 lg:sticky lg:top-24">
        <h1 className="text-xl font-bold text-slate-900">Customize {preferences.name}</h1>
        <p className="mt-1 text-xs text-slate-500">
          All appearance settings are saved locally on this device only.
        </p>

        <div className="my-6 flex flex-col items-center justify-center rounded-2xl bg-slate-50 py-8 px-4 border border-slate-200/60">
          <RobotCharacter
            state={previewState}
            themeId={preferences.themeId}
            robotStyle={preferences.robotStyle}
            accessory={preferences.accessory}
            size={230}
            batterySaver={preferences.batterySaver}
            onClick={() =>
              setPreviewState((prev) => (prev === 'SUCCESS' ? 'IDLE' : 'SUCCESS'))
            }
            ariaLabel={`Live preview of ${preferences.name}`}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 mb-2">Test expression</p>
          <div className="grid grid-cols-4 gap-1.5">
            {ALL_ROBOT_STATES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setPreviewState(st)}
                className={`min-h-[34px] rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  previewState === st
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Customization Controls */}
      <section className="lg:col-span-7 rounded-3xl bg-white p-6 md:p-8 shadow-sm border border-slate-200/80 space-y-8">
        {/* Rename Assistant */}
        <form onSubmit={handleSaveName} className="space-y-3" noValidate>
          <label htmlFor="rename-assistant-input" className="block text-sm font-semibold text-slate-900">
            Assistant Name
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="rename-assistant-input"
              type="text"
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                if (nameError) setNameError(null);
              }}
              maxLength={28}
              className="flex-1 h-11 rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              Save Name
            </button>
          </div>
          {nameError && (
            <p role="alert" className="text-xs text-rose-600">
              {nameError}
            </p>
          )}
          {nameSaved && (
            <p role="status" className="text-xs text-emerald-700 font-medium">
              Saved! Your assistant will now respond as {preferences.name}.
            </p>
          )}
        </form>

        {/* Color Palette */}
        <div className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">Main &amp; Accent Colors</h2>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ROBOT_COLOR_THEMES.map((theme) => {
              const active = preferences.themeId === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => onUpdate({ themeId: theme.id })}
                  className={`min-h-[54px] flex items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center -space-x-1.5">
                      <span
                        className="w-6 h-6 rounded-full border border-slate-300"
                        style={{ backgroundColor: theme.shell }}
                      />
                      <span
                        className="w-6 h-6 rounded-full border border-white"
                        style={{ backgroundColor: theme.accent }}
                      />
                    </span>
                    <span className="text-sm font-medium text-slate-900">{theme.label}</span>
                  </div>
                  {active && <Check className="w-4 h-4 text-blue-600" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Robot Chassis Style */}
        <div className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">Robot Style</h2>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {STYLES.map((st) => {
              const active = preferences.robotStyle === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onUpdate({ robotStyle: st.id })}
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{st.label}</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{st.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accessories */}
        <div className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">Accessories</h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ACCESSORIES.map((acc) => {
              const active = preferences.accessory === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onUpdate({ accessory: acc.id })}
                  className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {acc.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Personality & Expression Style */}
        <div className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">Personality &amp; Voice Style</h2>
          <div className="mt-3 space-y-2.5">
            {PERSONALITIES.map((p) => {
              const active = preferences.personality === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onUpdate({ personality: p.id })}
                  className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{p.label}</span>
                    {active && <Check className="w-4 h-4 text-blue-600" aria-hidden="true" />}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{p.sample}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
