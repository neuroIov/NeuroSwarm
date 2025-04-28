import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="bg-gray-800 text-white p-4 rounded-lg mb-4 border border-red-500">
                    <h3 className="text-lg font-bold text-red-500 mb-2">Component Error</h3>
                    {this.state.error && (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-300">{this.state.error.message}</p>
                            <details className="text-xs">
                                <summary className="cursor-pointer text-gray-400 hover:text-white">Stack Trace</summary>
                                <pre className="mt-2 p-2 bg-gray-900 rounded overflow-auto">
                                    {this.state.error.stack}
                                </pre>
                            </details>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
