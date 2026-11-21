package com.shimi.assistant.actions

import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.view.KeyEvent
import com.shimi.assistant.data.ActionResult
import java.util.Locale

/**
 * Executes legitimate public Android OS device controls:
 * Flashlight (CameraManager), Volume & Media keys (AudioManager), Alarms & Timers (AlarmClock),
 * Camera intent, Dialer + Contacts lookup, Calendar event draft, and Settings shortcuts.
 */
class DeviceControlManager(private val context: Context) {

    @Volatile
    private var torchEnabled = false

    fun setFlashlight(mode: String): ActionResult {
        val cm = context.getSystemService(CameraManager::class.java)
            ?: return ActionResult(false, "error", "CameraManager unavailable on this device.")
        val cameraId = runCatching {
            cm.cameraIdList.firstOrNull { id ->
                val chars = cm.getCameraCharacteristics(id)
                chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true &&
                    chars.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
            } ?: cm.cameraIdList.firstOrNull { id ->
                cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }
        }.getOrNull() ?: return ActionResult(false, "error", "No camera flash hardware found.")

        val desired = when (mode.lowercase(Locale.getDefault())) {
            "on" -> true
            "off" -> false
            else -> !torchEnabled
        }
        return runCatching {
            cm.setTorchMode(cameraId, desired)
            torchEnabled = desired
            ActionResult(true, "executed", if (desired) "Flashlight turned on." else "Flashlight turned off.")
        }.getOrElse { err ->
            ActionResult(false, "error", "Could not toggle flashlight: ${err.message ?: "hardware busy"}.")
        }
    }

    fun adjustVolume(direction: String): ActionResult {
        val am = context.getSystemService(AudioManager::class.java)
            ?: return ActionResult(false, "error", "AudioManager unavailable.")
        return runCatching {
            when (direction.lowercase(Locale.getDefault())) {
                "up" -> am.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    AudioManager.ADJUST_RAISE,
                    AudioManager.FLAG_SHOW_UI
                )
                "down" -> am.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    AudioManager.ADJUST_LOWER,
                    AudioManager.FLAG_SHOW_UI
                )
                "mute" -> am.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    AudioManager.ADJUST_MUTE,
                    AudioManager.FLAG_SHOW_UI
                )
                "unmute" -> am.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    AudioManager.ADJUST_UNMUTE,
                    AudioManager.FLAG_SHOW_UI
                )
            }
            ActionResult(true, "executed", "Adjusted media volume ($direction).")
        }.getOrElse { err ->
            ActionResult(false, "error", "Volume adjustment failed: ${err.message}")
        }
    }

    fun dispatchMediaKey(action: String): ActionResult {
        val am = context.getSystemService(AudioManager::class.java)
            ?: return ActionResult(false, "error", "AudioManager unavailable.")
        val keyCode = when (action.lowercase(Locale.getDefault())) {
            "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
            "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
            "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
            "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
            else -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        }
        return runCatching {
            am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
            am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
            ActionResult(true, "executed", "Dispatched media $action command.")
        }.getOrElse { err ->
            ActionResult(false, "error", "Media control failed: ${err.message}")
        }
    }

    fun setTimer(seconds: Int, label: String): ActionResult {
        val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
            putExtra(AlarmClock.EXTRA_LENGTH, seconds.coerceIn(1, 86400))
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
            putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return startSafeActivity(intent, "Set a ${seconds}s timer.")
    }

    fun setAlarm(rawTime: String, label: String): ActionResult {
        val (hour, minute) = parseHourMinute(rawTime)
        val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
            putExtra(AlarmClock.EXTRA_HOUR, hour)
            putExtra(AlarmClock.EXTRA_MINUTES, minute)
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
            putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return startSafeActivity(intent, "Prepared alarm for %02d:%02d.".format(hour, minute))
    }

    fun openCamera(): ActionResult {
        val intent = Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return startSafeActivity(intent, "Opened Android Camera.")
    }

    fun openSettings(target: String): ActionResult {
        val action = when (target.lowercase(Locale.getDefault())) {
            "wifi" -> Settings.ACTION_WIFI_SETTINGS
            "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
            "battery" -> Settings.ACTION_BATTERY_SAVER_SETTINGS
            "display" -> Settings.ACTION_DISPLAY_SETTINGS
            "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
            "notifications" -> Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }
        val intent = Intent(action).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        return startSafeActivity(intent, "Opened Android $target settings.")
    }

    fun openDialer(contactOrNumber: String, hasContactsPerm: Boolean): ActionResult {
        val digitsOnly = contactOrNumber.filter { it.isDigit() || it == '+' }
        val number = if (digitsOnly.length >= 3) {
            digitsOnly
        } else if (hasContactsPerm) {
            lookupContactPhone(contactOrNumber)
        } else {
            null
        }

        val uri = if (!number.isNullOrBlank()) Uri.parse("tel:$number") else Uri.parse("tel:")
        val intent = Intent(Intent.ACTION_DIAL, uri).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        return startSafeActivity(
            intent,
            if (!number.isNullOrBlank()) "Opened dialer for $contactOrNumber ($number)."
            else "Opened dialer. Grant Contacts permission to auto-fill phone numbers by name."
        )
    }

    fun searchContacts(query: String?): ActionResult {
        val intent = Intent(Intent.ACTION_VIEW, ContactsContract.Contacts.CONTENT_URI).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return startSafeActivity(intent, "Opened Contacts${query?.let { " for $it" } ?: ""}.")
    }

    fun openCalendar(title: String?): ActionResult {
        val intent = if (!title.isNullOrBlank()) {
            Intent(Intent.ACTION_INSERT).apply {
                data = CalendarContract.Events.CONTENT_URI
                putExtra(CalendarContract.Events.TITLE, title)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        } else {
            Intent(Intent.ACTION_VIEW, CalendarContract.CONTENT_URI.buildUpon().appendPath("time").build()).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
        return startSafeActivity(intent, if (!title.isNullOrBlank()) "Opened Calendar draft for \"$title\"." else "Opened Calendar.")
    }

    fun openWebOrDeepLink(uriString: String, packageHint: String? = null, successMessage: String): ActionResult {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uriString)).apply {
            if (!packageHint.isNullOrBlank()) setPackage(packageHint)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val firstTry = runCatching {
            context.startActivity(intent)
            ActionResult(true, "executed", successMessage)
        }.getOrNull()
        if (firstTry != null) return firstTry

        // Fallback without package hint
        val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(uriString)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return startSafeActivity(fallback, successMessage)
    }

    private fun lookupContactPhone(name: String): String? {
        val projection = arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER)
        val selection = "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?"
        val args = arrayOf("%$name%")
        return runCatching {
            context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                selection,
                args,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }.getOrNull()
    }

    private fun startSafeActivity(intent: Intent, successMessage: String): ActionResult {
        return runCatching {
            context.startActivity(intent)
            ActionResult(true, "executed", successMessage)
        }.getOrElse { err ->
            ActionResult(
                ok = false,
                status = "error",
                message = "Could not launch Android activity (${err.message ?: "no compatible app or background launch restricted"})."
            )
        }
    }

    private fun parseHourMinute(raw: String): Pair<Int, Int> {
        val match = Regex("(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?", RegexOption.IGNORE_CASE)
            .find(raw) ?: return 7 to 0
        var hour = match.groupValues[1].toIntOrNull() ?: 7
        val minute = match.groupValues[2].toIntOrNull() ?: 0
        val meridiem = match.groupValues[3].lowercase(Locale.getDefault())
        if (meridiem.startsWith("p") && hour in 1..11) hour += 12
        if (meridiem.startsWith("a") && hour == 12) hour = 0
        return hour.coerceIn(0, 23) to minute.coerceIn(0, 59)
    }
}
