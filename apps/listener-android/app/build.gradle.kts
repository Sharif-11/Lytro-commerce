import java.security.MessageDigest
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// A debug build may point at a local server, as in README.md; a release always talks to Lytro's API host.
val debugApiBase = providers.gradleProperty("listener.apiBase").getOrElse("https://api.lytro.app/v1/listener/")
val debugApiHost = providers.gradleProperty("listener.apiHost").getOrElse("")

// Shrinks a debug build as a release is, so what R8 might break can be tried against a local server.
val debugShrunk = providers.gradleProperty("listener.shrinkDebug").isPresent

// Agreed 2026-11-03: the release key and its passwords stay on the owner's computer, in the file LYTRO_LISTENER_KEY names, made by
// scripts/new-release-key.sh. Without it a release builds unsigned, as CI's does, and :app:listenerRelease refuses.
val releaseKey: Properties? = providers.environmentVariable("LYTRO_LISTENER_KEY").orNull
    ?.let { File(it) }
    ?.takeIf { it.exists() }
    ?.let { file -> Properties().apply { file.inputStream().use { load(it) } } }

// Where the app sends a shop for an update and the first install (LISTENER-APP-DESIGN 6); the page itself is Slice 5.8's.
val downloadUrl = "https://lytro.app/listener"

android {
    namespace = "app.lytro.listener"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.lytro.listener"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "app.lytro.listener.TestRunner"
        buildConfigField("String", "DOWNLOAD_URL", "\"$downloadUrl\"")
    }

    signingConfigs {
        if (releaseKey != null) {
            create("release") {
                storeFile = File(releaseKey.getProperty("storeFile"))
                storePassword = releaseKey.getProperty("storePassword")
                keyAlias = releaseKey.getProperty("keyAlias")
                keyPassword = releaseKey.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // R8 holds back on anything debuggable, so a true trial of a release build is not.
            isDebuggable = !debugShrunk
            isMinifyEnabled = debugShrunk
            isShrinkResources = debugShrunk
            if (debugShrunk) proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBase\"")
            buildConfigField("String", "API_HOST_HEADER", "\"$debugApiHost\"")
            buildConfigField("String", "SUPPORT_WHATSAPP", "\"${providers.gradleProperty("listener.supportWhatsapp").getOrElse("")}\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", "\"https://api.lytro.app/v1/listener/\"")
            buildConfigField("String", "API_HOST_HEADER", "\"\"")
            buildConfigField("String", "SUPPORT_WHATSAPP", "\"${releaseKey?.getProperty("supportWhatsapp").orEmpty().filter { it.isDigit() }}\"")
            if (releaseKey != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "DebugProbesKt.bin")
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.foundation)
    implementation(libs.compose.ui)
    implementation(libs.core)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.work.runtime)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.okhttp)
    implementation(libs.serialization.json)
    implementation(libs.coroutines.android)
    implementation(libs.zxing.core)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.coroutines.test)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test)
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.okhttp.mockwebserver)
    debugImplementation(libs.compose.ui.test.manifest)
}

val checkReleaseKey = tasks.register("checkReleaseKey") {
    doLast {
        check(releaseKey != null) {
            "No release key. Set LYTRO_LISTENER_KEY to its properties file, or make one with scripts/new-release-key.sh."
        }
        if (releaseKey?.getProperty("supportWhatsapp").isNullOrBlank()) {
            logger.warn("No supportWhatsapp in the key's properties: the app's Help and Contact support will hide.")
        }
    }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach { mustRunAfter(checkReleaseKey) }

// The one command per release (agreed 2026-11-03): a signed APK, named for its version, and its checksum for the download page.
tasks.register("listenerRelease") {
    group = "release"
    description = "Builds the signed APK for a release, with the key on this computer."
    dependsOn(checkReleaseKey, "assembleRelease")
    doLast {
        val version = android.defaultConfig.versionName
        val out = layout.buildDirectory.dir("release").get().asFile.apply { mkdirs() }
        val apk = out.resolve("lytro-listener-$version.apk")
        layout.buildDirectory.file("outputs/apk/release/app-release.apk").get().asFile.copyTo(apk, overwrite = true)
        val sha256 = MessageDigest.getInstance("SHA-256").digest(apk.readBytes()).joinToString("") { "%02x".format(it) }
        out.resolve("${apk.name}.sha256").writeText("$sha256  ${apk.name}\n")
        // What lytro.app/listener reads to offer this file (SITE-PAGES-DESIGN 6). Upload the APK first, then this.
        out.resolve("latest.json").writeText(
            """{"version":"$version","file":"${apk.name}","sha256":"$sha256","bytes":${apk.length()}}""" + "\n",
        )
        println("Release $version: $apk")
        println("SHA-256: $sha256")
        println("Upload to the downloads bucket: ${apk.name}, then latest.json")
    }
}
