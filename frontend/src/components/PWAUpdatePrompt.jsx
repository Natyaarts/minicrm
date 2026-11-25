import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PWAUpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [offlineReady, setOfflineReady],
        updateServiceWorker,
    } = useRegisterSW();

    const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

    useEffect(() => {
        const goOnline = () => setIsOffline(false);
        const goOffline = () => setIsOffline(true);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    useEffect(() => {
        if (!offlineReady) return;
        const timer = setTimeout(() => setOfflineReady(false), 4000);
        return () => clearTimeout(timer);
    }, [offlineReady, setOfflineReady]);

    return (
        <>
            {isOffline && (
                <div className="fixed top-0 inset-x-0 z-[9999] bg-amber-500 text-white text-xs font-medium text-center py-1">
                    You're offline – data may not load
                </div>
            )}

            {(needRefresh || offlineReady) && (
                <div
                    role="status"
                    className="fixed bottom-4 right-4 z-[9999] max-w-sm bg-white border border-slate-200 shadow-lg rounded-xl p-4 flex items-center gap-3"
                >
                    <span className="text-sm text-slate-800">
                        {needRefresh ? 'New version available' : 'App ready to work offline'}
                    </span>
                    {needRefresh && (
                        <div className="flex gap-2 ml-auto">
                            <button
                                type="button"
                                onClick={() => updateServiceWorker(true)}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                            >
                                Reload
                            </button>
                            <button
                                type="button"
                                onClick={() => setNeedRefresh(false)}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100"
                            >
                                Later
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
