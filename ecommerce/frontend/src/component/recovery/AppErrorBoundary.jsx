import { Component, useEffect, useRef } from 'react';
import { restoreInterfacePreferences } from '../../storage/safeStorage.mjs';
import './recovery.css';
export function RecoveryView() {
    const heading = useRef(null);
    useEffect(() => { document.title = 'Falha ao carregar | Fetech'; heading.current?.focus(); }, []);
    return <main className="fetech-recovery">
        <p className="fetech-recovery-brand">Fetech</p>
        <h1 ref={heading} tabIndex={-1}>Não foi possível carregar esta tela.</h1>
        <p role="alert">Recarregue a página para tentar novamente. Seu carrinho e suas tentativas de pedido serão preservados.</p>
        <button onClick={() => window.location.reload()}>Recarregar página</button>
        <button onClick={() => { restoreInterfacePreferences(); window.location.reload(); }}>Restaurar preferências da interface</button>
        <p>Restaurar preferências redefine somente o tema deste navegador.</p>
    </main>;
}
export default class AppErrorBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() {
        // Technical event only: never log Error.message, stack, props or persisted data.
        if (import.meta.env.DEV) console.error('FETECH_RENDER_FAILED');
    }
    render() { return this.state.failed ? <RecoveryView /> : this.props.children; }
}
