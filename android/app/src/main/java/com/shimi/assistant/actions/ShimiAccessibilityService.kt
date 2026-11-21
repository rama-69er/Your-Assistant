package com.shimi.assistant.actions

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Strictly opt-in Android AccessibilityService.
 * Only executes user-requested commands (scroll, back, home, recents, tap visible label,
 * enter text into an explicitly focused non-password field).
 * Never inspects password fields or attempts to bypass Android security prompts.
 */
class ShimiAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Privacy-first: Shimi does not passively log or upload screen contents.
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (instance === this) {
            instance = null
        }
        super.onDestroy()
    }

    fun getSafeRootNode(): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val pkg = root.packageName?.toString()?.lowercase().orEmpty()
        if (PROTECTED_PACKAGES.any { pkg.contains(it) }) {
            return null
        }
        return root
    }

    companion object {
        @Volatile
        var instance: ShimiAccessibilityService? = null
            private set

        private val PROTECTED_PACKAGES = listOf(
            "packageinstaller",
            "permissioncontroller",
            "biometric",
            "keyguard"
        )
    }
}
