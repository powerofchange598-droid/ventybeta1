import React, { ErrorInfo, ReactNode } from 'react';
import VentyButton from './VentyButton';
import Card from './Card';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Venty ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    window.location.reload();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
          <div className="h-full w-full flex items-center justify-center p-4 bg-bg-primary">
              <Card className="max-w-lg text-center !p-8">
                  <ExclamationTriangleIcon className="h-12 w-12 text-feedback-error mx-auto mb-4" />
                  <h1 className="text-2xl font-bold font-serif text-text-primary">Failed to load the app.</h1>
                  <p className="text-text-secondary mt-2">
                      An unexpected error occurred. Our team has been notified.
                  </p>
                  
                  <VentyButton
                      onClick={this.handleRetry}
                      variant='primary'
                      className="!w-auto mt-6 !py-2 !px-6"
                      label="Try reloading it"
                  />
              </Card>
          </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
