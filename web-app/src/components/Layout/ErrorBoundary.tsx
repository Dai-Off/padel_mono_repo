import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Error desconocido',
    };
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', err);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[60vh] rounded-2xl border border-red-100 bg-red-50/50 p-5 text-sm text-red-900">
        <p className="font-bold">Se produjo un error al cargar esta pantalla.</p>
        <p className="mt-1 text-red-800/80">{this.state.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-[#E31E24] px-4 py-2 text-xs font-bold text-white"
        >
          Recargar
        </button>
      </div>
    );
  }
}

