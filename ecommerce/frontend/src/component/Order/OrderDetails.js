import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import Page from '../layout/Page';
import { getErrorMessage } from '../../utils/api';
import { statusLabel, money } from './Orders';

export default function OrderDetails() {
    const { id } = useParams();
    const [state, setState] = useState({ loading: true });
    useEffect(() => {
        const controller = new AbortController();
        setState({ loading: true });
        axios.get(`/api/v1/order/${id}`, { signal: controller.signal })
            .then(({ data }) => setState({ order: data.order }))
            .catch(error => { if (!axios.isCancel(error)) setState({ error: getErrorMessage(error) }); });
        return () => controller.abort();
    }, [id]);
    const order = state.order;
    return <Page title="Detalhes do pedido">
        {state.loading && <p>Carregando pedido...</p>}
        {state.error && <p role="alert">{state.error}</p>}
        {order && <><p>Pedido: {order._id}</p><p>Status: {statusLabel(order.orderStatus)}</p><p>Pagamento: {statusLabel(order.paymentInfo.status)}</p>
            <h2>Entrega</h2><p>{order.shippingInfo.address}, {order.shippingInfo.city} — {order.shippingInfo.state}</p>
            <h2>Produtos</h2><ul>{order.orderItems.map(item => <li key={item._id}><Link to={`/product/${item.product}`}>{item.name}</Link> — {item.quantity} × {money(item.price)}</li>)}</ul>
            <p>Total: {money(order.totalPrice)}</p></>}
        <Link to="/orders">Meus pedidos</Link>
    </Page>;
}
