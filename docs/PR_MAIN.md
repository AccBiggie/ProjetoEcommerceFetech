# feat: implementa cancelamento seguro de pedidos, performance e SEO

Base: `main`

Compare: `feat/order-cancellation-performance-seo`

## Resultado

Permite que clientes e administradores cancelem pedidos elegíveis, comprovadamente não pagos e anteriores ao envio. O cancelamento libera a reserva de estoque na mesma transação, preserva o histórico e impede duplicação em replays e requisições concorrentes.

## Alterações

- Rotas de cancelamento para cliente e administrador, com autorização e revalidação transacional do pedido e do ledger.
- Estados `Cancelled` e `RELEASED`, movimento `RELEASE`, auditoria e evento `ORDER_CANCELLED` na outbox.
- Confirmação acessível de cancelamento nas telas do cliente e do administrador.
- Testes de concorrência, atomicidade, autorização, auditoria, e-mails e fluxo no navegador; documentação dos contratos e limites.
- Inclui os commits locais `af6c182` e `0285bc6`, ainda ausentes de `origin/main` na preparação: otimizações do frontend, orçamento de bundle e baseline de SEO técnico.

## Validação

- Reexecutado em 11/11/2026: 77/77 testes focados de cancelamento, concorrência, auditoria e templates; zero falhas ou skips.
- `git diff --check`: aprovado.
- Build do frontend reexecutado e aprovado em 11/11/2026; Vite avisa que o import dinâmico de `store.js` também possui referências estáticas.
- O gate integral aprovado em 17/10/2026 está registrado em `docs/TESTES_FET_ORDER_005.md`; esse resultado é histórico. Conferir o CI remoto deste PR antes do merge.

## Limites

F028 permanece parcial: reembolso depende do gateway de pagamento; devolução depende de logística e política comercial; expiração automática de reservas permanece indefinida. Pedidos legados sem estado verificável exigem revisão. SEO em produção depende da infraestrutura. Esta alteração não comprova prontidão comercial nem executa migrações ou operações em serviços reais.
