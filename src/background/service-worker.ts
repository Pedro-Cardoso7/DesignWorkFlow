chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[bg] setPanelBehavior failed', err));
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'OPEN_CROP_MODAL') {
    const params = new URLSearchParams({ stagingId: String(msg.stagingId ?? '') });
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/modal/index.html') + '?' + params.toString(),
    });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

export {};