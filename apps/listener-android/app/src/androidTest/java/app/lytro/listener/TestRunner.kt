package app.lytro.listener

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner

const val TEST_SERVER_PORT = 18765

/** The real app, except that it talks to the test's own server on this phone. */
class TestListenerApplication : ListenerApplication() {
    override fun apiBaseUrl() = "http://localhost:$TEST_SERVER_PORT/v1/listener/"
}

class TestRunner : AndroidJUnitRunner() {
    override fun newApplication(loader: ClassLoader, name: String, context: Context): Application =
        super.newApplication(loader, TestListenerApplication::class.java.name, context)
}
