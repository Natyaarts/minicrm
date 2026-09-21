package com.natyaarts.mobile

import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.CallLog
import android.content.ContentUris
import android.database.Cursor
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class CallRecordingModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        var reactContextRef: ReactApplicationContext? = null
    }

    private var recorder: MediaRecorder? = null
    private var fallbackFilePath: String? = null
    private var callStartTime: Long = 0
    private var targetPhoneNumber: String = ""
    
    private var selectFolderPromise: Promise? = null
    private val FOLDER_PICKER_REQUEST_CODE = 1001

    init {
        reactContextRef = reactContext
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String {
        return "CallRecordingModule"
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
    
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FOLDER_PICKER_REQUEST_CODE) {
            val promise = selectFolderPromise
            if (promise != null) {
                if (resultCode == Activity.RESULT_OK && data != null && data.data != null) {
                    val uri = data.data!!
                    try {
                        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        reactApplicationContext.contentResolver.takePersistableUriPermission(uri, flags)
                        
                        val prefs = reactApplicationContext.getSharedPreferences("CallRecordings", Context.MODE_PRIVATE)
                        prefs.edit().putString("custom_folder_uri", uri.toString()).apply()
                        
                        promise.resolve(uri.toString())
                    } catch (e: Exception) {
                        promise.reject("PERMISSION_ERROR", "Failed to take persistable permission: ${e.message}")
                    }
                } else {
                    promise.reject("CANCELLED", "Folder selection cancelled")
                }
                selectFolderPromise = null
            }
        }
    }

    override fun onNewIntent(intent: Intent) {}

    @ReactMethod
    fun selectRecordingFolder(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_ACTIVITY_DOES_NOT_EXIST", "Activity doesn't exist")
            return
        }
        
        try {
            selectFolderPromise = promise
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            activity.startActivityForResult(intent, FOLDER_PICKER_REQUEST_CODE)
        } catch (e: Exception) {
            selectFolderPromise = null
            promise.reject("E_FAILED_TO_SHOW_PICKER", e.message)
        }
    }

    @ReactMethod
    fun makeDirectCall(phoneNumber: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_ACTIVITY_DOES_NOT_EXIST", "Activity doesn't exist")
            return
        }
        try {
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + phoneNumber))
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", "CALL_PHONE permission is missing", e)
        } catch (e: Exception) {
            promise.reject("CALL_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun startRecording(phoneNumber: String?, promise: Promise) {
        try {
            targetPhoneNumber = phoneNumber ?: ""
            callStartTime = System.currentTimeMillis()

            if (recorder != null) {
                stopRecordingInternal(false)
            }

            // Start MediaRecorder as fallback with sanitized phone number in prefix to maintain recording identity
            val cleanPhone = (phoneNumber ?: "").replace(Regex("[^0-9]"), "").takeLast(10)
            val prefix = if (cleanPhone.isNotEmpty()) "fallback_recording_${cleanPhone}_" else "fallback_recording_"
            val outputDir = reactApplicationContext.cacheDir
            val audioFile = File.createTempFile(prefix, ".m4a", outputDir)
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
                
        // 1. Scan MediaStore and SAF for native call recording file
        //    Bug 3 Fix: Retry up to 30 times (30s) — long calls produce large files
        //    that may take >10s to flush to MediaStore on some devices.
        for (i in 1..30) {
            Thread.sleep(1000)
            // Limit heavy SAF directory listing queries to once every 5 seconds (indices: 1, 6, 11, 16, 21, 26)
            val scanSaf = (i == 1 || i % 5 == 1)
            systemRecordingPath = findRecentSystemRecording(targetPhoneNumber, callStartTime, scanSaf)
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
    
    private fun copySafFileToCache(uri: Uri, fileName: String, cleanPhone: String = ""): String? {
        try {
            val cacheDir = reactApplicationContext.cacheDir
            val safeFileName = fileName.replace(Regex("[^a-zA-Z0-9.-]"), "_")
            val cleanDigits = safeFileName.replace(Regex("[^0-9]"), "")
            val prefix = if (cleanPhone.isNotEmpty() && !cleanDigits.contains(cleanPhone)) "saf_recorded_${cleanPhone}_" else "saf_recorded_"
            val destFile = File(cacheDir, "$prefix$safeFileName")
            
            reactApplicationContext.contentResolver.openInputStream(uri)?.use { input ->
                destFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            if (destFile.exists() && destFile.length() > 0) {
                return destFile.absolutePath
            } else {
                if (destFile.exists()) destFile.delete()
                return null
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    private fun isVerifiedCallRecording(
        fileName: String,
        filePath: String,
        targetPhone: String,
        startTimeMs: Long,
        fileLastModified: Long
    ): Boolean {
        if (!isAudioRecordingFile(fileName)) return false
        if (!isCallRecordingKeyword(fileName, filePath)) return false

        val cleanTarget = targetPhone.replace(Regex("[^0-9]"), "").takeLast(10)
        val cleanDigitsInFile = fileName.replace(Regex("[^0-9]"), "")

        // 1. Check if filename contains a DIFFERENT 10-digit phone number
        val otherPhoneRegex = Regex("""(?:\+?91|0)?([6-9]\d{9})""")
        val foundMatch = otherPhoneRegex.find(fileName)
        if (foundMatch != null) {
            val foundOtherPhone = foundMatch.groupValues.getOrNull(1) ?: foundMatch.value.replace(Regex("[^0-9]"), "").takeLast(10)
            if (cleanTarget.length >= 6 && foundOtherPhone.isNotEmpty() && foundOtherPhone != cleanTarget) {
                return false
            }
        }

        val phoneMatches = cleanTarget.length >= 6 && (cleanDigitsInFile.contains(cleanTarget) || fileName.contains(cleanTarget))

        if (phoneMatches) {
            // Strict timestamp window around call session
            val windowStart = if (startTimeMs > 0) (startTimeMs - 30_000L) else (System.currentTimeMillis() - 120_000L)
            val windowEnd = System.currentTimeMillis() + 30_000L
            return fileLastModified in windowStart..windowEnd
        }

        // 2. If phone is not in the filename at all (e.g. timestamp-only like Rec_2026-09-19_15-06-18.m4a),
        // strictly require that the file was created during this active call window
        if (startTimeMs > 0) {
            val tightStart = startTimeMs - 5_000L
            val tightEnd = System.currentTimeMillis() + 15_000L
            return fileLastModified in tightStart..tightEnd
        }

        return false
    }

    private fun findRecentSystemRecording(phoneNumber: String, startTimeMs: Long, scanSaf: Boolean): String? {
        val contentResolver = reactApplicationContext.contentResolver
        val cleanPhone = phoneNumber.replace(Regex("[^0-9]"), "").takeLast(10)
        
        // 1. Check custom SAF folder first (user-selected via folder picker)
        val prefs = reactApplicationContext.getSharedPreferences("CallRecordings", Context.MODE_PRIVATE)
        val customUriString = prefs.getString("custom_folder_uri", null)
        
        if (customUriString != null) {
            try {
                val treeUri = Uri.parse(customUriString)
                
                // Attempt to resolve physical file path to bypass slow SAF DocumentFile API completely
                val physicalPath = getPhysicalPathFromSafUri(treeUri)
                if (physicalPath != null) {
                    val dir = File(physicalPath)
                    if (dir.exists() && dir.isDirectory) {
                        var mostRecentFile: File? = null
                        var maxLastModified = if (startTimeMs > 0) (startTimeMs - 30_000L) else 0L
                        for (file in (dir.listFiles() ?: emptyArray())) {
                            if (file.isFile && file.lastModified() >= maxLastModified) {
                                val name = file.name ?: ""
                                if (isVerifiedCallRecording(name, file.absolutePath, phoneNumber, startTimeMs, file.lastModified())) {
                                    if (file.lastModified() > (mostRecentFile?.lastModified() ?: 0)) {
                                        mostRecentFile = file
                                        maxLastModified = file.lastModified()
                                    }
                                }
                            }
                        }
                        if (mostRecentFile != null) {
                            return mostRecentFile.absolutePath
                        }
                    }
                }

                // If physical resolution is not possible and scanSaf is true, use slow SAF listFiles fallback
                if (scanSaf) {
                    val documentFile = DocumentFile.fromTreeUri(reactApplicationContext, treeUri)
                    if (documentFile != null && documentFile.isDirectory) {
                        var mostRecentFile: DocumentFile? = null
                        var maxLastModified = if (startTimeMs > 0) (startTimeMs - 30_000L) else 0L
                        
                        for (file in documentFile.listFiles()) {
                            if (file.isFile && file.lastModified() >= maxLastModified) {
                                val name = file.name ?: ""
                                if (isVerifiedCallRecording(name, name, phoneNumber, startTimeMs, file.lastModified())) {
                                    if (file.lastModified() > (mostRecentFile?.lastModified() ?: 0)) {
                                        mostRecentFile = file
                                        maxLastModified = file.lastModified()
                                    }
                                }
                            }
                        }
                        
                        if (mostRecentFile != null) {
                            return copySafFileToCache(mostRecentFile.uri, mostRecentFile.name ?: "recording.m4a", cleanPhone)
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // 2. Scan known brand-specific directories on the filesystem (Strict OEM call recording locations only)
        val knownPaths = listOf(
            // Samsung
            "/storage/emulated/0/Call",
            "/storage/emulated/0/DCIM/Call",
            "/storage/emulated/0/Recordings/Call",
            "/storage/emulated/0/Sounds/CallRecord",
            // Xiaomi / MIUI
            "/storage/emulated/0/MIUI/sound_recorder/call_rec",
            "/storage/emulated/0/MIUI/sound_recorder",
            "/storage/emulated/0/recordings",
            "/storage/emulated/0/Recordings",
            // Oppo / ColorOS / Realme
            "/storage/emulated/0/ColorOS/Recorder",
            "/storage/emulated/0/Recorder",
            "/storage/emulated/0/record",
            "/storage/emulated/0/Record",
            // Vivo / FunTouch OS
            "/storage/emulated/0/Sounds",
            "/storage/emulated/0/BBKRecorder",
            "/storage/emulated/0/vivoRecords",
            // OnePlus / OxygenOS
            "/storage/emulated/0/Recordings",
            "/storage/emulated/0/CallRecordings",
            // Motorola / Stock Android
            "/storage/emulated/0/Android/data/com.google.android.dialer/files/Recordings",
            "/storage/emulated/0/PhoneRecord",
            // Huawei
            "/storage/emulated/0/Sounds/CallRecord",
            // Itel / Tecno / Infinix (common in India)
            "/storage/emulated/0/TelephoneRecord",
            "/storage/emulated/0/callrecordings"
        )

        val windowStart = if (startTimeMs > 0) (startTimeMs - 30_000L) else 0L
        var bestFile: File? = null
        var bestModified = windowStart

        for (dirPath in knownPaths) {
            val dir = File(dirPath)
            if (!dir.exists() || !dir.isDirectory) continue
            for (file in (dir.listFiles() ?: emptyArray())) {
                if (!file.isFile) continue
                if (file.lastModified() < windowStart) continue

                val name = file.name ?: ""
                if (isVerifiedCallRecording(name, file.absolutePath, phoneNumber, startTimeMs, file.lastModified())) {
                    if (file.lastModified() > bestModified) {
                        bestFile = file
                        bestModified = file.lastModified()
                    }
                }
            }
        }

        if (bestFile != null) {
            return bestFile.absolutePath
        }

        // 3. Fallback: MediaStore scan (catches files not in known paths)
        val mediaUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.DATE_MODIFIED
        )
        val startTimeSeconds = if (startTimeMs > 0) (startTimeMs / 1000 - 30) else (System.currentTimeMillis() / 1000 - 120)
        val selection = "${MediaStore.Audio.Media.DATE_ADDED} >= ? OR ${MediaStore.Audio.Media.DATE_MODIFIED} >= ?"
        val selectionArgs = arrayOf(startTimeSeconds.toString(), startTimeSeconds.toString())
        val sortOrder = "${MediaStore.Audio.Media.DATE_MODIFIED} DESC, ${MediaStore.Audio.Media.DATE_ADDED} DESC"
        
        var cursor: Cursor? = null
        try {
            cursor = contentResolver.query(mediaUri, projection, selection, selectionArgs, sortOrder)
            if (cursor != null) {
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val displayNameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                val dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)
                val dateAddedCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
                val dateModCol = cursor.getColumnIndex(MediaStore.Audio.Media.DATE_MODIFIED)
                
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val filePath = cursor.getString(dataCol) ?: ""
                    val displayName = cursor.getString(displayNameCol) ?: ""
                    val dateAddedSec = cursor.getLong(dateAddedCol)
                    val dateModSec = if (dateModCol != -1) cursor.getLong(dateModCol) else 0L
                    val fileLastModified = maxOf(dateAddedSec, dateModSec) * 1000L
                    
                    if (isVerifiedCallRecording(displayName, filePath, phoneNumber, startTimeMs, fileLastModified)) {
                        return copyUriToCache(id, displayName, cleanPhone)
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

    /** Returns true if the filename looks like a call recording audio file */
    private fun isAudioRecordingFile(name: String): Boolean {
        val lower = name.lowercase()
        val hasAudioExt = lower.endsWith(".m4a") || lower.endsWith(".mp3") ||
            lower.endsWith(".amr") || lower.endsWith(".wav") ||
            lower.endsWith(".aac") || lower.endsWith(".3gp") ||
            lower.endsWith(".ogg") || lower.endsWith(".mp4")
        if (!hasAudioExt) return false
        // Accept any audio file — path context handled by isCallRecordingKeyword
        return true
    }

    /** Returns true if name/path suggests it is a call recording */
    private fun isCallRecordingKeyword(name: String, path: String): Boolean {
        val combined = (name + " " + path).lowercase()
        return combined.contains("call") || combined.contains("record") ||
            combined.contains("rec_") || combined.contains("callrec") ||
            combined.contains("voice") || combined.contains("phone") ||
            combined.contains("dialer") || combined.contains("incoming") ||
            combined.contains("outgoing") || combined.contains("bbkrecorder") ||
            combined.contains("teleph") || combined.contains("sound_recorder")
    }


    private fun copyUriToCache(id: Long, fileName: String, cleanPhone: String = ""): String? {
        try {
            val contentUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
            val cacheDir = reactApplicationContext.cacheDir
            
            val safeFileName = fileName.replace(Regex("[^a-zA-Z0-9.-]"), "_")
            val cleanDigits = safeFileName.replace(Regex("[^0-9]"), "")
            val prefix = if (cleanPhone.isNotEmpty() && !cleanDigits.contains(cleanPhone)) "recorded_call_${cleanPhone}_" else "recorded_call_"
            val destFile = File(cacheDir, "$prefix$safeFileName")
            
            reactApplicationContext.contentResolver.openInputStream(contentUri)?.use { input ->
                destFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            if (destFile.exists() && destFile.length() > 0) {
                return destFile.absolutePath
            } else {
                if (destFile.exists()) destFile.delete()
                return null
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    private fun getPhysicalPathFromSafUri(uri: Uri): String? {
        if ("com.android.externalstorage.documents" == uri.authority) {
            val paths = uri.pathSegments
            val docId = if (paths.size >= 2 && paths[0] == "tree") {
                Uri.decode(paths[1])
            } else {
                null
            } ?: return null

            val split = docId.split(":")
            if (split.size >= 2) {
                val type = split[0]
                val relativePath = split[1]
                if ("primary".equals(type, ignoreCase = true)) {
                    return "/storage/emulated/0/$relativePath"
                } else {
                    return "/storage/$type/$relativePath"
                }
            }
        }
        return null
    }

    @ReactMethod
    fun getLatestCallLogDuration(phoneNumber: String?, callStartTimeMs: Double, callDirection: String?, promise: Promise) {
        Thread {
            try {
                if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
                    promise.resolve(null)
                    return@Thread
                }

                val cleanTarget = (phoneNumber ?: "").replace(Regex("[^0-9]"), "").takeLast(10)
                val startTime = callStartTimeMs.toLong()
                // Look back up to 60s before start time or 10 min if start time is 0
                val windowStart = if (startTime > 0) (startTime - 60_000) else (System.currentTimeMillis() - 600_000)

                val projection = arrayOf(
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.DATE,
                    CallLog.Calls.DURATION,
                    CallLog.Calls.TYPE
                )

                val selection = "${CallLog.Calls.DATE} >= ?"
                val selectionArgs = arrayOf(windowStart.toString())
                val sortOrder = "${CallLog.Calls.DATE} DESC"

                var matchedDuration: Long? = null

                // Retry up to 4 times (0ms, 300ms, 600ms, 900ms) to allow OS telephony stack to commit the entry
                for (attempt in 0..3) {
                    if (attempt > 0) {
                        Thread.sleep(300)
                    }

                    val cursor = reactApplicationContext.contentResolver.query(
                        CallLog.Calls.CONTENT_URI,
                        projection,
                        selection,
                        selectionArgs,
                        sortOrder
                    )

                    cursor?.use { c ->
                        val numIdx = c.getColumnIndex(CallLog.Calls.NUMBER)
                        val dateIdx = c.getColumnIndex(CallLog.Calls.DATE)
                        val durIdx = c.getColumnIndex(CallLog.Calls.DURATION)
                        val typeIdx = c.getColumnIndex(CallLog.Calls.TYPE)

                        while (c.moveToNext()) {
                            val num = if (numIdx != -1) c.getString(numIdx) ?: "" else ""
                            val dur = if (durIdx != -1) c.getLong(durIdx) else 0L
                            val type = if (typeIdx != -1) c.getInt(typeIdx) else 0

                            val rowClean = num.replace(Regex("[^0-9]"), "").takeLast(10)

                            val directionMatches = when (callDirection?.uppercase()) {
                                "INCOMING" -> type == CallLog.Calls.INCOMING_TYPE || 
                                              type == CallLog.Calls.MISSED_TYPE || 
                                              (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && type == CallLog.Calls.REJECTED_TYPE)
                                "OUTGOING" -> type == CallLog.Calls.OUTGOING_TYPE
                                else -> true
                            }

                            val numberMatches = cleanTarget.isEmpty() || rowClean.isEmpty() ||
                                    rowClean == cleanTarget ||
                                    rowClean.endsWith(cleanTarget) ||
                                    cleanTarget.endsWith(rowClean)

                            if (directionMatches && numberMatches) {
                                matchedDuration = dur
                                break
                            }
                        }
                    }

                    if (matchedDuration != null) {
                        break
                    }
                }

                if (matchedDuration != null) {
                    promise.resolve(matchedDuration.toDouble())
                } else {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                e.printStackTrace()
                promise.resolve(null)
            }
        }.start()
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
