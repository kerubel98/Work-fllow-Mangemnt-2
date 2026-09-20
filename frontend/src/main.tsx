import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Workspace Application Initialization Error" fallbackMessage="An unhandled error occurred during application startup. Click below to reload or reset cached local preferences.">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
