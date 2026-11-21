package com.shimi.assistant.actions

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.shimi.assistant.data.ActionResult
import com.shimi.assistant.data.InstalledAppRecord
import java.util.Locale

/**
 * Dynamically discovers installed launcher apps via PackageManager (respecting Android 11+ `<queries>`)
 * with an in-memory cache and friendly alias normalization.
 */
class AppLauncher(private val context: Context) {

    @Volatile
    private var cachedApps: List<InstalledAppRecord> = emptyList()

    @Volatile
    private var lastCacheMs: Long = 0L

    private val aliases = mapOf(
        "yt" to "youtube",
        "whats app" to "whatsapp",
        "wa" to "whatsapp",
        "google maps" to "maps",
        "browser" to "chrome",
        "mail" to "gmail",
        "clock" to "clock",
        "settings" to "settings",
        "gallery" to "photos"
    )

    fun listInstalledApps(forceRefresh: Boolean = false): List<InstalledAppRecord> {
        val now = System.currentTimeMillis()
        if (!forceRefresh && cachedApps.isNotEmpty() && now - lastCacheMs < CACHE_TTL_MS) {
            return cachedApps
        }
        val pm = context.packageManager
        val mainIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = pm.queryIntentActivities(mainIntent, PackageManager.MATCH_ALL)
        val list = resolved.mapNotNull { info ->
            val pkg = info.activityInfo?.packageName ?: return@mapNotNull null
            val label = info.loadLabel(pm)?.toString()?.trim().orEmpty()
            if (label.isBlank()) null else InstalledAppRecord(label = label, packageName = pkg)
        }.distinctBy { it.packageName }.sortedBy { it.label.lowercase(Locale.getDefault()) }

        cachedApps = list
        lastCacheMs = now
        return list
    }

    fun launchByName(rawName: String): ActionResult {
        val query = rawName.trim().lowercase(Locale.getDefault())
        if (query.isBlank()) {
            return ActionResult(false, "error", "Please tell me which app to open.")
        }
        val normalized = aliases[query] ?: query
        val apps = listInstalledApps()

        val exact = apps.firstOrNull { it.label.equals(normalized, ignoreCase = true) }
        val startsWith = exact ?: apps.firstOrNull {
            it.label.lowercase(Locale.getDefault()).startsWith(normalized)
        }
        val contains = startsWith ?: apps.firstOrNull {
            it.label.lowercase(Locale.getDefault()).contains(normalized) ||
                it.packageName.lowercase(Locale.getDefault()).contains(normalized)
        }

        val target = contains ?: return ActionResult(
            ok = false,
            status = "error",
            message = "I couldn't find an installed app named \"$rawName\" on this device."
        )

        val launchIntent = context.packageManager.getLaunchIntentForPackage(target.packageName)
            ?: return ActionResult(
                ok = false,
                status = "error",
                message = "Found ${target.label}, but Android doesn't expose a launcher activity for it."
            )

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching {
            context.startActivity(launchIntent)
            ActionResult(true, "executed", "Opened ${target.label}.")
        }.getOrElse { err ->
            ActionResult(
                ok = false,
                status = "error",
                message = "Android blocked launching ${target.label} from background (${err.message ?: "BAL restriction"})."
            )
        }
    }

    companion object {
        private const val CACHE_TTL_MS = 60_000L
    }
}
