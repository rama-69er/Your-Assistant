import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Mic, Camera, Layers } from 'lucide-react';
import { RobotCharacter } from './RobotCharacter';
import { validateAssistantName } from '../core/robotStateMachine';
import type { AssistantPreferences, PersonalityStyle, RobotState } from '../core/types';

interface OnboardingViewProps {
  initialPreferences: AssistantPreferences;
  onComplete: (nextPrefs: AssistantPreferences) => void;
}

const NAME_SUGGESTIONS = ['Shimi', 'Buddy', 'Milo', 'Nova'];

const PERSONALITY_OPTIONS: { id: PersonalityStyle; title: string; summary: string }[] = [
  { id: 'warm', title: 'Warm & Friendly', summary: 'Approachable, natural, and reassuring.' },
  { id: 'playful', title: 'Playful & Light', summary: 'Upbeat expressions and cheerful replies.' },
  { id: 'calm', title: 'Calm & Concise', summary: 'Quiet, brief, and strictly to the point.' },
];

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  initialPreferences,
  onComplete,
}) => {
  const [nameInput, setNameInput] = useState(initialPreferences.name || 'Shimi');
  const [personality, setPersonality] = useState<PersonalityStyle>(initialPreferences.personality);
  const [cloudGeminiEnabled, setCloudGeminiEnabled] = useState<boolean>(
    initialPreferences.cloudGeminiEnabled
  );
  const [error, setError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<RobotState>('IDLE');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateAssistantName(nameInput);
    if (!check.valid) {
      setError(check.error ?? 'Please enter a valid name.');
      setPreviewState('CONFUSED');
      return;
    }
    setError(null);
    setPreviewState('SUCCESS');
    onComplete({
      ...initialPreferences,
      name: check.cleaned,
      personality,
      cloudGeminiEnabled,
      onboardingCompleted: true,
    });
  };

  return (
    <main className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-4 py-10 md:px-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left: Live Robot Companion Showcase */}
        <section className="lg:col-span-5 flex flex-col items-center text-center">
          <div className="relative flex flex-col items-center justify-center rounded-3xl bg-white p-8 shadow-sm border border-slate-200/80 w-full">
            <div className="mb-4 max-w-xs rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 border border-slate-200/70">
              Hi! I&apos;m your personal assistant. Give me a name, and I&apos;ll be ready to help.
            </div>

            <RobotCharacter
              state={previewState}
              themeId={initialPreferences.themeId}
              robotStyle={initialPreferences.robotStyle}
              accessory={initialPreferences.accessory}
              size={220}
              onClick={() =>
                setPreviewState((prev) => (prev === 'SUCCESS' ? 'IDLE' : 'SUCCESS'))
              }
              ariaLabel="Preview your personal assistant robot"
            />

            <p className="mt-4 text-xs text-slate-500">
              Tap the robot to see a reaction · Preferences stay stored locally on your device
            </p>
          </div>
        </section>

        {/* Right: Setup Form & Transparent Permission Overview */}
        <section className="lg:col-span-7">
          <div className="rounded-3xl bg-white p-6 md:p-8 shadow-sm border border-slate-200/80">
            <p className="text-sm font-medium text-blue-600">First-time setup</p>
            <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              What would you like to call your assistant?
            </h1>
            <p className="mt-2.5 text-sm md:text-base text-slate-600 leading-relaxed">
              Your chosen name is used across the interface and spoken replies. You can rename or
              customize your companion anytime.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-6" noValidate>
              <div>
                <label
                  htmlFor="assistant-name-input"
                  className="block text-sm font-medium text-slate-800"
                >
                  Assistant name
                </label>
                <input
                  id="assistant-name-input"
                  type="text"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (error) setError(null);
                    setPreviewState(e.target.value.trim() ? 'LISTENING' : 'IDLE');
                  }}
                  placeholder="Shimi, Buddy, or any name"
                  maxLength={28}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'assistant-name-error' : undefined}
                  className="mt-2 w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
                {error && (
                  <p id="assistant-name-error" role="alert" className="mt-2 text-sm text-rose-600">
                    {error}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Suggestions:</span>
                  {NAME_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setNameInput(suggestion);
                        setError(null);
                        setPreviewState('SUCCESS');
                      }}
                      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        nameInput.trim().toLowerCase() === suggestion.toLowerCase()
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              {/* Personality Style */}
              <div>
                <span className="block text-sm font-medium text-slate-800">
                  Response personality
                </span>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PERSONALITY_OPTIONS.map((opt) => {
                    const active = personality === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPersonality(opt.id)}
                        className={`text-left rounded-xl p-3.5 border transition-colors min-h-[44px] ${
                          active
                            ? 'border-blue-600 bg-blue-50/60 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-sm font-semibold">{opt.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{opt.summary}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Permissions & Privacy Disclosure */}
              <div className="border-t border-slate-200 pt-5 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-sm text-slate-600 leading-relaxed">
                    <p className="font-medium text-slate-900">Permissions are requested only when needed</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Nothing is granted behind your back. No conversation history, voice audio, or
                      private photos are saved.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <Mic className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Microphone activates only while you listen.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Camera className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Camera &amp; photo picker stay scoped to your active task.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Layers className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Android system overlay &amp; accessibility require native APK consent.</span>
                  </div>
                </div>

                <label className="flex items-start gap-3 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloudGeminiEnabled}
                    onChange={(e) => setCloudGeminiEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    <strong className="font-medium text-slate-800">
                      Enable Cloud Gemini understanding
                    </strong>{' '}
                    — Sends your command text securely to Gemini on our server to understand natural
                    language. Turn off anytime for local on-device command parsing only.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Meet {nameInput.trim() || 'Shimi'}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
};
