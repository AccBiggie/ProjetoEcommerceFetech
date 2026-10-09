# Paginação e performance da API — FET-PERF-001 / F022

Toda coleção crescente tem paginação no servidor. Referências pequenas têm teto
explícito e falham integralmente quando excedido. Não se pagina uma árvore pela
metade. Contrato central: `backend/utils/pagination.js`.

## Inventário completo

Rotas abaixo recebem o prefixo `/api/v1`. GETs de health retornam estado, não
coleções. Mutações de cadastro, sessão, perfil, avatar, checkout, review e lifecycle
retornam um recurso/resultado. Não existem endpoints HTTP de listagem do ledger,
idempotência, locks ou tarefas de mídia; seus CLIs administrativos não são APIs.

| Método | Rota | Tipo | Fonte / acesso | Paginação / default / max | Sort | Índice / payload |
|---|---|---|---|---|---|---|
| GET | `/products` | PAGINATED_COLLECTION | Product / público | page=1, limit=12, max=100 | newest/oldest; createdAt, _id | products_recent, category compounds / card |
| GET | `/admin/products` | PAGINATED_COLLECTION | Product / admin | page=1, limit=25, max=100 | newest/oldest; createdAt, _id | mesmos / resumo; edição busca detalhe |
| GET | `/orders/me` | PAGINATED_COLLECTION | Order / sessão, proprietário | page=1, limit=25, max=100 | newest/oldest; createdAt, _id | orders_customer_recent / resumo |
| GET | `/admin/orders` | PAGINATED_COLLECTION | Order / admin | page=1, limit=25, max=100 | newest/oldest; createdAt, _id | orders_recent, orders_archive_recent / resumo |
| GET | `/admin/users` | PAGINATED_COLLECTION | User / admin | page=1, limit=25, max=100 | newest/oldest; createdAt, _id | users_recent, users_status_recent / DTO admin |
| GET | `/admin/audit-events` | PAGINATED_COLLECTION | AdminAuditEvent / admin | page=1, limit=25, max=100 | createdAt DESC, _id DESC | índices F025 + audit_request_recent / DTO F025 |
| GET | `/reviews` | PAGINATED_COLLECTION | reviews embutidas / público | page=1, limit=25, max=100 | posição estável no array F015 | Product _id; aggregate slice / reviews da página |
| GET | `/categories` | BOUNDED_REFERENCE_SET | Category / público | árvore inteira, teto=1000 | createdAt ASC, _id ASC | categories_tree, categories_parent_tree / _id,name,parent_id,createdAt |
| GET | `/admin/categories` | BOUNDED_REFERENCE_SET | Category / admin | mesmo teto=1000 | mesmo | mesmo |
| GET | `/addresses` | BOUNDED_REFERENCE_SET | Address / proprietário | conjunto inteiro, teto=100 | favorite DESC, createdAt DESC, _id DESC | addresses_customer_favorite / endereço sem __v |
| GET | `/product/:id` | SINGLE_RESOURCE | Product / público | um recurso | _id | detalhe completo, incluindo reviews F015 |
| GET | `/order/:id` | SINGLE_RESOURCE | Order / proprietário ou admin | um recurso | _id | snapshot completo; DTO F011/F016 |
| GET | `/me` | SINGLE_RESOURCE | User / sessão | um recurso | _id | perfil |
| GET | `/admin/user/:id` | SINGLE_RESOURCE | User / admin | um recurso | _id | DTO admin F016 |
| GET | `/category/:id`, `/admin/category/:id` | SINGLE_RESOURCE | Category / público ou admin | um recurso | _id | detalhe |
| GET | `/address/:id` | SINGLE_RESOURCE | Address / proprietário | um recurso | _id | detalhe |

## Contrato

`page` e `limit` aceitam somente strings de inteiros ASCII positivos, seguros,
sem zeros à esquerda. Máximo `limit=100`; `skip=(page-1)*limit <= 100000`.
Não há clamp silencioso. Tipos inesperados, arrays/objetos, duplicatas, operadores,
parâmetros desconhecidos e sort não permitido retornam 400. Offset excessivo:
`PAGINATION_RANGE_TOO_LARGE`; valores de paginação inválidos: `INVALID_PAGINATION`.
Limites são validados antes da consulta de coleção (rotas privadas ainda autenticam).
Página além do total retorna 200 com array vazio. Nenhuma persistência nova em storage.

```json
{"success":true,"products":[],"pagination":{"page":1,"limit":12,"total":0,"pages":0,"hasNext":false,"hasPrevious":false}}
```

Cada rota preserva seu nome de coleção (`products`, `orders`, `users`, `events`,
`reviews`). Catálogo preserva `productsCount` global, `filteredProductsCount`
filtrado e `resultPerPage`, agora igual ao limite efetivo. Admin orders preserva
`totalAmountCents` e `totalAmount` **de todo o conjunto filtrado**, calculados em
aggregate; não soma somente a página. Conversão legada usa dígitos/long e rejeita
total inválido, negativo, fracionário ou fora do inteiro seguro. Valores monetários
da página continuam em centavos com apresentação decimal F014 explícita em lean.

Referências consultam `teto+1`; overflow retorna 503
`REFERENCE_SET_TOO_LARGE`, sem árvore/endereço parcialmente truncado.
O filtro de descendentes do catálogo usa a mesma árvore limitada.

## Filtros, segurança e estabilidade

- Produtos: keyword, category (ID ou nome com fallback legado), price[gt/gte/lt/lte],
  ratings[gt/gte/lt/lte]. Preço mantém precisão F014 e fallback legado estrito;
  ratings aceita decimal finito entre 0 e 5. Category não vazia, até 120 caracteres.
- Keyword: string, trim, máximo 100 caracteres. Busca **substring literal sem
  distinção de caixa**, regex escapada. Cliente não escolhe flags, `$regex`, `$where`
  ou operadores Mongo. Não há mudança para busca por tokens/text/Atlas.
- Users: status=active (padrão), deactivated, all. ACTIVE inclui somente o legado
  sem accountStatus; estados desconhecidos continuam excluídos do filtro active.
- Admin orders: archived=active (padrão), archived, all; status opcional
  Processing/Shipped/Delivered. Clientes: somente status e pedidos do próprio user.
  Arquivamento administrativo nunca oculta o histórico do cliente.
- Audit: preserva action, targetType, targetId, actorUserId, requestId, from/to;
  IDs/enums/UUID/ISO seguem a validação F025. Novo parser central para page/limit.
- Reviews: productId ou alias legado id, nunca ambos; ID estrito.
- Categories: somente parent_id (ObjectId ou literal null). Addresses: sem filtros
  do cliente; user sempre vem da sessão.
- Sort allowlist: newest (padrão), oldest para Products/Orders/Users. `_id` acompanha
  a direção de createdAt como desempate final. Audit/reference têm sort fixo.
  Reviews preservam posição do array F015; updates preservam ID e posição, append
  ocorre ao final. Não há sort Mongo recebido diretamente do cliente.

## Payload e número de consultas

Products: campos do card/tabela, valores monetários, agregados de reviews e uma
imagem (`$slice:1`); sem description, reviews, user, ledger/version internos.
Editar consulta `/product/:id`, evitando escrever descrição ausente no resumo.
Orders: ID, user, status, pagamento público normalizado, timestamps, total;
sem shippingInfo, orderItems, provider ID, hashes de idempotência. Detalhe mantém
snapshot completo e segurança. Users: projeção allowlist sem password, reset,
tokenVersion, avatarRevision ou fence; preserva metadata administrativa F016.
Audit: projeção e metadata allowlist existentes. Reviews: `$slice` no Mongo.

Lista e count com o **mesmo filtro**, em paralelo. Sem populate por item nem loop
de queries. Consultas da API para 5 e 50 itens permanecem constantes: catálogo 3
(+1 quando resolve category), admin products/users e customer orders 3 incluindo
auth, admin orders 4 incluindo auth/count/aggregate, audit 3 incluindo auth.
Categorias/endereço: uma query limitada (+auth quando privado). Reviews: uma
aggregate. Totais exatos e totalAmount custam o conjunto filtrado, mesmo quando
a leitura da página é barata; não se promete custo total O(limit).

## Índices e operações

Manifesto explícito em `backend/utils/queryIndexes.js`, compartilhado por schemas
e tooling nativo. Compostos suportam sort reverso para oldest. Prefixos simples
category_id, parent_id, requestId e user/favorite/createdAt foram substituídos nas
declarações por compostos. Índices existentes no banco não são removidos;
auditoria lista extras como UNMANAGED_PRESERVED. Revisar redundância manualmente,
após restore F024 validado, sem drop automático.

Orders user compound é distinto do unique user/idempotencyKeyHash. Address
favorite unique parcial permanece; StockMovement reserva unique parcial e product
permanecem. Idempotency conserva unique user/operation/keyHash. Auditoria preserva
índices F025 e acrescenta requestId/createdAt/_id. Manifesto inclui invariantes
existentes de dinheiro/idempotência/usuário/categoria/mídia e TTL de rate limit.
Locks/hierarchy singleton usam somente _id; nenhum índice extra necessário.

Servidor conecta com `autoIndex:false, autoCreate:false`; startup não é mecanismo
de deployment de índices. Provisionar os índices explicitamente antes de liberar
um ambiente novo. Startup verifica índices únicos somente por metadata e recusa
integridade ausente/divergente antes de abrir HTTP; índice amplo antigo F037 ainda
protege reservas e mantém seu gate separado para ajustes. Índices de performance
ausentes são pendências de rollout, sem criação implícita. Scripts não importam
models, nem chamam syncIndexes.

```powershell
npm.cmd run audit:indexes --prefix ecommerce
npm.cmd run migrate:indexes --prefix ecommerce
npm.cmd run migrate:indexes --prefix ecommerce -- --dry-run
npm.cmd run migrate:indexes --prefix ecommerce -- --apply --confirm-db NOME_EXATO
```

DB_URI vem da configuração central; não imprimir URI/credenciais/documentos.
Audit exige somente NODE_ENV/DB_URI, proíbe flags de mutation e lista apenas
collection/name/keys/status. Migration é dry-run por padrão, confirma banco antes
de conectar, adiciona ausentes, aceita equivalentes, aborta divergências de nome,
ordem das keys ou options. Segunda aplicação é no-op. Nunca troca unique/partial/
TTL/collation/hidden silenciosamente. Não executado no banco comercial.

### PENDING PRODUCTION INDEX OPERATIONS

1. Validar backup/restore F024 (continua parcial, Database Tools ausentes).
2. Auditar manifesto no ambiente de deployment, revisar índices divergentes e
   extras, aplicar aditivos com confirmação literal e autorização operacional.
3. **F037:** `one_order_product_reserve` unique `(order,product,type)` com
   partial `{type:'RESERVE'}` deve existir **antes** do drop explícito do antigo
   `one_order_product_movement`. O manifesto apenas reporta
   PENDING_F037_EXPLICIT_DROP, não realiza o drop.
4. Procedimento separado existente: `npm.cmd run upgrade:stock-index --prefix
   ecommerce -- --confirm-database NOME_EXATO`, conforme COERENCIA_PRODUTOS.md.
   Não executado no fetech; estado do índice real não foi verificado nesta task.
5. Conferir índices/explain no rollout aprovado; nenhum syncIndexes produtivo.

## Frontend e limites residuais

Catálogo preserva page na URL e reset por filtro. A action cancela a solicitação
anterior e confere identidade antes de dispatch. Dashboard pede páginas de 25,
tem controles para produtos/users/orders, conta com metadata.total e reseta page
em lifecycle/archive. AbortController e sequência descartam resposta obsoleta;
ações recarregam a página atual. Histórico pede página de 25, cancela cleanup e
protege resultado/finally. Audit conserva proteção de resposta antiga e controles.
Não baixa todas as páginas para paginar localmente, sem dependência nova/cache novo.

Explain em fixtures temporárias: listagens principais IXSCAN, sem SORT em memória,
25 retornados / 25 keys / 25 docs. Offset 1000: 1025 keys / 25 docs. Busca substring
sem resultado: 2000 keys / 2000 docs mesmo usando índice de sort. Regex escapada
evita regex arbitrária, **não torna substring indexável**. Filtro monetário legado
por $expr e combinações com status/ranges podem examinar mais documentos; não se
adicionaram índices isolados sem comprovar benefício. Pesquisa/cursor/contagens
especializadas e tuning em escala pertencem ao residual F038; este limite não é
ocultado por afirmação de ausência de COLLSCAN literal no plano.

Não há timeout global novo, busca textual/tokenização ou mudança em pagamento,
frete, estoque, idempotência, hierarquia ou writes comerciais. Banco fetech,
config.env, auditoria histórica e índice F037 reais preservados.

## CI F039 e rollout

A suite integral valida contratos, indices e explain somente nas databases
temporarias do replica set de teste. Nenhum indice F022 foi aplicado ao fetech.
Rollout comercial e restore validado F024 continuam pendentes.
[Gate comercial](CI_E_GATES_COMERCIAIS.md).
