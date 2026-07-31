import React from "react";

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Render crash:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-ink px-4">
          <div className="bg-panel border border-line rounded-xl p-6 max-w-sm w-full text-center">
            <p className="text-white font-medium mb-1">یک خطای غیرمنتظره رخ داد</p>
            <p className="text-muted text-sm mb-4 break-words">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-signal text-white hover:bg-signal/90"
            >
              بارگذاری مجدد صفحه
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
