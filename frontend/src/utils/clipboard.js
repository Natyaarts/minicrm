export const copyToClipboard = async (text) => {
    // 1. Log to console for debugging
    console.log('[DEBUG] Attempting to copy:', text);

    // 2. Try Modern API (Requires HTTPS)
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            console.log('[DEBUG] Modern API copy successful');
            return true;
        }
    } catch (err) {
        console.warn('[DEBUG] Modern API failed:', err);
    }

    // 3. Fallback for HTTP / Older Browsers
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Prevent scrolling to bottom in some browsers
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.setAttribute('readonly', ''); // Prevent keyboard on mobile

        document.body.appendChild(textArea);

        // Comprehensive selection
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999); // Mobile range

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
            console.log('[DEBUG] Fallback copy successful');
            return true;
        } else {
            console.error('[DEBUG] execCommand returned false');
            return false;
        }
    } catch (err) {
        console.error('[DEBUG] Fallback failed with error:', err);
        return false;
    }
};
