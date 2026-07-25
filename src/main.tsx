import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        event.request.data = undefined;
        event.request.headers = {};
        event.request.cookies = undefined;
      }
      event.user = undefined;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      return breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch' ? null : breadcrumb;
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
