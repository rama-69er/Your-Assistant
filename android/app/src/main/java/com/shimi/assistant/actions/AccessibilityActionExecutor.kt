package com.shimi.assistant.actions

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import com.shimi.assistant.data.ActionResult

/**
 * Performs safe, explicit UI automation via ShimiAccessibilityService when enabled by the user.
 */
object AccessibilityActionExecutor {

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
            ?: return ActionResult(false, "error", "Current screen is protected or unavailable for scrolling.")

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
            ?: return ActionResult(false, "error", "Shimi will not automate protected Android security screens.")

        val matches = root.findAccessibilityNodeInfosByText(label)
        val target = matches?.firstOrNull { !it.isPassword }
            ?: return ActionResult(false, "error", "Couldn't find a visible control labeled \"$label\".")

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

    fun inputTextIntoFocusedField(text: String): ActionResult {
        val service = ShimiAccessibilityService.instance
            ?: return ActionResult(false, "blocked_permission", "Accessibility Service is not enabled.")
        val root = service.getSafeRootNode()
            ?: return ActionResult(false, "error", "Protected screen cannot be automated.")
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: return ActionResult(false, "error", "No text input box is currently focused.")
        if (focused.isPassword) {
            return ActionResult(false, "error", "Shimi never enters text into password fields.")
        }
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val ok = focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        return ActionResult(ok, if (ok) "executed" else "error", if (ok) "Entered text." else "Could not enter text.")
    }

    private fun findScrollableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) {
            val found = findScrollableNode(node.getChild(i))
            if (found != null) return found
        }
        return null
    }

    fun goBack(): ActionResult = performGlobal(AccessibilityService.GLOBAL_ACTION_BACK, "Go Back")
    fun goHome(): ActionResult = performGlobal(AccessibilityService.GLOBAL_ACTION_HOME, "Go Home")
    fun openRecents(): ActionResult = performGlobal(AccessibilityService.GLOBAL_ACTION_RECENTS, "Recent Apps")
}
