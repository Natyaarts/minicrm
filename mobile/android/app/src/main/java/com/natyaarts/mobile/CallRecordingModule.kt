package com.natyaarts.mobile

import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.content.ContentUris
import android.database.Cursor
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class CallRecordingModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        var reactContextRef: ReactApplicationContext? = null
    }

    init {
        reactContextRef = reactContext
    }

    private var recorder: MediaRecorder? = null
    private var fallbackFilePath: String? = null
    private var callStartTime: Long = 0
    private var targetPhoneNumber: String = ""

    override fun getName(): String {
        return "CallRecordingModule"
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun startRecording(phoneNumber: String?, promise: Promise) {
        try {
            targetPhoneNumber = phoneNumber ?: ""
            callStartTime = System.currentTimeMillis()

            if (recorder != null) {
                stopRecordingInternal(false)
            }

            // Start MediaRecorder as fallback
            val outputDir = reactApplicationContext.cacheDir
            val audioFile = File.createTempFile("fallback_recording_", ".m4a", outputDir)
            val filePath = audioFile.absolutePath
            fallbackFilePath = filePath

            val activeRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(reactApplicationContext)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }

            activeRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            activeRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            activeRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            activeRecorder.setAudioSamplingRate(44100)
            activeRecorder.setAudioEncodingBitRate(96000)
            activeRecorder.setOutputFile(filePath)
            activeRecorder.prepare()
            activeRecorder.start()

            recorder = activeRecorder

            sendEvent("onRecordingStarted", filePath)
            promise.resolve(filePath)
        } catch (e: Exception) {
            promise.reject("START_RECORDING_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        // Run on a separate thread to poll for the native recording (up to 10 seconds)
        Thread {
            try {
                var systemRecordingPath: String? = null
                
                // 1. Scan MediaStore for native call recording file (Retry up to 10 times, 1s apart)
                for (i in 1..10) {
                    Thread.sleep(1000)
                    systemRecordingPath = findRecentSystemRecording(targetPhoneNumber, callStartTime)
                    if (systemRecordingPath != null) {
                        break
                    }
                }
                
                // Stop fallback recorder (and delete the fallback file if we successfully found the native one)
                val fallbackPath = stopRecordingInternal(systemRecordingPath != null)

                if (systemRecordingPath != null) {
                    sendEvent("onRecordingStopped", systemRecordingPath)
                    promise.resolve(systemRecordingPath)
                } else if (fallbackPath != null) {
                    sendEvent("onRecordingStopped", fallbackPath)
                    promise.resolve(fallbackPath)
                } else {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                promise.reject("STOP_RECORDING_FAILED", e.message, e)
            }
        }.start()
    }

    private fun stopRecordingInternal(deleteFallback: Boolean): String? {
        val path = fallbackFilePath
        val activeRecorder = recorder
        if (activeRecorder != null) {
            try {
                activeRecorder.stop()
            } catch (stopEx: Exception) {
                stopEx.printStackTrace()
            } finally {
                activeRecorder.release()
            }
            recorder = null
            fallbackFilePath = null

            if (deleteFallback && path != null) {
                try {
                    File(path).delete()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        return path
    }

    private fun findRecentSystemRecording(phoneNumber: String, startTimeMs: Long): String? {
        val contentResolver = reactApplicationContext.contentResolver
        val uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.DATE_ADDED
        )
        
        // Search for audio files added from 30 seconds before call start to now
        val startTimeSeconds = startTimeMs / 1000 - 30
        val selection = "${MediaStore.Audio.Media.DATE_ADDED} >= ?"
        val selectionArgs = arrayOf(startTimeSeconds.toString())
        val sortOrder = "${MediaStore.Audio.Media.DATE_ADDED} DESC"
        
        var cursor: Cursor? = null
        try {
            cursor = contentResolver.query(uri, projection, selection, selectionArgs, sortOrder)
            if (cursor != null) {
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val displayNameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                val dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)
                
                val cleanPhone = phoneNumber.replace(Regex("[^0-9]"), "")
                
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val filePath = cursor.getString(dataCol)
                    val displayName = cursor.getString(displayNameCol)
                    
                    val pathLower = filePath.lowercase()
                    val isCallFolder = pathLower.contains("call") || pathLower.contains("record")
                    
                    val cleanFileName = displayName.replace(Regex("[^0-9]"), "")
                    val phoneMatches = cleanPhone.isNotEmpty() && cleanFileName.isNotEmpty() && 
                                       (cleanFileName.contains(cleanPhone) || cleanPhone.contains(cleanFileName))
                    
                    if (isCallFolder || phoneMatches) {
                        return copyUriToCache(id, displayName)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            cursor?.close()
        }
        return null
    }

    private fun copyUriToCache(id: Long, fileName: String): String? {
        try {
            val contentUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
            val cacheDir = reactApplicationContext.cacheDir
            
            val safeFileName = fileName.replace(Regex("[\\\\/:*?\"<>|]"), "_")
            val destFile = File(cacheDir, "recorded_call_$safeFileName")
            
            reactApplicationContext.contentResolver.openInputStream(contentUri)?.use { input ->
                destFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            return destFile.absolutePath
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}
