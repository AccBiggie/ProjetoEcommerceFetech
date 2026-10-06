import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router';
import { useSelector } from 'react-redux';
import Page from '../layout/Page';
import categories from '../../data/categories.json';
import { getErrorMessage } from '../../utils/api';
import { money, statusLabel } from '../Order/Orders';

const emptyProduct = () => ({ name: '', description: '', category: categories[0], price: '', oldPrice: '', Stock: 10, imageUrl: '/demo-products/ProjetoLogoFetech2.svg' });
export default function Dashboard() {
    const { user } = useSelector(state => state.user);
    const [tab, setTab] = useState('products');
    const [data, setData] = useState({ products: [], users: [], orders: [] });
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const [draft, setDraft] = useState(emptyProduct);
    const load = useCallback(async () => {
        const [products, users, orders] = await Promise.all([axios.get('/api/v1/admin/products'), axios.get('/api/v1/admin/users'), axios.get('/api/v1/admin/orders')]);
        setData({ products: products.data.products, users: users.data.users, orders: orders.data.orders });
    }, []);
    useEffect(() => { load().catch(error => setError(getErrorMessage(error))); }, [load]);
    const mutate = async action => {
        setError(''); setPending(true);
        try { await action(); await load(); } catch (error) { setError(getErrorMessage(error)); }
        finally { setPending(false); }
    };
    const saveProduct = event => {
        event.preventDefault();
        const price = Number(draft.price), oldPrice = Number(draft.oldPrice || draft.price);
        const payload = { name: draft.name, description: draft.description, category: draft.category, price: price.toFixed(2), oldPrice: oldPrice.toFixed(2),
            Stock: Number(draft.Stock), off: Math.max(0, Math.round((1 - price / oldPrice) * 100)), installmmentPrice: (price / 12).toFixed(2),
            countDown: draft.countDown || new Date(Date.now() + 30 * 86400000).toISOString(), images: [{ public_id: draft.images?.[0]?.public_id || 'catalog-image', url: draft.imageUrl, banner: draft.imageUrl }] };
        mutate(async () => { if (draft._id) await axios.put(`/api/v1/product/${draft._id}`, payload); else await axios.post('/api/v1/product/new', payload); setDraft(emptyProduct()); });
    };
    return <Page title="Painel administrativo">
        <p>{data.products.length} produtos · {data.users.length} usuários · {data.orders.length} pedidos</p>
        <nav aria-label="Administração">{[['products', 'Produtos'], ['users', 'Usuários'], ['orders', 'Pedidos']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key}>{label}</button>)}</nav>
        {error && <p role="alert">{error}</p>}
        {tab === 'products' && <><h2>{draft._id ? 'Editar produto' : 'Novo produto'}</h2>
            <form onSubmit={saveProduct}>
                {[['name', 'Nome'], ['description', 'Descrição'], ['price', 'Preço'], ['oldPrice', 'Preço anterior'], ['Stock', 'Estoque'], ['imageUrl', 'URL da imagem']].map(([key, label]) => <label key={key}>{label}<input required={key !== 'oldPrice'} type={['price', 'oldPrice', 'Stock'].includes(key) ? 'number' : 'text'} min={key === 'Stock' ? 0 : 0.01} step={key === 'Stock' ? 1 : '0.01'} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
                <label>Categoria<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
                <div className="actions"><button type="submit" disabled={pending}>Salvar produto</button>{draft._id && <button type="button" onClick={() => setDraft(emptyProduct())}>Cancelar edição</button>}</div>
            </form>
            <div className="tableScroll"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Ações</th></tr></thead><tbody>{data.products.map(product => <tr key={product._id}><td><Link to={`/product/${product._id}`}>{product.name}</Link></td><td>{product.category}</td><td>{money(product.price)}</td><td className="actions"><button disabled={pending} onClick={() => setDraft({ ...product, imageUrl: product.images[0]?.url || '/Profile.png' })}>Editar</button><button disabled={pending} onClick={() => { if (window.confirm('Excluir este produto?')) mutate(() => axios.delete(`/api/v1/product/${product._id}`)); }}>Excluir</button></td></tr>)}</tbody></table></div>
        </>}
        {tab === 'users' && <div className="tableScroll"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ações</th></tr></thead><tbody>{data.users.map(account => <tr key={account._id}><td>{account.name}</td><td>{account.email}</td><td><select aria-label={`Perfil de ${account.email}`} value={account.role} disabled={pending || account._id === user._id} onChange={e => mutate(() => axios.put(`/api/v1/admin/user/${account._id}`, { role: e.target.value }))}><option value="user">Cliente</option><option value="admin">Administrador</option></select></td><td><button disabled={pending || account._id === user._id} onClick={() => { if (window.confirm('Excluir este usuário?')) mutate(() => axios.delete(`/api/v1/admin/user/${account._id}`)); }}>Excluir</button></td></tr>)}</tbody></table></div>}
        {tab === 'orders' && <div className="tableScroll"><table><thead><tr><th>Pedido</th><th>Status</th><th>Total</th><th>Ações</th></tr></thead><tbody>{data.orders.map(order => <tr key={order._id}><td><Link to={`/order/${order._id}`}>{order._id}</Link></td><td>{statusLabel(order.orderStatus)}</td><td>{money(order.totalPrice)}</td><td className="actions">{order.orderStatus !== 'Delivered' && <button disabled={pending} onClick={() => mutate(() => axios.put(`/api/v1/admin/order/${order._id}`, { status: order.orderStatus === 'Processing' ? 'Shipped' : 'Delivered' }))}>{order.orderStatus === 'Processing' ? 'Marcar enviado' : 'Marcar entregue'}</button>}<button disabled={pending} onClick={() => { if (window.confirm('Excluir este pedido?')) mutate(() => axios.delete(`/api/v1/admin/order/${order._id}`)); }}>Excluir</button></td></tr>)}</tbody></table></div>}
    </Page>;
}
