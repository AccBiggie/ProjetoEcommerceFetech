# release: promove cancelamento seguro, performance e SEO

Base pretendida: `production`

Compare pretendido: `main`, após integrar o PR de `feat/order-cancellation-performance-seo`.

## Pré-condição

Em 11/11/2026, a consulta ao remoto não encontrou `refs/heads/production`. Este texto é um rascunho de promoção: definir a base de produção e revisar o diff completo antes de abrir o PR. O conteúdo abaixo descreve este pacote, não outras diferenças que possam existir entre `main` e a futura base.

## Resultado esperado

Disponibiliza cancelamento de pedidos elegíveis e não pagos para clientes e administradores, com liberação transacional de estoque, histórico preservado, auditoria e notificação por outbox. Inclui otimizações de performance do frontend, orçamento de bundle e baseline de SEO técnico.

## Validação e promoção

- Reexecutados em 11/11/2026: 77/77 testes focados de cancelamento, concorrência, auditoria e templates, sem falhas ou skips.
- Build do frontend reexecutado e aprovado em 11/11/2026, com aviso sobre import dinâmico e estático de `store.js`.
- Evidência histórica do gate integral em `docs/TESTES_FET_ORDER_005.md`, de 17/10/2026; exigir CI aprovado no commit efetivamente promovido.
- Revisar a base `production`, o diff completo e as condições de deploy e rollback antes da promoção.
- Confirmar os pré-requisitos de estoque e índices já documentados; este pacote não aplica índices nem migrações em produção.

## Pendências operacionais e funcionais

Não declara produção pronta: infraestrutura e deploy, backup/restore real, validação dos providers e enforcement remoto dos gates permanecem com pendências documentadas. Reembolso, devolução e expiração automática de reservas estão fora desta entrega. Pedidos legados não verificados continuam exigindo revisão; origem, sitemap, robots e demais verificações de SEO produtivo dependem do ambiente publicado.
