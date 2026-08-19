package com.natyaarts.mobile

import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.content.ContentUris
import android.database.Cursor
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
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
    
    private fun copySafFileToCache(uri: Uri, fileName: String): String? {
        try {
            val cacheDir = reactApplicationContext.cacheDir
            val safeFileName = fileName.replace(Regex("[^a-zA-Z0-9.-]"), "_")
            val destFile = File(cacheDir, "saf_recorded_$safeFileName")
            
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

    private fun findRecentSystemRecording(phoneNumber: String, startTimeMs: Long, scanSaf: Boolean): String? {
        val contentResolver = reactApplicationContext.contentResolver
        val cleanPhone = phoneNumber.replace(Regex("[^0-9]"), "")
        
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
                        var maxLastModified = startTimeMs - 900000 // 15 minutes window
                        for (file in (dir.listFiles() ?: emptyArray())) {
                            if (file.isFile && file.lastModified() >= maxLastModified) {
                                val name = file.name ?: ""
                                val cleanFileName = name.replace(Regex("[^0-9]"), "")
                                val phoneMatches = cleanPhone.isNotEmpty() && cleanFileName.isNotEmpty() && 
                                                   (cleanFileName.contains(cleanPhone) || cleanPhone.contains(cleanFileName.takeLast(10)))
                                val isAudio = isAudioRecordingFile(name)
                                if (phoneMatches || isAudio) {
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
                        var maxLastModified = startTimeMs - 900000 // 15 minutes window
                        
                        for (file in documentFile.listFiles()) {
                            if (file.isFile && file.lastModified() >= maxLastModified) {
                                val name = file.name ?: ""
                                val cleanFileName = name.replace(Regex("[^0-9]"), "")
                                
                                val phoneMatches = cleanPhone.isNotEmpty() && cleanFileName.isNotEmpty() && 
                                                   (cleanFileName.contains(cleanPhone) || cleanPhone.contains(cleanFileName))
                                                   
                                val isAudio = isAudioRecordingFile(name)
                                               
                                if (phoneMatches || isAudio) {
                                    if (file.lastModified() > (mostRecentFile?.lastModified() ?: 0)) {
                                        mostRecentFile = file
                                        maxLastModified = file.lastModified()
                                    }
                                }
                            }
                        }
                        
                        if (mostRecentFile != null) {
                            return copySafFileToCache(mostRecentFile.uri, mostRecentFile.name ?: "recording.m4a")
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // 2. Scan known brand-specific directories on the filesystem
        //    Different brands save recordings to completely different paths.
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
            "/storage/emulated/0/callrecordings",
            // Generic fallbacks
            "/storage/emulated/0/Music",
            "/storage/emulated/0/Download",
        )

        val windowStart = startTimeMs - 900000L // 15 minutes window
        var bestFile: File? = null
        var bestModified = windowStart

        for (dirPath in knownPaths) {
            val dir = File(dirPath)
            if (!dir.exists() || !dir.isDirectory) continue
            for (file in (dir.listFiles() ?: emptyArray())) {
                if (!file.isFile) continue
                if (file.lastModified() < windowStart) continue
                if (!isAudioRecordingFile(file.name)) continue

                val cleanFileName = file.name.replace(Regex("[^0-9]"), "")
                val phoneMatches = cleanPhone.isNotEmpty() && cleanFileName.isNotEmpty() &&
                    (cleanFileName.contains(cleanPhone) || cleanPhone.contains(cleanFileName.takeLast(10)))
                val isCallKeyword = isCallRecordingKeyword(file.name, dirPath)

                if (phoneMatches || isCallKeyword) {
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
            MediaStore.Audio.Media.DATE_ADDED
        )
        val startTimeSeconds = startTimeMs / 1000 - 900 // 15 minutes window
        val selection = "${MediaStore.Audio.Media.DATE_ADDED} >= ?"
        val selectionArgs = arrayOf(startTimeSeconds.toString())
        val sortOrder = "${MediaStore.Audio.Media.DATE_ADDED} DESC"
        
        var cursor: Cursor? = null
        try {
            cursor = contentResolver.query(mediaUri, projection, selection, selectionArgs, sortOrder)
            if (cursor != null) {
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val displayNameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                val dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)
                
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val filePath = cursor.getString(dataCol) ?: ""
                    val displayName = cursor.getString(displayNameCol) ?: ""
                    
                    val isCallPath = isCallRecordingKeyword(displayName, filePath)
                    val cleanFileName = displayName.replace(Regex("[^0-9]"), "")
                    val phoneMatches = cleanPhone.isNotEmpty() && cleanFileName.isNotEmpty() &&
                        (cleanFileName.contains(cleanPhone) || cleanPhone.contains(cleanFileName.takeLast(10)))
                    
                    if (isCallPath || phoneMatches) {
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


    private fun copyUriToCache(id: Long, fileName: String): String? {
        try {
            val contentUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
            val cacheDir = reactApplicationContext.cacheDir
            
            val safeFileName = fileName.replace(Regex("[^a-zA-Z0-9.-]"), "_")
            val destFile = File(cacheDir, "recorded_call_$safeFileName")
            
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
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
