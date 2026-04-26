import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0c10',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          background: '#12151c',
          borderRadius: 16,
          border: '1px solid #ef444430',
          padding: '40px 32px',
          maxWidth: 420,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#ef4444',
            marginBottom: 12,
            fontFamily: "'Outfit', sans-serif",
          }}>Something went wrong</div>
          <div style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#636b7e',
            marginBottom: 24,
            wordBreak: 'break-word',
          }}>{this.state.error?.message || 'Unknown error'}</div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              borderRadius: 8,
              cursor: 'pointer',
              background: '#22c55e18',
              color: '#22c55e',
              border: '1px solid #22c55e40',
            }}
          >Reload</button>
        </div>
      </div>
    );
  }
}
