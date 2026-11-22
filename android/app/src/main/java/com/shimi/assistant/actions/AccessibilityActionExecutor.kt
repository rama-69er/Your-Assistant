package com.shimi.assistant.actions

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import com.shimi.assistant.data.ActionResult

/**
 * Performs safe, explicit UI interaction via ShimiAccessibilityService when enabled by the user.
 * Enforces strict refusal on password fields, OTP/biometric prompts, permission dialogs,
 * banking/payment security screens, and system installers.
 */
object AccessibilityActionExecutor {

    private const val PROTECTED_SCREEN_MSG = "I can't interact with this protected screen."

    fun isWindowReady(packageHint: String?): Boolean {
        val service = ShimiAccessibilityService.instance ?: return false
        val root = service.getSafeRootNode() ?: return false
        if (packageHint.isNullOrBlank()) return true
        val pkg = root.packageName?.toString()?.lowercase().orEmpty()
        return pkg.contains(packageHint.lowercase())
    }

    fun findVisibleControl(label: String): ActionResult {
        val service = ShimiAccessibilityService.instance
            ?: return ActionResult(
                ok = false,
                status = "blocked_permission",
                message = "Enable Shimi Accessibility Service in Android Settings to inspect visible controls."
            )
        val root = service.getSafeRootNode()
            ?: return ActionResult(false, "error", PROTECTED_SCREEN_MSG)

        val match = findNodeByTextOrContentDesc(root, label)
            ?: return ActionResult(false, "error", "Couldn't find \"$label\" on the current screen.")

        return ActionResult(true, "executed", "Found \"$label\".")
    }

    fun performGlobal(action: Int, description: String): ActionResult {
        val service = ShimiAccessibilityService.instance
            ?: return ActionResult(
                ok = false,
                status = "blocked_permission",
                message = "Enable Shimi Accessibility Service in Android Settings to use \"$description\"."
            )
        val ok = service.performGlobalAction(action)
        return ActionResult(
            ok = ok,
            status = if (ok) "executed" else "error",
            message = if (ok) "Performed $description." else "Android did not accept $description on this screen."
        )
    }

    fun scroll(direction: String): ActionResult {
        val service = ShimiAccessibilityService.instance
            ?: return ActionResult(
                ok = false,
                status = "blocked_permission",
                message = "Enable Shimi Accessibility Service in Android Settings to scroll apps by voice."
            )
        val root = service.getSafeRootNode()
            ?: return ActionResult(false, "error", PROTECTED_SCREEN_MSG)

        val scrollable = findScrollableNode(root)
            ?: return ActionResult(false, "error", "No scrollable container found on the current screen.")

        val action = if (direction == "up") {
            AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        } else {
            AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        }
        val ok = scrollable.performAction(action)
        return ActionResult(
            ok = ok,
            status = if (ok) "executed" else "error",
            message = if (ok) "Scrolled $direction." else "Reached the end of the scrollable view."
        )
    }

    fun clickByText(label: String): ActionResult {
        val service = ShimiAccessibilityService.instance
            ?: return ActionResult(
                ok = false,
                status = "blocked_permission",
                message = "Enable Shimi Accessibility Service in Android Settings to tap UI elements by voice."
            )
        val root = service.getSafeRootNode()
            ?: return ActionResult(false, "error", PROTECTED_SCREEN_MSG)

        val target = findNodeByTextOrContentDesc(root, label)
            ?: return ActionResult(false, "error", "Couldn't find a visible control labeled \"$label\".")

        if (target.isPassword) {
            return ActionResult(false, "error", PROTECTED_SCREEN_MSG)
        }

        var clickable: AccessibilityNodeInfo? = target
        while (clickable != null && !clickable.isClickable) {
            clickable = clickable.parent
        }
        val ok = clickable?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
        return ActionResult(
            ok = ok,
            status = if (ok) "executed" else "error",
            message = if (ok) "Tapped \"$label\"." else "Found \"$label\", but it is not clickable."
        )
    }

    fun typeIntoSafeField(text: String, hintLabel: String? = null): ActionResult {
        val service = ShimiAccessibilityService.instance
            ?: return ActionResult(false, "blocked_permission", "Accessibility Service is not enabled.")
        val root = service.getSafeRootNode()
            ?: return ActionResult(false, "error", PROTECTED_SCREEN_MSG)

        val editable = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: findEditableNode(root, hintLabel)
            ?: return ActionResult(false, "error", "No editable message input field found on screen.")

        if (editable.isPassword || isSensitiveField(editable)) {
            return ActionResult(false, "error", PROTECTED_SCREEN_MSG)
        }

        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val ok = editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        return ActionResult(
            ok = ok,
            status = if (ok) "executed" else "error",
            message = if (ok) "Entered text into field." else "Could not enter text into that field."
        )
    }

    private fun isSensitiveField(node: AccessibilityNodeInfo): Boolean {
        val combined = listOfNotNull(
            node.text?.toString(),
            node.contentDescription?.toString(),
            node.hintText?.toString(),
            node.viewIdResourceName
        ).joinToString(" ").lowercase()
        return listOf("password", "passcode", "otp", "pin", "cvv", "card_number", "biometric")
            .any { combined.contains(it) }
    }

    private fun findNodeByTextOrContentDesc(
        root: AccessibilityNodeInfo,
        query: String
    ): AccessibilityNodeInfo? {
        val byText = root.findAccessibilityNodeInfosByText(query)
            ?.firstOrNull { !it.isPassword }
        if (byText != null) return byText
        return walkFind(root) { node ->
            !node.isPassword && (
                node.contentDescription?.toString()?.contains(query, ignoreCase = true) == true ||
                    node.text?.toString()?.contains(query, ignoreCase = true) == true
                )
        }
    }

    private fun findEditableNode(
        root: AccessibilityNodeInfo,
        hintLabel: String?
    ): AccessibilityNodeInfo? {
        return walkFind(root) { node ->
            node.isEditable && !node.isPassword && (
                hintLabel.isNullOrBlank() ||
                    node.hintText?.toString()?.contains(hintLabel, ignoreCase = true) == true ||
                    node.contentDescription?.toString()?.contains(hintLabel, ignoreCase = true) == true ||
                    node.className?.toString()?.contains("EditText", ignoreCase = true) == true
                )
        }
    }

    private fun findScrollableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? =
        if (node == null) null else walkFind(node) { it.isScrollable }

    private fun walkFind(
        node: AccessibilityNodeInfo,
        predicate: (AccessibilityNodeInfo) -> Boolean
    ): AccessibilityNodeInfo? {
        if (predicate(node)) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val match = walkFind(child, predicate)
            if (match != null) return match
        }
        return null
    }

    fun goBack(): ActionResult = performGlobal(AccessibilityService.GLOBAL_ACTION_BACK, "Go Back")
    fun goHome(): ActionResult = performGlobal(AccessibilityService.GLOBAL_ACTION_HOME, "Go Home")
    fun openRecents(): ActionResult = performGlobal(AccessibilityService.GLOBAL_ACTION_RECENTS, "Recent Apps")
}
