import React, { useEffect, useRef, useState } from 'react';
import { Camera, Download, RotateCcw, Trash2, X } from 'lucide-react';

interface CameraModalProps {
  open: boolean;
  initialCountdownSeconds?: number;
  assistantName: string;
  onClose: () => void;
  onPermissionResult: (state: 'granted' | 'denied' | 'unsupported') => void;
  onPhotoCaptured: () => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  open,
  initialCountdownSeconds,
  assistantName,
  onClose,
  onPermissionResult,
  onPhotoCaptured,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);

  const stopCameraTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  useEffect(() => {
    if (!open) {
      stopCameraTracks();
      setCapturedDataUrl(null);
      setCountdown(null);
      setCameraError(null);
      return;
    }

    let cancelled = false;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera hardware API is not available in this browser.');
        onPermissionResult('unsupported');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        onPermissionResult('granted');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraReady(true);
        if (initialCountdownSeconds && initialCountdownSeconds > 0) {
          setCountdown(initialCountdownSeconds);
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          onPermissionResult('denied');
          setCameraError('I need camera permission before I can open your camera.');
        } else {
          onPermissionResult('unsupported');
          setCameraError('No accessible camera was found on this device.');
        }
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      stopCameraTracks();
    };
  }, [open, initialCountdownSeconds]);

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedDataUrl(dataUrl);
    stopCameraTracks();
    onPhotoCaptured();
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      captureFrame();
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${assistantName} camera`}
    >
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Live Camera</h2>
            <p className="text-xs text-slate-500">
              Temporary capture only · Nothing is uploaded or retained automatically
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 flex items-center justify-center">
          {cameraError ? (
            <div className="px-6 text-center text-sm text-slate-200">
              <p className="font-medium text-white">{cameraError}</p>
              <p className="mt-1 text-xs text-slate-400">
                Check Camera in the Permissions tab or browser site settings.
              </p>
            </div>
          ) : capturedDataUrl ? (
            <img
              src={capturedDataUrl}
              alt="Temporary captured photo"
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35">
                  <span className="font-mono tabular-nums text-6xl font-bold text-white drop-shadow-md">
                    {countdown}
                  </span>
                </div>
              )}
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {capturedDataUrl ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setCapturedDataUrl(null);
                  onClose();
                }}
                className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Discard &amp; Close
              </button>
              <div className="flex items-center gap-2">
                <a
                  href={capturedDataUrl}
                  download={`shimi-photo-${Date.now()}.jpg`}
                  className="min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Save to Device
                </a>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!cameraReady || countdown !== null}
                onClick={() => setCountdown(5)}
                className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                5s Timer
              </button>
              <button
                type="button"
                disabled={!cameraReady}
                onClick={captureFrame}
                className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Take Photo Now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
