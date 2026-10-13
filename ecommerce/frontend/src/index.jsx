import ReactDOM from 'react-dom/client';
import './utils/httpClient';
import { Provider } from 'react-redux';
import AppErrorBoundary from './component/recovery/AppErrorBoundary';
import { renderBootstrapRecovery } from './storage/bootstrapRecovery.mjs';

async function bootstrap() {
  const container = document.getElementById('root');
  try {
    const [{ default: App }, { default: store }] = await Promise.all([import('./App'), import('./store')]);
    ReactDOM.createRoot(container, { onCaughtError: () => {}, onUncaughtError: () => renderBootstrapRecovery(container) }).render(
      <AppErrorBoundary><Provider store={store}><App /></Provider></AppErrorBoundary>
    );
  } catch {
    if (import.meta.env.DEV) console.error('FETECH_BOOTSTRAP_FAILED');
    renderBootstrapRecovery(container);
  }
}
bootstrap();
