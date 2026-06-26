package com.natyaarts.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class PhoneStateReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
            val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
            val phoneNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

            // Normalize state strings for JS ease-of-use
            val mappedState = when (state) {
                TelephonyManager.EXTRA_STATE_IDLE -> "IDLE"
                TelephonyManager.EXTRA_STATE_OFFHOOK -> "OFFHOOK"
                TelephonyManager.EXTRA_STATE_RINGING -> "RINGING"
                else -> state ?: "UNKNOWN"
            }

            // Retrieve ReactContext statically from CallRecordingModule
            val reactContext = CallRecordingModule.reactContextRef
            if (reactContext != null) {
                try {
                    if (reactContext.hasActiveReactInstance() || reactContext.hasActiveCatalystInstance()) {
                        val params = Arguments.createMap().apply {
                            putString("state", mappedState)
                            putString("phoneNumber", phoneNumber ?: "")
                        }
                        reactContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("onCallStateChanged", params)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }
}
