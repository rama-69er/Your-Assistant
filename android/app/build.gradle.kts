plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

fun sanitizeBuildString(raw: String, fallback: String): String {
    val cleaned = raw.trim().replace("\"", "").replace("\\", "").replace("\n", " ")
    return if (cleaned.isNotBlank()) cleaned else fallback
}

android {
    namespace = "com.shimi.assistant"
    compileSdk = 35

    val defaultName = sanitizeBuildString(
        (project.findProperty("SHIMI_DEFAULT_NAME") as String?) ?: "Shimi",
        "Shimi"
    )
    val defaultWakeWord = sanitizeBuildString(
        (project.findProperty("SHIMI_DEFAULT_WAKE_WORD") as String?) ?: defaultName,
        defaultName
    )
    val defaultStyle = sanitizeBuildString(
        (project.findProperty("SHIMI_DEFAULT_STYLE") as String?) ?: "pod",
        "pod"
    )
    val defaultAccessory = sanitizeBuildString(
        (project.findProperty("SHIMI_DEFAULT_ACCESSORY") as String?) ?: "none",
        "none"
    )
    val defaultPersonality = sanitizeBuildString(
        (project.findProperty("SHIMI_DEFAULT_PERSONALITY") as String?) ?: "warm",
        "warm"
    )
    val defaultTheme = sanitizeBuildString(
        (project.findProperty("SHIMI_DEFAULT_THEME") as String?) ?: "ceramic-cobalt",
        "ceramic-cobalt"
    )
    val resolvedVersionName = sanitizeBuildString(
        (project.findProperty("SHIMI_VERSION_NAME") as String?) ?: "2.1.0",
        "2.1.0"
    )
    val resolvedVersionCode = ((project.findProperty("SHIMI_VERSION_CODE") as String?)?.toIntOrNull()
        ?: System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()?.plus(100)
        ?: 210)

    val pwaUrl = sanitizeBuildString(
        (project.findProperty("SHIMI_PWA_URL") as String?) ?: "http://10.0.2.2:3000",
        "http://10.0.2.2:3000"
    )
    val apiBaseUrl = sanitizeBuildString(
        (project.findProperty("SHIMI_API_BASE_URL") as String?) ?: pwaUrl,
        pwaUrl
    )

    val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
    val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
    val keyAlias = System.getenv("ANDROID_KEY_ALIAS")
    val keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
    val hasReleaseSigning = !keystorePath.isNullOrBlank() &&
        !keystorePassword.isNullOrBlank() &&
        !keyAlias.isNullOrBlank() &&
        !keyPassword.isNullOrBlank() &&
        file(keystorePath).exists()

    defaultConfig {
        applicationId = "com.shimi.assistant"
        minSdk = 26
        targetSdk = 35
        versionCode = resolvedVersionCode
        versionName = resolvedVersionName

        manifestPlaceholders["appLabel"] = defaultName

        buildConfigField("String", "SHIMI_PWA_URL", "\"$pwaUrl\"")
        buildConfigField("String", "SHIMI_API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "SHIMI_DEFAULT_NAME", "\"$defaultName\"")
        buildConfigField("String", "SHIMI_DEFAULT_WAKE_WORD", "\"$defaultWakeWord\"")
        buildConfigField("String", "SHIMI_DEFAULT_STYLE", "\"$defaultStyle\"")
        buildConfigField("String", "SHIMI_DEFAULT_ACCESSORY", "\"$defaultAccessory\"")
        buildConfigField("String", "SHIMI_DEFAULT_PERSONALITY", "\"$defaultPersonality\"")
        buildConfigField("String", "SHIMI_DEFAULT_THEME", "\"$defaultTheme\"")
        buildConfigField("boolean", "SHIMI_RELEASE_SIGNED", hasReleaseSigning.toString())
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword
                this.keyAlias = keyAlias
                this.keyPassword = keyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ""
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-service:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("com.google.android.material:material:1.12.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    testImplementation("junit:junit:4.13.2")
}
