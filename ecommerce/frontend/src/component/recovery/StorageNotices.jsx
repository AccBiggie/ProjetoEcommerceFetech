import { useSyncExternalStore } from 'react';
import { subscribeStorageNotices, getStorageNotices, dismissStorageNotices } from '../../storage/safeStorage.mjs';
export default function StorageNotices() {
    const notices = useSyncExternalStore(subscribeStorageNotices, getStorageNotices);
    if (!notices.length) return null;
    const keys = new Set(notices.map(value => value.key));
    const failedWrite = notices.some(value => value.reason === 'STORAGE_WRITE_FAILED');
    return <aside className="fetech-storage-notices" aria-label="Avisos do armazenamento local"><div role="alert">
        {keys.has('cartItems') && <p>Não foi possível recuperar ou salvar o carrinho deste navegador. Revise os itens antes de continuar.</p>}
        {keys.has('shippingInfo') && <p>Não foi possível recuperar ou salvar os dados locais de entrega. Confira o endereço no checkout.</p>}
        {keys.has('fetech.orderAttempt.v1') && <p>Confira seus pedidos antes de iniciar outra tentativa de compra.</p>}
        {keys.has('fetech-color-mode') && <p>O navegador não permitiu recuperar ou salvar sua preferência de tema.</p>}
        {failedWrite && <p>As alterações podem permanecer apenas nesta página enquanto o armazenamento estiver indisponível.</p>}
        <button onClick={() => { dismissStorageNotices(); document.getElementById('main-content')?.focus(); }}>Entendi</button>
    </div></aside>;
}
