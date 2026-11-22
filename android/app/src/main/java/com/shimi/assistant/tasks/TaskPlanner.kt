package com.shimi.assistant.tasks

import java.util.Locale
import java.util.UUID

/**
 * Compiles multi-step natural language Android workflows into generic TaskPlans
 * (OPEN_APP -> WAIT_FOR_APP -> FIND_UI -> CLICK -> TYPE -> CONFIRM -> CLICK -> VERIFY)
 * rather than hard-coding single-button UI hacks.
 */
object TaskPlanner {

    fun planIfMultiStep(
        cleanedUtterance: String,
        confirmConsequential: Boolean
    ): TaskPlan? {
        val lower = cleanedUtterance.lowercase(Locale.getDefault())

        // Pattern 1: Open WhatsApp / Messages and send message to <Contact> saying <Message>
        val isWhatsApp = lower.contains("whatsapp")
        val isMessaging = isWhatsApp || Regex("\\b(message|text|send)\\b").containsMatchIn(lower)
        val hasContactAndBody = Regex("\\b(?:to|go to|message|text)\\s+([a-zA-Z0-9 .'-]{2,32})", RegexOption.IGNORE_CASE)
            .containsMatchIn(cleanedUtterance)

        if (isMessaging && hasContactAndBody && !Regex("^(?:open|launch|start)\\s+whatsapp[.!?]*$").matches(lower)) {
            val contact = extractContact(cleanedUtterance)
            val body = extractMessageBody(cleanedUtterance)
            if (!contact.isNullOrBlank()) {
                val appName = if (isWhatsApp) "WhatsApp" else "Messages"
                val pkgHint = if (isWhatsApp) "com.whatsapp" else null
                val steps = mutableListOf<TaskStep>()
                var idx = 1
                steps += TaskStep(idx++, TaskStepType.OPEN_APP, "Open $appName", target = appName)
                steps += TaskStep(idx++, TaskStepType.WAIT_FOR_APP, "Wait for $appName window", target = pkgHint ?: appName)
                steps += TaskStep(idx++, TaskStepType.FIND_UI, "Find $contact", target = contact)
                steps += TaskStep(idx++, TaskStepType.CLICK, "Open $contact conversation", target = contact)
                if (!body.isNullOrBlank()) {
                    steps += TaskStep(idx++, TaskStepType.FIND_UI, "Locate message input field", target = "Message")
                    steps += TaskStep(idx++, TaskStepType.TYPE, "Type message draft", target = "Message", value = body)
                    if (confirmConsequential) {
                        steps += TaskStep(
                            idx++,
                            TaskStepType.CONFIRM,
                            "Confirm before sending",
                            value = "Send \"$body\" to $contact on $appName?"
                        )
                    }
                    steps += TaskStep(idx++, TaskStepType.CLICK, "Tap Send button", target = "Send")
                }
                steps += TaskStep(idx, TaskStepType.VERIFY, "Verify task completion")

                return TaskPlan(
                    id = "task_${UUID.randomUUID()}",
                    title = if (!body.isNullOrBlank()) "Message $contact on $appName" else "Open $contact on $appName",
                    originalUtterance = cleanedUtterance,
                    targetPackageHint = pkgHint,
                    requiresConfirmation = confirmConsequential && !body.isNullOrBlank(),
                    confirmationPrompt = if (!body.isNullOrBlank()) "Send \"$body\" to $contact on $appName?" else null,
                    steps = steps
                )
            }
        }

        // Pattern 2: Open <App> and search/find/tap <Target>
        val chainedMatch = Regex(
            "^(?:open|launch)\\s+([a-zA-Z0-9 .+'-]{2,28})\\s+and\\s+(?:click|tap|press|search(?:\\s+for)?)\\s+(.+)$",
            RegexOption.IGNORE_CASE
        ).find(cleanedUtterance)
        if (chainedMatch != null) {
            val appName = chainedMatch.groupValues[1].trim()
            val target = chainedMatch.groupValues[2].trim().trimEnd('.', '!', '?')
            val isSearch = lower.contains("search")
            val steps = mutableListOf<TaskStep>()
            var idx = 1
            steps += TaskStep(idx++, TaskStepType.OPEN_APP, "Open $appName", target = appName)
            steps += TaskStep(idx++, TaskStepType.WAIT_FOR_APP, "Wait for $appName to appear", target = appName)
            if (isSearch) {
                steps += TaskStep(idx++, TaskStepType.FIND_UI, "Locate Search control", target = "Search")
                steps += TaskStep(idx++, TaskStepType.CLICK, "Tap Search", target = "Search")
                steps += TaskStep(idx++, TaskStepType.TYPE, "Enter search query", target = "Search", value = target)
            } else {
                steps += TaskStep(idx++, TaskStepType.FIND_UI, "Find \"$target\"", target = target)
                steps += TaskStep(idx++, TaskStepType.CLICK, "Tap \"$target\"", target = target)
            }
            steps += TaskStep(idx, TaskStepType.VERIFY, "Verify $appName action")

            return TaskPlan(
                id = "task_${UUID.randomUUID()}",
                title = "$appName -> $target",
                originalUtterance = cleanedUtterance,
                steps = steps
            )
        }

        return null
    }

    private fun extractContact(text: String): String? {
        val goTo = Regex("(?:go to|message|text|to)\\s+([a-zA-Z][a-zA-Z0-9 .'-]{1,28}?)(?=\\s+(?:and|saying|that|send|him|her|with|:|')|$)", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.trim()
        if (!goTo.isNullOrBlank() && !goTo.equals("a message", true)) {
            return goTo
        }
        return null
    }

    private fun extractMessageBody(text: String): String? {
        val quoted = Regex("['\"]([^'\"]{2,200})['\"]").find(text)?.groupValues?.get(1)?.trim()
        if (!quoted.isNullOrBlank()) return quoted
        return Regex("(?:saying|that|send(?:\\s+him|\\s+her)?|:)\\s+(.+)$", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.trim()?.trim('\'', '"')
    }
}
