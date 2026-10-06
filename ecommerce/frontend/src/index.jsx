import ReactDOM from 'react-dom/client';
import App from './App';
import store from './store';
import { Toaster } from 'react-hot-toast';
import { Provider } from 'react-redux';

ReactDOM.createRoot(document.getElementById('root')).render(
  <Provider store={store}>
    <App />
    <Toaster position="bottom-center" toastOptions={{ duration: 5000 }} />
  </Provider>
);
