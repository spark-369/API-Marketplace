import { Component } from 'react'

/**
 * Top-level error boundary.
 *
 * React unmounts the entire tree when a render throws, which for an SPA means a blank white page with
 * the error visible only in the console. This boundary converts that into a recoverable screen and
 * reports the error so it is not lost.
 *
 * It must be a class: `componentDidCatch` / `getDerivedStateFromError` have no hook equivalent.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.handleReset = this.handleReset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    // Replace with a real reporting sink (Sentry, OpenTelemetry) in deployment.
    console.error('Unhandled UI error', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleReset() {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state

    if (!error) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="card w-full max-w-lg text-center">
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The page ran into an unexpected problem. You can retry, or reload the application.
          </p>
          <p className="mt-4 break-words rounded bg-slate-100 px-3 py-2 text-left font-mono text-xs text-slate-600">
            {error.message}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={this.handleReset}>
              Try again
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
