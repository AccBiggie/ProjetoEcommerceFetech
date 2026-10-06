import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import Page from '../layout/Page';
import { saveShippingInfo } from '../../actions/cartAction';
import { CLEAR_CART } from '../../constants/cartConstants';
import { getErrorMessage } from '../../utils/api';
import { money } from '../Order/Orders';

export default function Shipping() {
    const { cartItems, shippingInfo } = useSelector(state => state.cart);
    const [shipping, setShipping] = useState({ address: '', city: '', state: '', country: 'Brasil', pinCode: '', phoneNo: '', ...shippingInfo });
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const dispatch = useDispatch();
    const completedOrder = useRef(null);
    const submit = async event => {
        event.preventDefault(); setPending(true); setError('');
        try {
            await dispatch(saveShippingInfo(shipping));
            const { data } = await axios.post('/api/v1/order/new', { shippingInfo: shipping, orderItems: cartItems.map(item => ({ product: item.product, quantity: item.quantity })) });
            completedOrder.current = data.order._id;
            dispatch({ type: CLEAR_CART }); localStorage.removeItem('cartItems');
        } catch (error) { setError(getErrorMessage(error)); }
        finally { setPending(false); }
    };
    if (completedOrder.current) return <Navigate to={`/order/${completedOrder.current}`} replace />;
    if (!cartItems.length) return <Navigate to="/cart" replace />;
    return <Page title="Finalizar pedido">
        <p>Total dos produtos: {money(cartItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0))}</p>
        <p>O pedido será registrado com pagamento pendente. Não será efetuada cobrança nesta etapa.</p>
        {error && <p role="alert">{error}</p>}
        <form onSubmit={submit}>{[['address', 'Endereço'], ['city', 'Cidade'], ['state', 'Estado'], ['country', 'País'], ['pinCode', 'CEP'], ['phoneNo', 'Telefone']].map(([key, label]) =>
            <label key={key}>{label}<input name={key} value={shipping[key]} required inputMode={['pinCode', 'phoneNo'].includes(key) ? 'numeric' : undefined} pattern={['pinCode', 'phoneNo'].includes(key) ? '[0-9]+' : undefined} onChange={e => setShipping({ ...shipping, [key]: e.target.value })} /></label>
        )}<button disabled={pending} type="submit">{pending ? 'Criando pedido...' : 'Criar pedido'}</button></form>
    </Page>;
}
