import { Platform, Alert, NativeModules, NativeEventEmitter } from 'react-native';

const { CallRecordingModule } = NativeModules;
const callRecordingEmitter = CallRecordingModule ? new NativeEventEmitter(CallRecordingModule) : null;

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

export const startNativeRecording = async () => {
    if (!CallRecordingModule) return null;
    try {
        const filePath = await CallRecordingModule.startRecording();
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
