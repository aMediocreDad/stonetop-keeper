import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Message custom à afficher dans le fallback. */
  fallbackTitle?: string;
  /** Corps du fallback. JAMAIS `error.message` : un « Cannot read properties
      of undefined » brut n'est pas un message utilisateur — le détail part
      dans la console via componentDidCatch. */
  fallbackMessage?: string;
  /** Libellé du bouton de réessai (une classe ne peut pas appeler useT). */
  resetLabel?: string;
  /** Classes du conteneur du fallback (`h-full` par défaut). */
  className?: string;
  /** Bouton de retour : libellé + handler. */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary classique de React. Empêche un crash dans un sous-arbre
 * de propager une page blanche, et affiche un message lisible à la place.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={`flex flex-col items-center justify-center p-8 text-center ${
            this.props.className ?? 'h-full'
          }`}
        >
          <AlertTriangle
            size={36}
            className="text-[var(--text-muted)] mb-3"
            strokeWidth={1.5}
          />
          <h3 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-1">
            {this.props.fallbackTitle ?? 'Something went wrong'}
          </h3>
          <p className="text-sm text-[var(--text-muted)] font-body mb-5 max-w-md">
            {this.props.fallbackMessage ?? 'Something broke while drawing this page. Try reloading.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="btn-outline text-sm"
          >
            {this.props.resetLabel ?? 'Retry'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
