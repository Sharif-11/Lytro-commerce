# Lytro Listener

The Android app a shop runs on the phone that holds its bKash SIM. It forwards payment receipt SMS to Lytro, so an order's
advance verifies by itself. Kotlin and Jetpack Compose, Android 7 and later, no Google Play services.

The design is `docs/LISTENER-APP-DESIGN.md`, every screen is drawn in `docs/brand/lytro-listener.html`, and the plan is
`docs/PHASE-5-PLAN.md`, Slice 5.5. The routes it calls are in `docs/API-CONTRACT.md`, section 15.

This folder is no pnpm or Turbo package: it builds with its own Gradle wrapper, and CI has its own job for it
(`.github/workflows/listener-android.yml`).

## Building

You need a JDK (Android Studio's own will do) and the Android SDK. `local.properties` is yours and is not committed:

```
sdk.dir=D\:\\Android\\Sdk
```

```
./gradlew :app:assembleDebug        # a debug APK, signed with a throwaway key
./gradlew :app:testDebugUnitTest    # the logic's tests, no phone needed
./gradlew :app:lintDebug            # catches calls newer than Android 7
```

On a machine short of room on C:, set `GRADLE_USER_HOME` to another drive first.

## Against a local server

A debug build can point at a server on this computer, which the emulator reaches as `10.0.2.2`. A release build cannot: it
only ever talks to `https://api.lytro.app`.

```
./gradlew :app:assembleDebug -Plistener.apiBase=http://10.0.2.2:3000/v1/listener/ -Plistener.apiHost=api.localhost
```

Pairing codes come from `POST /api/v1/listener/pairing-codes`, signed in as the shop's owner.

Shops get a build shrunk by R8, which can break what a debug build does not. Add `-Plistener.shrinkDebug=true` to try that
against the local server too.

## Testing with real SMS

`src/androidTest` runs on an emulator and delivers real SMS through its radio, by its console. The console needs the token in
`~/.emulator_console_auth_token`, which the emulator writes when it starts:

```
./gradlew :app:connectedDebugAndroidTest \
  "-Pandroid.testInstrumentationRunnerArguments.consoleToken=$(cat ~/.emulator_console_auth_token)"
```

By hand, `adb emu sms send bKash "You have received Tk 10.00 from 01811000002. Balance Tk 10.00. TrxID 6FV2K8LQ4T"` does the
same. To meet what a shop meets on Android 15 and later, where SMS is blocked for an app installed from a browser, install it
as a download would be:

```
adb push app/build/outputs/apk/debug/app-debug.apk /data/local/tmp/app.apk
adb shell pm install-create --package-source 4                  # prints the session's number
adb shell pm install-write -S <size in bytes> <session> base /data/local/tmp/app.apk
adb shell pm install-commit <session>
```

An emulator takes a lot of memory, and on Windows that can grow the page file on C:, so stop it when you are done
(`adb emu kill`).

## What must never change without a look

- **What leaves the phone.** `sms/MessageFilter.kt` is the only door: a sender on the server's list and a message that looks
  like a transaction, the same test as the server's. bKash sends its sign-in codes from the same sender as its receipts.
- **The server's rules this app copies.** Kotlin cannot import them, so `ContractTest` reads the server's source and fails if
  a limit or that test changes.
- **No SMS text in any log.**
