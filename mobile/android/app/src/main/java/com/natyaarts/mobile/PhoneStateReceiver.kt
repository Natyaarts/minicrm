package com.natyaarts.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class PhoneStateReceiver : BroadcastReceiver() {

    companion object {
        private var lastState = TelephonyManager.EXTRA_STATE_IDLE
        private var ringingNumber: String? = null
        private var isOffhook = false
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
            val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
            val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
            if (!incomingNumber.isNullOrEmpty()) {
                ringingNumber = incomingNumber
            }

            // Detect Missed Call: transition from RINGING -> IDLE without OFFHOOK
            var isMissedCall = false
            when (state) {
                TelephonyManager.EXTRA_STATE_RINGING -> {
                    lastState = TelephonyManager.EXTRA_STATE_RINGING
                    isOffhook = false
                }
                TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                    isOffhook = true
                    lastState = TelephonyManager.EXTRA_STATE_OFFHOOK
                }
                TelephonyManager.EXTRA_STATE_IDLE -> {
                    if (lastState == TelephonyManager.EXTRA_STATE_RINGING && !isOffhook) {
                        isMissedCall = true
                    }
                    lastState = TelephonyManager.EXTRA_STATE_IDLE
                }
            }

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
                            putString("phoneNumber", ringingNumber ?: "")
                            putBoolean("isMissed", isMissedCall)
                        }
                        reactContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("onCallStateChanged", params)

                        if (isMissedCall) {
                            val missedParams = Arguments.createMap().apply {
                                putString("phoneNumber", ringingNumber ?: "")
                                putDouble("timestamp", System.currentTimeMillis().toDouble())
                            }
                            reactContext
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("onMissedCall", missedParams)
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }
}

