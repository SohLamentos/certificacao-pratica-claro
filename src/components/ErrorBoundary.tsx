import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReset = () => {
    localStorage.removeItem('claro_cq_profile');
    localStorage.removeItem('claro_cq_selecionado');
    localStorage.removeItem('claro_analista_selecionado');
    localStorage.removeItem('claro_cq_auth_token');
    window.location.hash = '';
    window.location.pathname = '/';
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-6 text-center">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-xl space-y-6">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-100">
              <AlertTriangle size={32} />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-950">Ocorreu um erro ao trocar de perfil.</h1>
              <p className="text-xs text-slate-500">
                O aplicativo detectou uma inconsistência no estado interno do perfil selecionado.
              </p>
              {this.state.error && (
                <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl font-mono text-[10px] text-left text-slate-600 max-h-24 overflow-y-auto mt-2">
                  {this.state.error.message}
                </div>
              )}
            </div>

            <button
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} />
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
