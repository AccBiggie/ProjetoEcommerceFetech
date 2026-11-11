import ReactDOM from 'react-dom/client';
import { StrictMode, useEffect } from 'react';
import { BrowserRouter } from 'react-router';
import MetaData from '../../../frontend/src/component/layout/MetaData.jsx';
function Probe() {
  useEffect(() => { window.__strictSeoEffects = (window.__strictSeoEffects || 0) + 1; }, []);
  return <><MetaData /><main><h1>SEO Strict Mode</h1></main></>;
}
export function mount(container) { ReactDOM.createRoot(container).render(<StrictMode><BrowserRouter><Probe /></BrowserRouter></StrictMode>); }
