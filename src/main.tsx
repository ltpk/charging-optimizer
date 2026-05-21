import React from 'react'
import ReactDOM from 'react-dom/client'
import { Typography, Box } from '@mui/material'
import App from './App'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) return (
      <Box sx={{ p: 4 }}>
        <Typography color="error" variant="h6" gutterBottom>Something went wrong</Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {(this.state.error as Error).message}
          {'\n'}
          {(this.state.error as Error).stack}
        </Typography>
      </Box>
    )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
