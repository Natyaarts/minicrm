import { Platform, Alert, NativeModules, NativeEventEmitter, PermissionsAndroid } from 'react-native';

const { CallRecordingModule } = NativeModules;
const callRecordingEmitter = CallRecordingModule ? new NativeEventEmitter(CallRecordingModule) : null;

export const requestCallPermissions = async () => {
    if (Platform.OS !== 'android') return true;
    try {
        const permissionsToRequest = [
            PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ];
        
        if (Platform.Version >= 33) {
            permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO);
        } else {
            permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        }

        const grants = await PermissionsAndroid.requestMultiple(permissionsToRequest);
        
        const audioGranted = grants[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
        const phoneStateGranted = grants[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.GRANTED;
        
        let storageGranted = false;
        if (Platform.Version >= 33) {
            storageGranted = grants[PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
        } else {
            storageGranted = grants[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED;
        }

        console.log('Permissions — RECORD_AUDIO:', audioGranted, 'READ_PHONE_STATE:', phoneStateGranted, 'STORAGE:', storageGranted);
        return true; 
    } catch (err) {
        console.warn('Permission request error:', err);
        return true; 
    }
};

export const listenToCallState = (onStateChanged: (event: { state: string; phoneNumber: string }) => void) => {
    if (!callRecordingEmitter) return () => {};
    
    const sub = callRecordingEmitter.addListener('onCallStateChanged', (event) => {
        console.log('Call state changed event:', event);
        onStateChanged(event);
    });
    
    return () => {
        sub.remove();
    };
};

export const requestDefaultDialerRole = async () => {
    if (Platform.OS !== 'android') {
        Alert.alert('Not Supported', 'Call recording is only supported on Android devices.');
        return false;
    }
    
    // In a full implementation, you would launch an Intent to ask for RolexManager.ROLE_DIALER
    // For now, we alert the user that this requires native compilation to test.
    Alert.alert(
        'Android Permissions', 
        'In the compiled Android build, this will trigger the system prompt: "Set Natya ERP as your default phone app?"'
    );
    return true;
};

export const checkIsDefaultDialer = async () => {
    if (Platform.OS !== 'android') return false;
    return false;
};

export const selectRecordingFolder = async () => {
    if (!CallRecordingModule) return null;
    try {
        const folderUri = await CallRecordingModule.selectRecordingFolder();
        return folderUri;
    } catch (e) {
        console.error('Failed to select recording folder:', e);
        return null;
    }
};

export const startNativeRecording = async (phoneNumber?: string) => {
    if (!CallRecordingModule) return null;
    try {
        const filePath = await CallRecordingModule.startRecording(phoneNumber || "");
        return filePath;
    } catch (e) {
        console.error(e);
        return null;
    }
};

export const stopNativeRecording = async () => {
    if (!CallRecordingModule) return null;
    try {
        const filePath = await CallRecordingModule.stopRecording();
        return filePath;
    } catch (e) {
        console.error(e);
        return null;
    }
};

export const listenToCallEvents = (onRecordingStopped: (filePath: string) => void) => {
    if (!callRecordingEmitter) return () => {};

    const sub1 = callRecordingEmitter.addListener('onRecordingStarted', (path) => {
        console.log('Native Call Recording Started:', path);
    });

    const sub2 = callRecordingEmitter.addListener('onRecordingStopped', (path) => {
        console.log('Native Call Recording Stopped:', path);
        onRecordingStopped(path);
    });

    const sub3 = callRecordingEmitter.addListener('onCallAdded', (id) => {
        console.log('Native Call Added:', id);
    });

    return () => {
        sub1.remove();
        sub2.remove();
        sub3.remove();
    };
};
