export function App() {
  const params = new URLSearchParams(window.location.search);
  const stagingId = params.get('stagingId');

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui', color: '#eaeaea', background: '#1a1a1a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: 0, marginBottom: 12 }}>Crop</h1>
      <p style={{ fontSize: 13, color: '#999' }}>
        Modal scaffold — staging id: <code>{stagingId ?? '(none)'}</code>. Multi-region canvas will replace this.
      </p>
    </div>
  );
}