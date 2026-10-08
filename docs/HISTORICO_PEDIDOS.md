# Histórico comercial e arquivamento administrativo

FET-OPS-002: archive/unarchive efetivos agora geram `ORDER_ARCHIVED`/`ORDER_UNARCHIVED` na mesma transaction da mutação. Metadata somente archived; ator admin e Request ID internos. Repetição é no-op sem evento fictício. Falha do insert de audit aborta archive/unarchive; Orders continuam sem exclusão física. [Observabilidade](OBSERVABILIDADE.md).

Recuperação FET-OPS-001: archive BSON deve preservar pedidos ativos/arquivados, metadata administrativa, centavos, entrega, PAID/paidAt, ledger e idempotência sem excluir históricos. Verificação de conteúdo não confirma pagamento nem corrige legados. F011 permanece corrigido; F024 parcial, drill real bloqueado. [Procedimento de backup e recuperação](BACKUP_RESTORE.md).

FET-ORDER-003 / F011 / FET-P0-009, 08/10/2026.

Pedidos comerciais permanecem no banco. Arquivar apenas organiza a visão administrativa; não cancela, devolve estoque, confirma pagamento, estorna ou altera a entrega. Um pedido Pending com reserva continua consumindo estoque.

| Método e rota `/api/v1` | Contrato |
| --- | --- |
| DELETE `/admin/order/:id` | Admin autenticado: 405, `Allow: PATCH`, mensagem segura. Não consulta nem modifica o pedido. |
| PATCH `/admin/order/:id/archive` | 200 com pedido e metadata administrativa; grava data e ID do administrador no servidor. Repetição preserva o primeiro par. |
| PATCH `/admin/order/:id/unarchive` | 200; remove o arquivamento colocando ambos os campos em null. Repetição não altera o pedido. |
| GET `/admin/orders?archived=active` | Padrão: pedidos ativos, incluindo documentos legados sem metadata. |
| GET `/admin/orders?archived=archived` | Apenas arquivados. |
| GET `/admin/orders?archived=all` | Todos os pedidos. |
| GET `/orders/me`, GET `/order/:id` | Histórico completo do cliente, inclusive arquivados; sem metadata administrativa. |

PATCH requer administrador, sessão válida e proteção CSRF existente. Corpo não define data, ator ou campos comerciais. ID inválido: 400; pedido inexistente no PATCH: 404. DELETE com ID válido inexistente: 405. Sessão ausente: 401; cliente comum ou CSRF/Origin inválidos: 403. Filtros desconhecidos, vazios, repetidos, arrays e objetos são rejeitados com 400. Respostas privadas preservam `Cache-Control: no-store`.

`administrativeArchivedAt` (Date|null) e `administrativeArchivedBy` (ObjectId<User>|null) formam um par. Ambos ausentes/null significam ativo. A operação condicional atômica grava somente esses campos, sem `save()` comercial, migração, TTL ou release. O ID do ator não é populado; sua remoção não elimina o pedido ou sua referência histórica. Admin recebe metadata na lista, detalhe e ações. Clientes não recebem os campos, inclusive em criação/replay; hashes de idempotência continuam privados.

`totalAmountCents` e `totalAmount` da lista administrativa somam somente os pedidos retornados pelo filtro. A contagem no painel também corresponde ao filtro. O badge “Arquivado” é independente do status comercial. Archive permanece independente do status/payment. FET-ORDER-004 corrigiu F002: avanços comerciais exigem pagamento PAID e paidAt válido; arquivar PENDING não autoriza envio. Consulte [Estados do pedido e pagamento](ESTADOS_PEDIDO_PAGAMENTO.md).

O mesmo ID, snapshot de entrega, valores em centavos, pagamento, reserva, StockMovement e claim de idempotência são preservados. Replay com a mesma key e intenção retorna o mesmo pedido arquivado ou desarquivado, sem nova reserva.

## Barreira contra exclusão física

O modelo Order bloqueia `deleteOne`, `deleteMany`, `findOneAndDelete`, `findByIdAndDelete`, `document.deleteOne` e operações delete no `bulkWrite`. Chamadas equivalentes em `Order.collection` também são protegidas, inclusive bulkWrite com `skipMiddleware`. Erro interno reconhecível: `ORDER_PHYSICAL_DELETE_FORBIDDEN`. Não há flag pública para liberar exclusão. `findOneAndRemove` não existe no Mongoose 9.11.0 instalado.

Os hooks de query/documento seguem a [documentação oficial do Mongoose](https://mongoosejs.com/docs/middleware.html). A collection normalmente [contorna os middlewares do modelo](https://mongoosejs.com/docs/api/model.html); por isso há barreiras adicionais nas operações de exclusão da collection do Order. O acesso nativo privilegiado ao MongoDB permanece fora dessa fronteira: isto não torna o banco imutável. Manutenção futura de retenção legal exige procedimento separado, autorização e auditoria (F030). Fixtures usam o driver nativo exclusivamente nos bancos temporários isolados; `dropDatabase` de teardown não é bloqueado.

## Auditoria somente leitura

Execute `npm.cmd run audit:orders --prefix ecommerce` com `DB_URI` configurada para o banco autorizado. Perfil `orders-audit`: valida NODE_ENV e DB_URI; dispensa SMTP/JWT/HTTP. Não aceita argumentos, incluindo `--apply`; não cria collections/índices, não usa models e não escreve documentos. A execução desta tarefa auditou somente fixtures isoladas, nunca o banco real.

Saída JSON: resumo `mode: READ_ONLY`, contagens active/archived e issues com categoria e ID. Categorias: `INVALID_ARCHIVE_METADATA`, `COMPLETED_WITHOUT_ORDER`, `ORPHAN_MOVEMENT`, `MISSING_RESERVE` por produto de pedido RESERVED. Arquivados válidos são classificados normalmente. Não imprime endereço, telefone, usuário, pagamento, cookie, JWT ou hash. Não reconstrói pedidos perdidos. O script pode percorrer coleções inteiras; paginação e escala permanecem F022. Não equivale a audit trail completo F025.

## Validação

```powershell
node ecommerce/tests/runWithReplicaSet.js --test tests/orderHistory.test.js tests/orderHistoryAudit.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
git -c core.safecrlf=false diff --check
```

O runner usa mongod real em replica set temporário, porta dinâmica e bancos de teste, preservando o MongoDB local existente. Pedidos apagados antes da correção não são recuperados. Pagamento real, backup/restore, audit trail, frete, refund/release e retenção legal permanecem em suas tarefas próprias. Próxima recomendação atual: F001; não iniciada aqui.
