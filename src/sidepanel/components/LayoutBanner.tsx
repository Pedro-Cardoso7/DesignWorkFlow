import { useEffect, useState } from 'react';
import type { ExtensionMessage, ExtensionResponse } from '../../shared/messages';
import { theme } from '../theme';

export function LayoutBanner() {
  const [broken, setBroken] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    chrome.runtime
      .sendMessage({ type: 'GET_LAYOUT_STATUS' } satisfies ExtensionMessage)
      .then((resp: ExtensionResponse) => {
        if (cancelled || !resp?.ok) return;
        setBroken(!!resp.broken);
        setReason(resp.reason ?? null);
      })
      .catch(() => {});

    const listener = (msg: ExtensionMessage) => {
      if (msg.type !== 'LAYOUT_STATUS_UPDATED') return;
      setBroken(msg.broken);
      setReason(msg.reason);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  if (!broken) return null;

  const dismiss = () => {
    setBroken(false);
    chrome.runtime
      .sendMessage({ type: 'DISMISS_LAYOUT_BANNER' } satisfies ExtensionMessage)
      .catch(() => {});
  };

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        background: '#3a2a10',
        color: '#f6d38c',
        borderBottom: `1px solid ${theme.border}`,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          Midjourney layout appears to have changed — extension update needed.
        </div>
        {reason && (
          <div style={{ color: '#c9a668', fontSize: 11 }}>{reason}</div>
        )}
      </div>
      <button
        onClick={dismiss}
        title="Dismiss"
        style={{
          background: 'transparent',
          color: '#c9a668',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  );
}
