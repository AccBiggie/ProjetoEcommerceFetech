# Testes e evidências — FET-ORDER-005

Implementação iniciada em 16/10/2026; retomada em 17/10/2026 após interrupção da
sessão. Branch main, HEAD inicial/final `0285bc6c9201d630b046afecece6879468b12c5a`.
Worktree inicialmente limpo; SEO já commitada. Cancelamento permanece sem commit.

## Comandos e resultados

| Comando factual | Resultado |
|---|---|
| `node tests/runWithReplicaSet.js --test tests/orderCancellation.test.js` — probe anterior | 1/1, rota ausente 404 e reserva mantida; teste substituído pela regressão pós-fix |
| `node tests/runWithReplicaSet.js --test tests/orderCancellation.test.js tests/orderCancellationConcurrency.test.js tests/orderLifecycleAudit.test.js tests/emailTemplates.test.js` | 77/77 aprovados, zero skips |
| `npm.cmd run test:e2e --prefix ecommerce -- orderCancellation.spec.js` | 6/6 aprovados, zero skips |
| `npm.cmd test --prefix ecommerce` — execução isolada anterior | 1.879 aprovados + 15 F024; antes do último caso de conta desativada |
| API no Commercial Gate | 1.880 aprovados + 15 F024 na execução integral final |
| Arquitetura no Commercial Gate | 155/155 na execução integral final |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado no gate final |
| `npm.cmd run ci:bundle-budget --prefix ecommerce/frontend` | Aprovado sem aumentar limites |
| `npm.cmd run audit:seo --prefix ecommerce/frontend` | Aprovado no gate final; bloqueios produtivos F023 mantidos |
| `npm.cmd run test:e2e --prefix ecommerce` via gate | 96/96 aprovados em 6,4 min; zero skips/retries/falhas |
| `npm.cmd run ci:commercial --prefix ecommerce` | APROVADO, todos os estágios, exit code 0 |
| `git diff --check` | Aprovado na revisão final |
| `npm.cmd audit --prefix ecommerce` / frontend, via gate com `--audit-level=high` | Zero vulnerabilidades nos dois pacotes |

Comandos `node tests/...` executados a partir de `ecommerce/`. Demais paths são
relativos à raiz. O Commercial Gate executa de fato API, build, bundle, SEO,
E2E e audits; não significa apenas leitura dos logs antigos.

## Cobertura focada e probes

41 testes de cancellation + 8 de concurrency + 1 de lifecycle audit + 27 de
templates F040 = 77 aprovados. Regressões restantes são exercitadas pelo gate.

| Probe | Resultado medido em banco temporário |
|---|---|
| Pré-fix | Novo Order válido RESERVED; POST cancel 404; Stock continuou reservado |
| Cancel | Stock disponível 4, qty 2 reservada → Stock 6, Cancelled/RELEASED, cancelledAt servidor, um RELEASE e um ORDER_CANCELLED |
| Replay | Snapshot completo idêntico; Stock 6, movement/event/audit não crescem |
| Criação F005 em replay | Mesmo ID e estado Cancelled, sem nova reserva |
| Duas requests admin | Um release, um event e um audit |
| Duas APIs/processos | Mesma garantia via conexões independentes no mesmo replica set temporário |
| Retry Mongo | TransientTransactionError após escrita do audit/outbox; tentativa abortada e repetida com apenas um conjunto final de artefatos |
| Release vs reserve | Stock 0 com reserva A; após cancel e reserva B, Stock 0 e apenas B reservado; sem saldo negativo/duplicado |
| Release vs ajuste F037 | Stock final 10 ou 12 conforme serialização; deltas coerentes em cada movement |
| Release vs archive | Cancelled/RELEASED e administrativeArchivedAt sobrevivem |
| Mudança concorrente payment/shipping | Snapshot revalidado após conflito; 409, nenhum release/event/audit |
| PAID/paidAt | 409 ORDER_REFUND_REQUIRED, snapshot sem writes |
| Shipped/Delivered/timestamps | 409 ORDER_RETURN_REQUIRED, nenhum release |
| Legado payment/inventory | Fail closed; sem inferir reserva ou pagamento |
| Missing product/ledger/quantity/overflow | 409 ORDER_INVENTORY_UNVERIFIED; nenhuma mudança parcial |
| Três produtos/falha no terceiro | Tudo ou nada; snapshots monetário/produto preservados |
| Falha movement/outbox/audit | Rollback de Order, Stock e todos os artefatos |
| Destinatário anonimizado | Admin cancela; worker SUPPRESSED e zero chamadas de provider |
| Conta desativada | Cliente recebe 401; admin pode cancelar reserva elegível |
| Evento normal | Fake recebe uma mensagem de cancelamento; text/HTML sem promessa financeira |
| Audit | Inconsistências detectadas, snapshot idêntico e somente find disponível no teste read-only |

## Navegador e acessibilidade

Seis casos permanentes cobrem: cliente em lista/detalhe e reload; admin em
Dashboard/detalhe com archive separado; PAID; Shipped; conflito após elegibilidade
antiga; e GET paginado atrasado sem reverter Cancelado.
Dialog tem nome/descrição, foco inicial, trap, Escape/retorno de foco, anúncio
de erro e pending. Dois cliques programados antes da resposta geram uma única
request; durante envio botão fica disabled. Banco da fixture comprova release e
outbox únicos. Axe sem supressões cobre diálogo cliente/admin, sucesso e erro.
Sem nova chave de storage. Paginação e IDs são fixtures, nunca banco comercial.

## Ajustes na validação

O primeiro teste de corrida mockou findOneAndUpdate como Promise, quebrando a
cadeia select/lean. Corrigido o hook de teste para Query.exec; nenhuma mudança
na produção foi necessária. O primeiro E2E stale usou rótulo de paginação em
inglês; corrigido para o rótulo pt-BR já usado pelo projeto. Reexecução focada
6/6. Sem retries, skips, timeout maior ou relaxamento de asserções comerciais.

A rodada integral de 16/10 passou architecture/API/build/budget/SEO, mas foi
interrompida durante E2E após 51 casos aprovados; não é registrada como gate
concluído. Retomada de 17/10 executa novamente o Commercial Gate inteiro.

No primeiro reinício, o teste existente `CI DB_NAME fetech aborta antes de
conexão/mutação` excedeu o limite de 10 segundos de spawnSync (status null).
Reexecução isolada do mesmo teste: 1/1 aprovado, subprocesso em 4,3 segundos.
Nenhum timeout, skip ou asserção foi alterado; não se concluiu causa raiz apenas
com esse resultado. Uma nova execução integral do gate foi iniciada.

Essa rodada encontrou interferência entre fixtures: os novos E2E reutilizavam a
conta `user`, deixando sete pedidos adicionais no histórico que uma regressão
existente espera conter somente um pedido. Diagnóstico: esperado 1, recebido 8.
Os cenários de cancelamento passaram a usar conta exclusiva de fixture no host
isolado (`cancellation`); a asserção existente permanece intacta. Sem alteração
na aplicação ou cleanup de pedidos comerciais para contornar o resultado.
Resultado da rodada com interferência: 95/96, sem mascarar a falha. Reexecução
integral após isolar a conta: architecture 155/155, API 1.880 + 15 F024,
E2E 96/96 (incluindo a regressão que falhou), build/SEO/budget/audits aprovados.
Log local da execução final: `.local/cancel-commercial-validado.log` (não versionado).
Nenhum teste existente foi enfraquecido; nenhum skip/retry foi adicionado.

## Bundle F038

Medição do gate da implementação, sem alterar budgets:

| Métrica | Medido | Limite |
|---|---:|---:|
| Initial JS raw | 653476 | 680814 |
| Initial JS gzip | 216129 | 218809 |
| Entry JS gzip | 95591 | 98482 |
| Initial CSS raw/gzip | 1706 / 830 | 1792 / 872 |
| Maior lazy/rota gzip | 11270 | 11823 |
| Dashboard gzip | 5806 | 6009 |
| Chunks iniciais | 11 | 13 |
| JS chunks totais | 43 | 48 |
| Hero raw | 88358 | 100000 |

Sem dependências novas, eager import de admin ou aumento de limites. Warning
preexistente do import estático/dinâmico de store não impede build.

## Preservação operacional

Todos os testes usam runner F039 e replica set temporário, portas dinâmicas,
providers falsos e guardas de URI. Banco `fetech` não usado/alterado. SMTP,
Cloudinary, gateway e transportadora reais não chamados. Nenhum índice comercial
aplicado, Database Tools baixada, audit fix, push ou config.env alterado.
Somente os 15 skips F024 mongodump/mongorestore são autorizados; nenhum skip F028/E2E.

Auditoria histórica preservada. SHA-256 antes e depois do gerador:
`09E1191860580C7614058016B5731B8254A1B5098FF4DCED665644C6AAA7B8D4`.
F028 permanece PARCIAL: refund F001, return/logística F027/política, auto-expiry
POLICY_UNDEFINED. F023/F024/F026/F029, SEO F032 produtivo e F039 remoto seguem
pendentes; baselines técnicos e findings corrigidos anteriores preservados.
