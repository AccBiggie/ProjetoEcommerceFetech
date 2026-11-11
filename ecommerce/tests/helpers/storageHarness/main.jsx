import ReactDOM from 'react-dom/client';
import { useSelector } from 'react-redux';
import AppErrorBoundary from '../../../frontend/src/component/recovery/AppErrorBoundary.jsx';
import { renderBootstrapRecovery } from '../../../frontend/src/storage/bootstrapRecovery.mjs';
function BrokenDescendant() {
    if (new URLSearchParams(location.search).has('redux')) useSelector(value => value);
    throw new Error('PRIVATE_STACK_SENTINEL');
}
const container = document.getElementById('root');
if (new URLSearchParams(location.search).has('bootstrap')) renderBootstrapRecovery(container);
else if (new URLSearchParams(location.search).has('strict-seo')) import('./StrictSeo.jsx').then(({ mount }) => mount(container));
else if (new URLSearchParams(location.search).has('strict-read')) import('./StrictRead.jsx').then(({ mount }) => mount(container));
else ReactDOM.createRoot(container, { onCaughtError: () => {} }).render(<AppErrorBoundary><BrokenDescendant /></AppErrorBoundary>);
