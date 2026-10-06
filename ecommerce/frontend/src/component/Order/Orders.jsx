import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router';
import Page from '../layout/Page';
import { getErrorMessage } from '../../utils/api';

export const statusLabel = status => ({ Processing: 'Em processamento', Shipped: 'Enviado', Delivered: 'Entregue', Pending: 'Pendente' }[status] || status);
export const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Orders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        axios.get('/api/v1/orders/me', { signal: controller.signal }).then(({ data }) => setOrders(data.orders))
            .catch(error => { if (!axios.isCancel(error)) setError(getErrorMessage(error)); })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, []);
    return <Page title="Meus pedidos">
        {loading && <p>Carregando pedidos...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && !orders.length && <p>Você ainda não possui pedidos.</p>}
        {!!orders.length && <div className="tableScroll"><table><thead><tr><th>Pedido</th><th>Status</th><th>Total</th></tr></thead><tbody>
            {orders.map(order => <tr key={order._id}><td><Link to={`/order/${order._id}`}>{order._id}</Link></td><td>{statusLabel(order.orderStatus)}</td><td>{money(order.totalPrice)}</td></tr>)}
        </tbody></table></div>}
        <Link to="/products">Continuar comprando</Link>
    </Page>;
}
