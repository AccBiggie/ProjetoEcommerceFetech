import ReactDOM from 'react-dom/client';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { StrictMode, useEffect } from 'react';
import store from '../../../frontend/src/store.js';
import { getProduct, getProductDetails } from '../../../frontend/src/actions/productAction.js';

function StrictRead() {
  const dispatch = useDispatch();
  const products = useSelector(value => value.products.products);
  const product = useSelector(value => value.productDetails.product);
  useEffect(() => {
    window.__strictEffects = (window.__strictEffects || 0) + 1;
    dispatch(getProduct());
    dispatch(getProductDetails(new URLSearchParams(location.search).get('id')));
  }, [dispatch]);
  return <main><h1>Leituras Strict Mode</h1><p role="status">{products.length && product?._id ? 'Pronto' : 'Carregando'}</p></main>;
}
export function mount(container) {
  ReactDOM.createRoot(container).render(<StrictMode><Provider store={store}><StrictRead /></Provider></StrictMode>);
}
