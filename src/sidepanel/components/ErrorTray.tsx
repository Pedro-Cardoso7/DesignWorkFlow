import { useEffect, useState } from 'react';
import type { ExtensionMessage, ExtensionResponse } from '../../shared/messages';
import type { CaptureError } from '../../shared/types';
import { theme } from '../theme';

export function ErrorTray() {
  const [errors, setErrors] = useState<CaptureError[]>([]);

  useEffect(() => {
    let cancelled = false;
    chrome.runtime
      .sendMessage({ type: 'GET_CAPTURE_ERRORS' } satisfies ExtensionMessage)
      .then((resp: ExtensionResponse) => {
        if (cancelled || !resp?.ok) return;
        setErrors(resp.errors ?? []);
      })
      .catch(() => {});

    const listener = (msg: ExtensionMessage) => {
      if (msg.type !== 'CAPTURE_ERRORS_UPDATED') return;
      setErrors(msg.errors);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  if (errors.length === 0) return null;

  const dismiss = (id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
    chrome.runtime
      .sendMessage({ type: 'DISMISS_CAPTURE_ERROR', id } satisfies ExtensionMessage)
      .catch(() => {});
  };

  const clearAll = () => {
    setErrors([]);
    chrome.runtime
      .sendMessage({ type: 'CLEAR_CAPTURE_ERRORS' } satisfies ExtensionMessage)
      .catch(() => {});
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600 }}>
          {errors.length} capture error{errors.length === 1 ? '' : 's'}
        </span>
        <button onClick={clearAll} style={clearButtonStyle}>
          Clear all
        </button>
      </div>
      <ul style={listStyle}>
        {errors.map((e) => (
          <li key={e.id} style={itemStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                title={e.error}
                style={{
                  color: '#ffb0b0',
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {e.error}
              </div>
              {e.url && (
                <div
                  title={e.url}
                  style={{
                    color: '#a06060',
                    fontSize: 10,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {e.url}
                </div>
              )}
            </div>
            <span style={{ color: '#a06060', fontSize: 10, whiteSpace: 'nowrap' }}>
              {formatAge(e.at)}
            </span>
            <button
              onClick={() => dismiss(e.id)}
              title="Dismiss"
              style={dismissButtonStyle}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatAge(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

const containerStyle: React.CSSProperties = {
  borderTop: `1px solid ${theme.border}`,
  background: '#2a1414',
  color: '#ffb0b0',
  fontSize: 11,
  maxHeight: 180,
  overflow: 'auto',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  borderBottom: `1px solid #4a1e1e`,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderBottom: `1px solid #3a1818`,
};

const clearButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#ffb0b0',
  border: `1px solid #4a1e1e`,
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 10,
  cursor: 'pointer',
};

const dismissButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#ffb0b0',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: '0 4px',
};
