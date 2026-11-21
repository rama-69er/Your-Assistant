import type { PermissionKey, PermissionStateValue, PermissionStatusMap } from '../core/types';

export const INITIAL_PERMISSION_STATUS: PermissionStatusMap = {
  microphone: 'prompt',
  camera: 'prompt',
  photos: 'prompt',
  notifications: 'prompt',
  overlay: 'android_native_only',
  accessibility: 'android_native_only',
  notification_listener: 'android_native_only',
};

export interface PermissionDescriptor {
  key: PermissionKey;
  title: string;
  scope: 'web_and_android' | 'android_native_only';
  whyNeeded: string;
  howToManage: string;
  androidPermissionName: string;
}

export const PERMISSION_CATALOG: PermissionDescriptor[] = [
  {
    key: 'microphone',
    title: 'Microphone',
    scope: 'web_and_android',
    whyNeeded: 'Listens to your voice commands only while an assistant session is active and unmuted.',
    howToManage: 'Tap Allow when prompted, or revoke anytime in Browser Site Settings or Android App Permissions.',
    androidPermissionName: 'android.permission.RECORD_AUDIO',
  },
  {
    key: 'camera',
    title: 'Camera',
    scope: 'web_and_android',
    whyNeeded: 'Opens the live viewfinder and runs countdown timers when you ask to take a picture.',
    howToManage: 'Requested only when you trigger a camera command or enable it here. Photos are never retained automatically.',
    androidPermissionName: 'android.permission.CAMERA',
  },
  {
    key: 'photos',
    title: 'Scoped Photo Picker',
    scope: 'web_and_android',
    whyNeeded: 'Lets you pick specific photos for temporary in-memory search without exposing your whole gallery.',
    howToManage: 'Uses Android Photo Picker / browser file picker per task. Temporary selections clear when you stop.',
    androidPermissionName: 'ActivityResultContracts.PickMultipleVisualMedia',
  },
  {
    key: 'notifications',
    title: 'Foreground & Alert Notifications',
    scope: 'web_and_android',
    whyNeeded: 'Shows a clear notification indicator when the assistant session is active on Android 13+.',
    howToManage: 'Enable or revoke in Browser Notifications or Android Settings > Apps > Shimi > Notifications.',
    androidPermissionName: 'android.permission.POST_NOTIFICATIONS',
  },
  {
    key: 'overlay',
    title: 'Display Over Other Apps',
    scope: 'android_native_only',
    whyNeeded: 'Allows the floating robot character to stay visible on top of other installed Android apps.',
    howToManage: 'Native Android APK only: Settings > Apps > Special app access > Display over other apps > Shimi.',
    androidPermissionName: 'android.permission.SYSTEM_ALERT_WINDOW',
  },
  {
    key: 'accessibility',
    title: 'Accessibility Service',
    scope: 'android_native_only',
    whyNeeded: 'Enables scrolling, navigating back, and typing inside accessible third-party Android apps when permitted.',
    howToManage: 'Native Android APK only: Settings > Accessibility > Installed apps > Shimi Assistant. Never bypasses protected screens.',
    androidPermissionName: 'android.permission.BIND_ACCESSIBILITY_SERVICE',
  },
  {
    key: 'notification_listener',
    title: 'Notification Access',
    scope: 'android_native_only',
    whyNeeded: 'Allows Shimi to read incoming notifications from other Android apps aloud when you ask.',
    howToManage: 'Native Android APK only: Settings > Notifications > Device & app notifications > Shimi.',
    androidPermissionName: 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
  },
];

async function queryBrowserPermission(name: 'microphone' | 'camera' | 'notifications'): Promise<PermissionStateValue> {
  if (typeof navigator === 'undefined') return 'unsupported';
  if (name === 'notifications' && typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'prompt';
  }
  if (!navigator.permissions || !navigator.permissions.query) {
    return 'prompt';
  }
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function inspectDevicePermissions(): Promise<PermissionStatusMap> {
  const [microphone, camera, notifications] = await Promise.all([
    queryBrowserPermission('microphone'),
    queryBrowserPermission('camera'),
    queryBrowserPermission('notifications'),
  ]);

  return {
    microphone,
    camera,
    photos: 'prompt',
    notifications,
    overlay: 'android_native_only',
    accessibility: 'android_native_only',
    notification_listener: 'android_native_only',
  };
}

export async function requestRealPermission(
  key: PermissionKey
): Promise<{ state: PermissionStateValue; message: string }> {
  if (key === 'overlay' || key === 'accessibility' || key === 'notification_listener') {
    return {
      state: 'android_native_only',
      message:
        'This permission is controlled by Android OS and only activates in the native Android APK build (included in the Android Export tab).',
    };
  }

  if (key === 'photos') {
    return {
      state: 'granted',
      message: 'Scoped Photo Picker is ready. You will choose specific photos each time you search.',
    };
  }

  if (key === 'notifications') {
    if (typeof Notification === 'undefined') {
      return { state: 'unsupported', message: 'Browser notifications are not supported in this environment.' };
    }
    try {
      const res = await Notification.requestPermission();
      const state: PermissionStateValue = res === 'granted' ? 'granted' : res === 'denied' ? 'denied' : 'prompt';
      return {
        state,
        message:
          state === 'granted'
            ? 'Notification permission granted.'
            : 'Notification permission was not granted. You can change this in browser site settings.',
      };
    } catch {
      return { state: 'denied', message: 'Could not request notification permission.' };
    }
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      state: 'unsupported',
      message: `This browser environment does not expose ${key} hardware access.`,
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      key === 'microphone' ? { audio: true } : { video: true }
    );
    // Immediately stop hardware tracks after verifying permission so we never leave mic/camera active!
    stream.getTracks().forEach((track) => track.stop());
    return {
      state: 'granted',
      message:
        key === 'microphone'
          ? 'Microphone permission granted. Hardware stays off until you start listening.'
          : 'Camera permission granted. Camera stays off until you ask to open it.',
    };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        state: 'denied',
        message:
          key === 'microphone'
            ? 'I need microphone permission before I can listen to your commands.'
            : 'Camera permission was denied. Enable it in browser settings to use camera commands.',
      };
    }
    return {
      state: 'unsupported',
      message:
        key === 'microphone'
          ? 'No accessible microphone device was detected in this browser.'
          : 'No accessible camera device was detected in this browser.',
    };
  }
}
