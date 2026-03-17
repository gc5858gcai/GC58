import React, { Component, ErrorInfo, ReactNode } from 'react';
import { translations, Language } from './i18n.ts';

// ErrorBoundary component to catch and display errors gracefully.
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const language = (localStorage.getItem('gc58_lang') as Language) || 'fr';
      const t = translations[language];
      
      let errorMessage = t.errorSomethingWentWrong;
      try {
        const parsed = JSON.parse(this.state.error?.message || "{}");
        if (parsed.error) {
          errorMessage = `Firestore Error: ${parsed.error} (${parsed.operationType} on ${parsed.path})`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t.errorOops}</h2>
            <p className="text-slate-500 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
            >
              {t.tryAgain}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
