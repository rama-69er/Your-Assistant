import type { PermissionKey, PermissionStateValue, PermissionStatusMap, SettingsTarget } from '../core/types';
import { nativeBridge } from './nativeBridge';

export const INITIAL_PERMISSION_STATUS: PermissionStatusMap = {
  microphone: 'prompt',
  camera: 'prompt',
  photos: 'prompt',
  notifications: 'prompt',
  contacts: 'android_native_only',
  overlay: 'android_native_only',
  accessibility: 'android_native_only',
  notification_listener: 'android_native_only',
  battery_optimization: 'android_native_only',
};

export interface PermissionDescriptor {
  key: PermissionKey;
  title: string;
  scope: 'web_and_android' | 'android_native_only';
  whyNeeded: string;
  howToManage: string;
  androidPermissionName: string;
  androidSettingsTarget?: SettingsTarget;
}

export const PERMISSION_CATALOG: PermissionDescriptor[] = [
  {
    key: 'microphone',
    title: 'Microphone',
    scope: 'web_and_android',
    whyNeeded: 'Powers local wake-word listening and voice command capture only while enabled.',
    howToManage: 'Allow when prompted, or revoke anytime in Browser Site Settings or Android App Permissions.',
    androidPermissionName: 'android.permission.RECORD_AUDIO',
    androidSettingsTarget: 'app_details',
  },
  {
    key: 'camera',
    title: 'Camera',
    scope: 'web_and_android',
    whyNeeded: 'Opens the live viewfinder and runs countdown timers when you ask to take a picture.',
    howToManage: 'Requested only when you trigger a camera command or enable it here. Photos are never retained automatically.',
    androidPermissionName: 'android.permission.CAMERA',
    androidSettingsTarget: 'app_details',
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
    whyNeeded: 'Displays the required transparent status notification whenever Shimi runs its foreground service on Android 13+.',
    howToManage: 'Enable or revoke in Browser Notifications or Android Settings > Apps > Shimi > Notifications.',
    androidPermissionName: 'android.permission.POST_NOTIFICATIONS',
    androidSettingsTarget: 'notifications',
  },
  {
    key: 'contacts',
    title: 'Contacts (Optional)',
    scope: 'android_native_only',
    whyNeeded: 'Resolves contact names like "Call Rahul" locally on-device before asking for your call confirmation.',
    howToManage: 'Native Android APK only: Settings > Apps > Shimi > Permissions > Contacts.',
    androidPermissionName: 'android.permission.READ_CONTACTS',
    androidSettingsTarget: 'app_details',
  },
  {
    key: 'overlay',
    title: 'Display Over Other Apps',
    scope: 'android_native_only',
    whyNeeded: 'Keeps the small draggable Shimi floating robot available over other apps after minimizing.',
    howToManage: 'Native Android APK: Settings > Apps > Special app access > Display over other apps > Shimi.',
    androidPermissionName: 'android.permission.SYSTEM_ALERT_WINDOW',
    androidSettingsTarget: 'overlay',
  },
  {
    key: 'accessibility',
    title: 'Accessibility Service',
    scope: 'android_native_only',
    whyNeeded: 'Allows scrolling, clicking visible buttons, typing into editable fields, and back/home actions in other apps when no official API exists. Never bypasses security screens.',
    howToManage: 'Native Android APK: Settings > Accessibility > Installed apps > Shimi Assistant.',
    androidPermissionName: 'android.permission.BIND_ACCESSIBILITY_SERVICE',
    androidSettingsTarget: 'accessibility',
  },
  {
    key: 'notification_listener',
    title: 'Notification Access',
    scope: 'android_native_only',
    whyNeeded: 'Lets Shimi read incoming non-sensitive notifications aloud when you ask.',
    howToManage: 'Native Android APK: Settings > Notifications > Device & app notifications > Shimi.',
    androidPermissionName: 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
    androidSettingsTarget: 'notifications',
  },
  {
    key: 'battery_optimization',
    title: 'Unrestricted Battery (Optional)',
    scope: 'android_native_only',
    whyNeeded: 'Prevents aggressive Android OEM battery savers from killing the background wake-word foreground service.',
    howToManage: 'Native Android APK: Settings > Apps > Shimi > Battery > Unrestricted.',
    androidPermissionName: 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    androidSettingsTarget: 'battery',
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

  const base: PermissionStatusMap = {
    microphone,
    camera,
    photos: 'prompt',
    notifications,
    contacts: 'android_native_only',
    overlay: 'android_native_only',
    accessibility: 'android_native_only',
    notification_listener: 'android_native_only',
    battery_optimization: 'android_native_only',
  };

  // Merge truthful live permissions from native Android APK if attached
  if (nativeBridge.isNativeAvailable()) {
    const snap = nativeBridge.getSnapshot();
    return {
      ...base,
      ...(snap.permissions ?? {}),
      overlay: snap.permissions?.overlay ?? (snap.overlayVisible ? 'granted' : 'prompt'),
      accessibility: snap.accessibilityConnected ? 'granted' : 'prompt',
      notification_listener: snap.notificationListenerConnected ? 'granted' : 'prompt',
      battery_optimization: snap.batteryOptimizationIgnored ? 'granted' : 'prompt',
    };
  }

  return base;
}

export async function requestRealPermission(
  key: PermissionKey
): Promise<{ state: PermissionStateValue; message: string }> {
  const descriptor = PERMISSION_CATALOG.find((p) => p.key === key);

  if (descriptor?.scope === 'android_native_only') {
    if (nativeBridge.isNativeAvailable()) {
      const target: SettingsTarget = descriptor.androidSettingsTarget ?? 'app_details';
      const res =
        key === 'battery_optimization'
          ? nativeBridge.requestBatteryOptimizationExemption()
          : nativeBridge.openAndroidSetting(target);
      const updated = await inspectDevicePermissions();
      return {
        state: updated[key],
        message: res.message,
      };
    }
    return {
      state: 'android_native_only',
      message:
        'This permission is managed by Android OS and activates when Shimi runs inside the native Android APK companion.',
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
