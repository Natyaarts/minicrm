package com.natyaarts.mobile

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.provider.CallLog
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.Collections

class CallRecordingModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        var reactContextRef: ReactApplicationContext? = null
        private const val TAG = "calllog"
        private const val PREFS_NAME = "CallRecordings"
        private const val CONSUMED_CALLLOG_KEY = "consumed_calllog_ids"
        private const val MAX_CONSUMED_CALLLOG_IDS = 200

        // CallLog rows already used by a concluded call. Insertion-ordered so the oldest can be trimmed,
        // persisted in SharedPreferences so a process restart can't reuse a previous call's row.
        // Every access goes through callLogLock.
        private val callLogLock = Any()
        private val consumedCallLogIds: LinkedHashSet<Long> = LinkedHashSet()
        private var consumedCallLogLoaded = false

        private val consumedRecordingPaths: MutableSet<String> = Collections.synchronizedSet(mutableSetOf<String>())

        // End of the last concluded call. Only moved when a call is concluded (markCallLogRowConsumed,
        // stopRecording, cancelRecording), never by a lookup. Used only as a fallback floor when JS
        // doesn't pass the previous session's end.
        @Volatile
        var lastProcessedCallEndTimeMs: Long = 0L
    }

    private data class CallLogMatch(val rowId: Long, val durationSec: Long, val dateMs: Long, val type: Int)

    private class CallLogQueryResult(
        val match: CallLogMatch?,
        val rowsScanned: Int,
        val rowsConsidered: Int,
        val consumedSkipped: Int
    )

    private fun ensureConsumedCallLogLoaded() {
        synchronized(callLogLock) {
            if (consumedCallLogLoaded) return
            try {
                val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.getString(CONSUMED_CALLLOG_KEY, null)
                    ?.split(",")
                    ?.mapNotNull { it.trim().toLongOrNull() }
                    ?.forEach { consumedCallLogIds.add(it) }
            } catch (e: Exception) {
                Log.w(TAG, "could not load consumed CallLog rows", e)
            }
            consumedCallLogLoaded = true
        }
    }

    private fun isCallLogRowConsumed(rowId: Long): Boolean {
        ensureConsumedCallLogLoaded()
        synchronized(callLogLock) { return consumedCallLogIds.contains(rowId) }
    }

    private var recorder: MediaRecorder? = null
    private var fallbackFilePath: String? = null

    // Peak MediaRecorder amplitude (0..32767) of the fallback recording, so JS can reject silent files.
    @Volatile private var peakAmplitude: Int = 0
    @Volatile private var lastFallbackPeak: Int = -1
    @Volatile private var lastFallbackPath: String? = null
    private val amplitudeHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val amplitudeSampler = object : Runnable {
        override fun run() {
            val active = recorder ?: return
            try {
                val amp = active.maxAmplitude // max since the previous call
                if (amp > peakAmplitude) peakAmplitude = amp
            } catch (e: Exception) {
                // recorder stopped/released on another thread
            }
            amplitudeHandler.postDelayed(this, 500)
        }
    }
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
                stopRecordingInternal(true)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ silences MIC capture for third-party apps while a call is active, so the
                // fallback file would be digital silence. Only the session (phone + start time) is kept,
                // so stopRecording() can still find the phone's own call recording.
                fallbackFilePath = null
                lastFallbackPath = null
                lastFallbackPeak = -1
                promise.resolve(null)
                return
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
            peakAmplitude = 0
            lastFallbackPath = filePath
            lastFallbackPeak = -1
            amplitudeHandler.removeCallbacks(amplitudeSampler)
            amplitudeHandler.postDelayed(amplitudeSampler, 500)

            sendEvent("onRecordingStarted", filePath)
            promise.resolve(filePath)
        } catch (e: Exception) {
            promise.reject("START_RECORDING_FAILED", e.message, e)
        }
    }

    /**
     * Peak amplitude (0..32767) of the last fallback recording if [filePath] is that file, else -1 (unknown).
     * 0 means digital silence.
     */
    @ReactMethod
    fun getFallbackPeakAmplitude(filePath: String?, promise: Promise) {
        val last = lastFallbackPath
        if (filePath != null && last != null &&
            (filePath == last || filePath.removePrefix("file://") == last || filePath.endsWith(File(last).name))) {
            promise.resolve(lastFallbackPeak.toDouble())
        } else {
            promise.resolve(-1.0)
        }
    }

    /**
     * Decodes up to the first [maxSeconds] of an audio file (file path, file:// or content:// URI) and
     * resolves its peak level in dBFS: 0 = full scale, -200 = digital silence, null = could not decode.
     */
    @ReactMethod
    fun getAudioPeakDbfs(uriOrPath: String?, maxSeconds: Double, promise: Promise) {
        if (uriOrPath.isNullOrEmpty()) {
            promise.resolve(null)
            return
        }
        Thread {
            var extractor: android.media.MediaExtractor? = null
            var codec: android.media.MediaCodec? = null
            try {
                val ex = android.media.MediaExtractor()
                extractor = ex
                if (uriOrPath.startsWith("content://")) {
                    ex.setDataSource(reactApplicationContext, Uri.parse(uriOrPath), null)
                } else {
                    ex.setDataSource(uriOrPath.removePrefix("file://"))
                }

                var trackIndex = -1
                var format: android.media.MediaFormat? = null
                for (i in 0 until ex.trackCount) {
                    val f = ex.getTrackFormat(i)
                    if (f.getString(android.media.MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
                        trackIndex = i
                        format = f
                        break
                    }
                }
                if (trackIndex < 0 || format == null) {
                    promise.resolve(null)
                    return@Thread
                }
                ex.selectTrack(trackIndex)
                val mime = format.getString(android.media.MediaFormat.KEY_MIME)!!
                val dec = android.media.MediaCodec.createDecoderByType(mime)
                codec = dec
                dec.configure(format, null, null, 0)
                dec.start()

                val limitUs = (maxSeconds.coerceIn(1.0, 30.0) * 1_000_000).toLong()
                val info = android.media.MediaCodec.BufferInfo()
                val deadline = System.currentTimeMillis() + 5_000L
                var inputDone = false
                var outputDone = false
                var peak = 0
                var decodedAny = false

                while (!outputDone && System.currentTimeMillis() < deadline) {
                    if (!inputDone) {
                        val inIdx = dec.dequeueInputBuffer(10_000)
                        if (inIdx >= 0) {
                            val inBuf = dec.getInputBuffer(inIdx)
                            val size = if (inBuf != null) ex.readSampleData(inBuf, 0) else -1
                            if (size < 0 || ex.sampleTime > limitUs) {
                                dec.queueInputBuffer(inIdx, 0, 0, 0, android.media.MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                dec.queueInputBuffer(inIdx, 0, size, ex.sampleTime, 0)
                                ex.advance()
                            }
                        }
                    }
                    val outIdx = dec.dequeueOutputBuffer(info, 10_000)
                    if (outIdx >= 0) {
                        val outBuf = dec.getOutputBuffer(outIdx)
                        if (outBuf != null && info.size > 0) {
                            decodedAny = true
                            outBuf.position(info.offset)
                            outBuf.limit(info.offset + info.size)
                            // Decoders output 16-bit PCM by default
                            val samples = outBuf.order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                            while (samples.hasRemaining()) {
                                val v = Math.abs(samples.get().toInt())
                                if (v > peak) peak = v
                            }
                        }
                        dec.releaseOutputBuffer(outIdx, false)
                        if ((info.flags and android.media.MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                            outputDone = true
                        }
                    }
                }

                when {
                    !decodedAny -> promise.resolve(null)
                    peak == 0 -> promise.resolve(-200.0)
                    else -> promise.resolve(20.0 * Math.log10(peak / 32768.0))
                }
            } catch (e: Exception) {
                e.printStackTrace()
                promise.resolve(null)
            } finally {
                try { codec?.stop() } catch (ignored: Exception) {}
                try { codec?.release() } catch (ignored: Exception) {}
                try { extractor?.release() } catch (ignored: Exception) {}
            }
        }.start()
    }

    /**
     * Immediately stops and discards any fallback recording without polling MediaStore/SAF.
     * Used when a call is unanswered, rejected, failed, or cancelled so the Call Log Save Portal
     * opens instantaneously (< 5ms) and never inherits a previous call's recording.
     */
    @ReactMethod
    fun cancelRecording(promise: Promise) {
        try {
            stopRecordingInternal(true)
            lastProcessedCallEndTimeMs = System.currentTimeMillis()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    /**
     * Stops the fallback recorder and looks for the phone's own call recording.
     * [prevSessionEndMs] is the end of the PREVIOUS call session, captured by JS before the CallLog
     * lookup; files from before it belong to an earlier call. <= 0 falls back to lastProcessedCallEndTimeMs.
     */
    @ReactMethod
    fun stopRecording(prevSessionEndMs: Double, promise: Promise) {
        // Stop fallback MediaRecorder immediately when call ends so it doesn't keep recording
        val fallbackPath = stopRecordingInternal(false)
        val activeStartTime = callStartTime
        val activeTargetPhone = targetPhoneNumber
        val floorMs = if (prevSessionEndMs > 0) prevSessionEndMs.toLong() else lastProcessedCallEndTimeMs

        // Run on a background thread with fast bounded polling (0ms, 300ms, 600ms, 900ms — max 0.9s instead of 30s)
        Thread {
            try {
                var systemRecordingPath: String? = null
                val delaysMs = longArrayOf(0L, 300L, 300L, 300L)

                for (i in delaysMs.indices) {
                    if (delaysMs[i] > 0L) {
                        Thread.sleep(delaysMs[i])
                    }
                    // Only run heavy SAF tree scan on first and last check if physical path resolution is unavailable
                    val scanSaf = (i == 0 || i == delaysMs.lastIndex)
                    systemRecordingPath = findRecentSystemRecording(activeTargetPhone, activeStartTime, scanSaf, floorMs)
                    if (systemRecordingPath != null) {
                        break
                    }
                }

                lastProcessedCallEndTimeMs = System.currentTimeMillis()

                if (systemRecordingPath != null) {
                    consumedRecordingPaths.add(systemRecordingPath)
                    File(systemRecordingPath).name.takeIf { it.isNotEmpty() }?.let { consumedRecordingPaths.add(it) }

                    // Delete the temporary fallback mic recording since genuine system recording was found
                    if (fallbackPath != null) {
                        try {
                            File(fallbackPath).delete()
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                    sendEvent("onRecordingStopped", systemRecordingPath)
                    promise.resolve(systemRecordingPath)
                } else if (fallbackPath != null) {
                    consumedRecordingPaths.add(fallbackPath)
                    File(fallbackPath).name.takeIf { it.isNotEmpty() }?.let { consumedRecordingPaths.add(it) }
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
            amplitudeHandler.removeCallbacks(amplitudeSampler)
            try {
                val amp = activeRecorder.maxAmplitude
                if (amp > peakAmplitude) peakAmplitude = amp
            } catch (e: Exception) {
                // ignore
            }
            lastFallbackPeak = peakAmplitude
            lastFallbackPath = path
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
                return null
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

    // A 10-digit Indian mobile number (optional +91 / 91 / 0 prefix) that is not part of a longer digit run,
    // so the digits of a timestamp like 20261124120301 are never read as a phone number.
    private val phoneInNameRegex = Regex("""(?<!\d)(?:\+?91|0)?([6-9]\d{9})(?!\d)""")

    /**
     * [floorMs]: end of the previous call session; files finalized before it belong to an earlier call.
     * [inMappedFolder]: the file is in the folder the user mapped, so the "call"/"record" keyword check
     * is skipped (contact-named files like "Rahul Sharma_....m4a" have no keyword). Elsewhere the check
     * runs on the file name plus its full path.
     */
    private fun isVerifiedCallRecording(
        fileName: String,
        filePath: String,
        targetPhone: String,
        startTimeMs: Long,
        fileLastModified: Long,
        floorMs: Long,
        inMappedFolder: Boolean
    ): Boolean {
        if (!isAudioRecordingFile(fileName)) return false
        if (!inMappedFolder && !isCallRecordingKeyword(fileName, filePath)) return false
        if (consumedRecordingPaths.contains(filePath) || consumedRecordingPaths.contains(fileName)) return false

        val cleanTarget = targetPhone.replace(Regex("[^0-9]"), "").takeLast(10)
        val cleanDigitsInFile = fileName.replace(Regex("[^0-9]"), "")

        // 1. Reject a filename that contains phone numbers, none of which is the dialled one
        val numbersInName = phoneInNameRegex.findAll(fileName).mapNotNull { it.groupValues.getOrNull(1) }.toList()
        if (cleanTarget.length >= 6 && numbersInName.isNotEmpty() && !numbersInName.contains(cleanTarget)) {
            return false
        }

        // Strict session lower bound: file must not have been finalized before the current call started
        // or before the previous call session ended.
        val minSessionStart = maxOf(
            if (startTimeMs > 0) (startTimeMs - 2_000L) else (System.currentTimeMillis() - 15_000L),
            floorMs
        )
        val windowEnd = System.currentTimeMillis() + 15_000L

        val phoneMatches = cleanTarget.length >= 6 && (cleanDigitsInFile.contains(cleanTarget) || fileName.contains(cleanTarget))
        if (phoneMatches) {
            return fileLastModified in minSessionStart..windowEnd
        }

        // 2. If phone is not in the filename at all (e.g. timestamp-only like Rec_2026-09-19_15-06-18.m4a),
        // strictly require that the file was created during this active call window
        if (startTimeMs > 0) {
            return fileLastModified in minSessionStart..windowEnd
        }

        return false
    }

    private fun findRecentSystemRecording(phoneNumber: String, startTimeMs: Long, scanSaf: Boolean, floorMs: Long): String? {
        val contentResolver = reactApplicationContext.contentResolver
        val cleanPhone = phoneNumber.replace(Regex("[^0-9]"), "").takeLast(10)
        val minSessionStart = maxOf(
            if (startTimeMs > 0) (startTimeMs - 2_000L) else (System.currentTimeMillis() - 15_000L),
            floorMs
        )

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
                        var maxLastModified = minSessionStart
                        for (file in (dir.listFiles() ?: emptyArray())) {
                            if (file.isFile && file.lastModified() >= maxLastModified) {
                                val name = file.name ?: ""
                                if (isVerifiedCallRecording(name, file.absolutePath, phoneNumber, startTimeMs, file.lastModified(), floorMs, true)) {
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

                // If physical resolution is not possible and scanSaf is true, use SAF listFiles fallback
                if (scanSaf) {
                    val documentFile = DocumentFile.fromTreeUri(reactApplicationContext, treeUri)
                    if (documentFile != null && documentFile.isDirectory) {
                        var mostRecentFile: DocumentFile? = null
                        var maxLastModified = minSessionStart

                        for (file in documentFile.listFiles()) {
                            val name = file.name ?: ""
                            if (!isAudioRecordingFile(name)) continue
                            if (consumedRecordingPaths.contains(name) || consumedRecordingPaths.contains(file.uri.toString())) continue
                            val lastMod = file.lastModified()
                            if (file.isFile && lastMod >= maxLastModified) {
                                if (isVerifiedCallRecording(name, file.uri.toString(), phoneNumber, startTimeMs, lastMod, floorMs, true)) {
                                    if (lastMod > (mostRecentFile?.lastModified() ?: 0)) {
                                        mostRecentFile = file
                                        maxLastModified = lastMod
                                    }
                                }
                            }
                        }

                        if (mostRecentFile != null) {
                            val copied = copySafFileToCache(mostRecentFile.uri, mostRecentFile.name ?: "recording.m4a", cleanPhone)
                            if (copied != null) {
                                consumedRecordingPaths.add(mostRecentFile.uri.toString())
                                mostRecentFile.name?.let { consumedRecordingPaths.add(it) }
                            }
                            return copied
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
            "/storage/emulated/0/CallRecordings",
            // Motorola / Stock Android
            "/storage/emulated/0/Android/data/com.google.android.dialer/files/Recordings",
            "/storage/emulated/0/PhoneRecord",
            // Itel / Tecno / Infinix
            "/storage/emulated/0/TelephoneRecord",
            "/storage/emulated/0/callrecordings"
        )

        var bestFile: File? = null
        var bestModified = minSessionStart

        for (dirPath in knownPaths) {
            val dir = File(dirPath)
            if (!dir.exists() || !dir.isDirectory) continue
            for (file in (dir.listFiles() ?: emptyArray())) {
                if (!file.isFile) continue
                if (file.lastModified() < minSessionStart) continue

                val name = file.name ?: ""
                if (isVerifiedCallRecording(name, file.absolutePath, phoneNumber, startTimeMs, file.lastModified(), floorMs, false)) {
                    if (file.lastModified() >= bestModified) {
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
        val startTimeSeconds = minSessionStart / 1000
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

                    if (isVerifiedCallRecording(displayName, filePath, phoneNumber, startTimeMs, fileLastModified, floorMs, false)) {
                        val copied = copyUriToCache(id, displayName, cleanPhone)
                        if (copied != null) {
                            consumedRecordingPaths.add(filePath)
                            consumedRecordingPaths.add(displayName)
                        }
                        return copied
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
        return lower.endsWith(".m4a") || lower.endsWith(".mp3") ||
            lower.endsWith(".amr") || lower.endsWith(".wav") ||
            lower.endsWith(".aac") || lower.endsWith(".3gp") ||
            lower.endsWith(".ogg") || lower.endsWith(".opus") || lower.endsWith(".mp4")
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

    /**
     * Pure read of the CallLog (no side effects): the newest row that
     *  - has the asked direction (OUTGOING / INCOMING) and the dialled number (last-10-digits rule),
     *  - has DATE >= callStartMs - 10s and DATE >= prevSessionEndMs (end of the PREVIOUS call session,
     *    passed in from JS), and DATE <= now + 10s,
     *  - is not already consumed by a concluded call.
     * CallLog.DATE is the call START time.
     */
    private fun queryCallLog(
        phoneNumber: String?,
        callStartTimeMs: Long,
        prevSessionEndMs: Long,
        callDirection: String?
    ): CallLogQueryResult {
        val cleanTarget = (phoneNumber ?: "").replace(Regex("[^0-9]"), "").takeLast(10)
        val now = System.currentTimeMillis()
        val minValidDate = maxOf(
            if (callStartTimeMs > 0) (callStartTimeMs - 10_000L) else (now - 10_000L),
            if (prevSessionEndMs > 0) prevSessionEndMs else 0L
        )
        val maxValidDate = now + 10_000L

        val projection = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.TYPE
        )
        val selection = "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.DATE} <= ?"
        val selectionArgs = arrayOf(minValidDate.toString(), maxValidDate.toString())
        val sortOrder = "${CallLog.Calls.DATE} DESC"

        var rowsScanned = 0
        var rowsConsidered = 0
        var consumedSkipped = 0
        var match: CallLogMatch? = null

        reactApplicationContext.contentResolver.query(
            CallLog.Calls.CONTENT_URI, projection, selection, selectionArgs, sortOrder
        )?.use { c ->
            val idIdx = c.getColumnIndex(CallLog.Calls._ID)
            val numIdx = c.getColumnIndex(CallLog.Calls.NUMBER)
            val dateIdx = c.getColumnIndex(CallLog.Calls.DATE)
            val durIdx = c.getColumnIndex(CallLog.Calls.DURATION)
            val typeIdx = c.getColumnIndex(CallLog.Calls.TYPE)

            while (c.moveToNext()) {
                rowsScanned++
                val rowId = if (idIdx != -1) c.getLong(idIdx) else -1L
                val num = if (numIdx != -1) c.getString(numIdx) ?: "" else ""
                val callDate = if (dateIdx != -1) c.getLong(dateIdx) else 0L
                val dur = if (durIdx != -1) c.getLong(durIdx) else 0L
                val type = if (typeIdx != -1) c.getInt(typeIdx) else 0

                if (callDate < minValidDate || callDate > maxValidDate) continue

                val directionMatches = when (callDirection?.uppercase()) {
                    "INCOMING" -> type == CallLog.Calls.INCOMING_TYPE ||
                                  type == CallLog.Calls.MISSED_TYPE ||
                                  (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && type == CallLog.Calls.REJECTED_TYPE) ||
                                  (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && type == CallLog.Calls.BLOCKED_TYPE)
                    "OUTGOING" -> type == CallLog.Calls.OUTGOING_TYPE ||
                                  type == CallLog.Calls.MISSED_TYPE ||
                                  (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && type == CallLog.Calls.REJECTED_TYPE)
                    else -> true
                }
                val rowClean = num.replace(Regex("[^0-9]"), "").takeLast(10)
                val numberMatches = cleanTarget.isEmpty() || rowClean.isEmpty() ||
                        rowClean == cleanTarget ||
                        rowClean.endsWith(cleanTarget) ||
                        cleanTarget.endsWith(rowClean)
                if (!directionMatches || !numberMatches) continue
                rowsConsidered++

                if (rowId != -1L && isCallLogRowConsumed(rowId)) {
                    // Never reuse a CallLog row that already belonged to a previous call
                    consumedSkipped++
                    continue
                }

                val isUnconnectedType = type == CallLog.Calls.MISSED_TYPE ||
                    (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && (type == CallLog.Calls.REJECTED_TYPE || type == CallLog.Calls.BLOCKED_TYPE))
                // Sorted newest first: the first matching row wins
                match = CallLogMatch(rowId, if (isUnconnectedType || dur <= 0L) 0L else dur, callDate, type)
                break
            }
        }
        return CallLogQueryResult(match, rowsScanned, rowsConsidered, consumedSkipped)
    }

    /**
     * Pure CallLog lookup. Resolves a map:
     *   { status: "found", rowId, durationSec, dateMs, type, rowsScanned, rowsConsidered, consumedSkipped }
     *   { status: "none", rowsScanned, rowsConsidered, consumedSkipped }
     *   { status: "no_permission" }  (READ_CALL_LOG not granted)
     *   { status: "error", message }
     * Never changes consumed rows or lastProcessedCallEndTimeMs; call markCallLogRowConsumed for that.
     */
    @ReactMethod
    fun findCallLogEntry(phoneNumber: String?, callStartTimeMs: Double, prevSessionEndMs: Double, callDirection: String?, promise: Promise) {
        Thread {
            val out = Arguments.createMap()
            try {
                if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
                    out.putString("status", "no_permission")
                    promise.resolve(out)
                    return@Thread
                }
                val result = queryCallLog(phoneNumber, callStartTimeMs.toLong(), prevSessionEndMs.toLong(), callDirection)
                out.putInt("rowsScanned", result.rowsScanned)
                out.putInt("rowsConsidered", result.rowsConsidered)
                out.putInt("consumedSkipped", result.consumedSkipped)
                val m = result.match
                if (m != null) {
                    out.putString("status", "found")
                    out.putDouble("rowId", m.rowId.toDouble())
                    out.putDouble("durationSec", m.durationSec.toDouble())
                    out.putDouble("dateMs", m.dateMs.toDouble())
                    out.putInt("type", m.type)
                } else {
                    out.putString("status", "none")
                }
                promise.resolve(out)
            } catch (e: Exception) {
                Log.w(TAG, "findCallLogEntry failed", e)
                out.putString("status", "error")
                out.putString("message", e.message ?: "unknown")
                promise.resolve(out)
            }
        }.start()
    }

    /**
     * Marks a CallLog row as used by a concluded call so no later call can claim it, and moves
     * lastProcessedCallEndTimeMs to the call's end. Call exactly once per concluded call.
     * Persisted (last MAX_CONSUMED_CALLLOG_IDS rows) so a process restart can't reuse the row.
     */
    @ReactMethod
    fun markCallLogRowConsumed(rowId: Double, callEndMs: Double, promise: Promise) {
        try {
            val id = rowId.toLong()
            if (id < 0L) {
                promise.resolve(false)
                return
            }
            ensureConsumedCallLogLoaded()
            val serialized = synchronized(callLogLock) {
                consumedCallLogIds.remove(id) // re-insert at the end (newest)
                consumedCallLogIds.add(id)
                while (consumedCallLogIds.size > MAX_CONSUMED_CALLLOG_IDS) {
                    val oldest = consumedCallLogIds.iterator()
                    oldest.next()
                    oldest.remove()
                }
                consumedCallLogIds.joinToString(",")
            }
            reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(CONSUMED_CALLLOG_KEY, serialized).apply()
            val end = callEndMs.toLong()
            if (end > lastProcessedCallEndTimeMs) lastProcessedCallEndTimeMs = end
            promise.resolve(true)
        } catch (e: Exception) {
            Log.w(TAG, "markCallLogRowConsumed failed", e)
            promise.resolve(false)
        }
    }

    /**
     * Legacy API kept for existing callers: duration (s) of the matching CallLog row, 0 when there is none,
     * null when READ_CALL_LOG is not granted. Now a pure read (no consumed rows / floor side effects).
     */
    @ReactMethod
    fun getLatestCallLogDuration(phoneNumber: String?, callStartTimeMs: Double, callDirection: String?, promise: Promise) {
        Thread {
            try {
                if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
                    promise.resolve(null)
                    return@Thread
                }
                val result = queryCallLog(phoneNumber, callStartTimeMs.toLong(), 0L, callDirection)
                promise.resolve((result.match?.durationSec ?: 0L).toDouble())
            } catch (e: Exception) {
                e.printStackTrace()
                promise.resolve(0.0)
            }
        }.start()
    }

    /**
     * Lists the audio files of a SAF tree (the mapped recording folder) and of its direct subfolders,
     * with last-modified time and size, in one DocumentsContract query per folder (no per-file round trip).
     * Resolves [{ uri, name, lastModified, size }]; lastModified / size are -1 when the provider doesn't say.
     */
    @ReactMethod
    fun listRecordingFolder(treeUriString: String, promise: Promise) {
        Thread {
            try {
                val treeUri = Uri.parse(treeUriString)
                val rootDocId = if (DocumentsContract.isDocumentUri(reactApplicationContext, treeUri)) {
                    DocumentsContract.getDocumentId(treeUri)
                } else {
                    DocumentsContract.getTreeDocumentId(treeUri)
                }
                val out = Arguments.createArray()
                val projection = arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED,
                    DocumentsContract.Document.COLUMN_SIZE
                )
                val subDirs = mutableListOf<String>()

                fun listChildren(parentDocId: String, collectDirs: Boolean) {
                    val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
                    reactApplicationContext.contentResolver.query(childrenUri, projection, null, null, null)?.use { c ->
                        while (c.moveToNext()) {
                            val docId = c.getString(0) ?: continue
                            val name = c.getString(1) ?: ""
                            val mime = c.getString(2) ?: ""
                            if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                                if (collectDirs) subDirs.add(docId)
                                continue
                            }
                            if (!isAudioRecordingFile(name)) continue
                            val item = Arguments.createMap()
                            item.putString("uri", DocumentsContract.buildDocumentUriUsingTree(treeUri, docId).toString())
                            item.putString("name", name)
                            item.putDouble("lastModified", if (c.isNull(3)) -1.0 else c.getLong(3).toDouble())
                            item.putDouble("size", if (c.isNull(4)) -1.0 else c.getLong(4).toDouble())
                            out.pushMap(item)
                        }
                    }
                }

                listChildren(rootDocId, true)
                for (dirId in subDirs) {
                    try { listChildren(dirId, false) } catch (e: Exception) { Log.w(TAG, "subfolder listing failed", e) }
                }
                promise.resolve(out)
            } catch (e: Exception) {
                promise.reject("LIST_FOLDER_FAILED", e.message, e)
            }
        }.start()
    }

    /** Audio duration in ms of a file path / file:// / content:// URI from its metadata, or null if unknown. */
    @ReactMethod
    fun getAudioDurationMs(uriOrPath: String?, promise: Promise) {
        if (uriOrPath.isNullOrEmpty()) {
            promise.resolve(null)
            return
        }
        Thread {
            val retriever = android.media.MediaMetadataRetriever()
            try {
                if (uriOrPath.startsWith("content://")) {
                    retriever.setDataSource(reactApplicationContext, Uri.parse(uriOrPath))
                } else {
                    retriever.setDataSource(uriOrPath.removePrefix("file://"))
                }
                val ms = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
                if (ms != null && ms > 0L) promise.resolve(ms.toDouble()) else promise.resolve(null)
            } catch (e: Exception) {
                promise.resolve(null)
            } finally {
                try { retriever.release() } catch (ignored: Exception) {}
            }
        }.start()
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}

