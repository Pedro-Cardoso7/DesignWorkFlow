export const theme = {
  bg: '#141414',
  panel: '#1c1c1c',
  border: '#2a2a2a',
  text: '#eaeaea',
  textMuted: '#8a8a8a',
  accent: '#7c5cff',
  danger: '#e05858',
  input: '#242424',
  radius: 6,
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

export const buttonStyle = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
  padding: '6px 10px',
  fontSize: 12,
  fontFamily: theme.fontFamily,
  border: `1px solid ${variant === 'danger' ? theme.danger : theme.border}`,
  borderRadius: theme.radius,
  background:
    variant === 'primary' ? theme.accent : variant === 'danger' ? 'transparent' : theme.panel,
  color: variant === 'danger' ? theme.danger : theme.text,
  cursor: 'pointer',
});