import React from 'react';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error('ErrorBoundary caught an error', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          padding: '40px',
          background: 'var(--glass-bg)',
          borderRadius: '16px',
          border: '1px solid var(--accent-red)',
          color: 'var(--text-main)',
          margin: '20px'
        }}>
          <AlertTriangle size={48} color="var(--accent-red)" style={{ marginBottom: '16px' }} />
          <h2 style={{ marginBottom: '16px' }}>Something went wrong.</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', textAlign: 'center', maxWidth: '600px' }}>
            The application encountered an unexpected error while trying to render this component.
          </p>
          <details style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', maxWidth: '800px', overflowX: 'auto', textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--accent-red)', fontWeight: 'bold' }}>View Error Details</summary>
            <br />
            {this.state.error && this.state.error.toString()}
            <br />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </span>
          </details>
          <button 
            onClick={() => window.location.reload()}
            className="btn-3d"
            style={{ marginTop: '24px', padding: '12px 24px' }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
