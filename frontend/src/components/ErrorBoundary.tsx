/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends (React.Component as any) {
  public state: State = {
    hasError: false,
    error: null
  };
  public props: Props;
  public setState!: (state: Partial<State> | ((prevState: State) => Partial<State>)) => void;

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error inside ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-4 text-slate-800 my-4 max-w-4xl mx-auto shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-rose-900">
                {this.props.fallbackTitle || 'A module error occurred while rendering this page.'}
              </h3>
              <p className="text-xs text-rose-700">
                {this.props.fallbackMessage || 'The view encountered an unexpected state. You can reload this view or reset local preferences.'}
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="p-3 bg-white border border-rose-200 rounded-lg text-[11px] font-mono text-rose-800 overflow-x-auto">
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Rendering</span>
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('operational_database_validation_workflows_v2');
                  localStorage.removeItem('operational_workspace_config_v1');
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Reset Cached Settings & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
