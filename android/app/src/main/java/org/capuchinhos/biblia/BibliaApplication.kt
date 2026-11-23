package org.capuchinhos.biblia

import android.app.Application
import org.capuchinhos.biblia.crash.CrashReporting

class BibliaApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashReporting.start(this)
    }
}
