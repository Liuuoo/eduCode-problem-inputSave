chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'fetchImage') {
        fetch(request.url)
            .then(res => res.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => sendResponse({ success: true, data: reader.result });
                reader.onerror = () => sendResponse({ success: false });
                reader.readAsDataURL(blob);
            })
            .catch(() => sendResponse({ success: false }));
        return true;
    }
    if (request.action === 'downloadFile') {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            conflictAction: 'uniquify'
        }, function(downloadId) {
            sendResponse({ success: !!downloadId });
        });
        return true;
    }
});
