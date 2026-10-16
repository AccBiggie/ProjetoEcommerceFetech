import { recoveryHead } from '../seo/head.mjs';
export function renderBootstrapRecovery(container, document = globalThis.document, reload = () => globalThis.location.reload()) {
    if (!container) return;
    recoveryHead(document);
    const main = document.createElement('main'); main.className = 'fetech-recovery';
    const brand = document.createElement('p'); brand.textContent = 'Fetech';
    const heading = document.createElement('h1'); heading.textContent = 'Não foi possível carregar esta tela.';
    const text = document.createElement('p'); text.setAttribute('role', 'alert'); text.textContent = 'Recarregue a página para tentar novamente. Seus dados locais serão preservados.';
    const button = document.createElement('button'); button.textContent = 'Recarregar página'; button.addEventListener('click', reload);
    main.append(brand, heading, text, button); container.replaceChildren(main); button.focus();
}
