import React from 'react';
import { t as translate, type TranslationKey } from '../i18n/translations';
import { useI18n } from '../stores/i18nStore';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || 'Unknown error';
      const stack = this.state.error?.stack || '';
      const lang = useI18n.getState().lang;
      const t = (key: TranslationKey) => translate(key, lang);
      return (
        <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
          <div className="text-center max-w-lg">
            <h2 className="text-2xl text-white mb-4">{t('common.somethingWentWrong')}</h2>
            <div className="bg-dark-800 rounded-lg p-4 mb-4 text-left">
              <p className="text-neon-red text-sm font-mono break-all mb-2">{msg}</p>
              {stack && (
                <pre className="text-gray-500 text-xs font-mono overflow-auto max-h-40 break-all whitespace-pre-wrap">{stack.split('\n').slice(0, 5).join('\n')}</pre>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                className="px-4 py-2 bg-doge-gold text-black rounded-lg font-bold"
                onClick={() => window.location.href = '/dogepad/'}
              >
                {t('common.back')}
              </button>
              <button
                className="px-4 py-2 bg-dark-700 text-white rounded-lg border border-dark-500"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                {t('common.reload')}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
