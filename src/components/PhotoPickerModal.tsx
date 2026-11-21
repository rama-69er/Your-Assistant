import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Search, Trash2, X, Shield } from 'lucide-react';
import type { ScopedPhotoItem } from '../core/types';
import { analyzeScopedPhotoEphemerally } from '../services/geminiService';

interface PhotoPickerModalProps {
  open: boolean;
  initialSubject: string;
  cloudGeminiEnabled: boolean;
  onClose: () => void;
}

export const PhotoPickerModal: React.FC<PhotoPickerModalProps> = ({
  open,
  initialSubject,
  cloudGeminiEnabled,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [subject, setSubject] = useState(initialSubject || '');
  const [photos, setPhotos] = useState<ScopedPhotoItem[]>([]);
  const [filesMap, setFilesMap] = useState<Map<string, File>>(new Map());
  const [searching, setSearching] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    setSubject(initialSubject || '');
  }, [initialSubject]);

  const clearTemporaryPhotos = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setFilesMap(new Map());
    setStatusNote('Temporary photo references cleared from memory.');
  };

  useEffect(() => {
    if (!open) {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      setFilesMap(new Map());
      setStatusNote(null);
    }
  }, [open]);

  if (!open) return null;

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const nextPhotos: ScopedPhotoItem[] = [];
    const nextMap = new Map(filesMap);

    Array.from(fileList).forEach((file) => {
      const id = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      nextMap.set(id, file);
      nextPhotos.push({
        id,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
      });
    });

    setFilesMap(nextMap);
    setPhotos((prev) => [...prev, ...nextPhotos]);
    setStatusNote(`Loaded ${nextPhotos.length} user-selected photo(s) temporarily in memory.`);
    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Could not read selected file.'));
      reader.readAsDataURL(file);
    });

  const handleSearch = async () => {
    const trimmed = subject.trim();
    if (!trimmed || photos.length === 0) return;

    if (!cloudGeminiEnabled) {
      // Honest local filename-only matching when cloud vision is disabled
      const needle = trimmed.toLowerCase();
      setPhotos((prev) =>
        prev.map((item) => {
          const hit = item.name.toLowerCase().includes(needle);
          return {
            ...item,
            matched: hit,
            matchReason: hit
              ? 'Matched locally by filename.'
              : 'On-device image recognition model is not bundled in the web app; matched by filename only while Cloud Gemini is off.',
          };
        })
      );
      setStatusNote(
        'Searched locally by filename. Enable Cloud Gemini Processing in Privacy for ephemeral visual matching.'
      );
      return;
    }

    setSearching(true);
    setStatusNote('Inspecting only your selected photos ephemerally in memory...');
    try {
      const updated = await Promise.all(
        photos.map(async (item) => {
          const file = filesMap.get(item.id);
          if (!file) return item;
          try {
            const base64 = await fileToBase64(file);
            const res = await analyzeScopedPhotoEphemerally({
              imageBase64: base64,
              mimeType: file.type || 'image/jpeg',
              subject: trimmed,
            });
            return {
              ...item,
              matched: res.matched,
              matchReason: res.reason,
            };
          } catch (err) {
            return {
              ...item,
              matched: false,
              matchReason:
                err instanceof Error ? err.message : 'Could not analyze this photo right now.',
            };
          }
        })
      );
      setPhotos(updated);
      const matchCount = updated.filter((p) => p.matched).length;
      setStatusNote(
        `Finished temporary inspection: ${matchCount} of ${updated.length} selected photo(s) matched "${trimmed}". Nothing was stored.`
      );
    } finally {
      setSearching(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Temporary scoped photo picker"
    >
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Scoped Temporary Photo Search</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Full gallery background scanning is never used. Pick only the photos you want to inspect.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo picker"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 border border-slate-200/70">
          <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            {cloudGeminiEnabled
              ? 'Cloud Gemini is enabled: only the photos you explicitly pick below are sent transiently to find matches and are discarded immediately when you close this window.'
              : 'Cloud Gemini is off: photos stay 100% on your device and are matched by filename only (no on-device vision model is bundled in the web client).'}
          </p>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What are you looking for? (e.g., Lucky)"
            aria-label="Photo search subject"
            className="flex-1 h-11 rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <ImagePlus className="w-4 h-4" />
            Choose Photos
          </button>
          <button
            type="button"
            disabled={photos.length === 0 || !subject.trim() || searching}
            onClick={handleSearch}
            className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Search className="w-4 h-4" />
            {searching ? 'Checking...' : 'Find Matches'}
          </button>
        </div>

        {statusNote && <p className="mt-3 text-xs text-slate-600">{statusNote}</p>}

        {photos.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className={`overflow-hidden rounded-2xl border ${
                  photo.matched === true
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="aspect-square bg-slate-100 overflow-hidden">
                  <img
                    src={photo.previewUrl}
                    alt={photo.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2.5 text-xs">
                  <p className="font-medium text-slate-900 truncate">{photo.name}</p>
                  {photo.matched !== undefined && (
                    <p
                      className={`mt-1 ${
                        photo.matched ? 'text-emerald-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      {photo.matched ? 'Match' : 'No match'} — {photo.matchReason}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 py-10 px-4 text-center text-sm text-slate-500">
            Tap &ldquo;Choose Photos&rdquo; to open your device&apos;s Photo Picker.
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={clearTemporaryPhotos}
            disabled={photos.length === 0}
            className="min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Temporary Photos
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
