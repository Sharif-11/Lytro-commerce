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
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", "\"https://api.lytro.app/v1/listener/\"")
            buildConfigField("String", "API_HOST_HEADER", "\"\"")
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
