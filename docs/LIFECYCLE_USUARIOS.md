# Lifecycle seguro de usuários — FET-DATA-003 / F016

## Listagem paginada — F022

GET admin/users default 25/max 100, createdAt/_id estável, status active/deactivated/all preserva legado sem accountStatus. Projeção inclui metadata admin e exclui password/reset/tokenVersion/avatarRevision/fence. Metadata.pagination informa total; filtro reseta página 1 no painel. Lifecycle F016 e revogação de sessões preservados. [Contrato](PAGINACAO_E_PERFORMANCE_API.md).


Contrato em 08/10/2026. Contas são desativadas e reativadas; a identidade histórica permanece no MongoDB. Não há exclusão física nem cascata no runtime comercial.

## Estado e campos controlados pelo servidor

| Campo | Conta ativa | Conta desativada |
| --- | --- | --- |
| `accountStatus` | `ACTIVE` (default) | `DEACTIVATED` |
| `deactivatedAt` | null | Data válida definida pelo servidor |
| `deactivatedBy` | null | ObjectId do administrador executor |
| `tokenVersion` | Mantido na reativação | Incrementado uma vez na transição inicial |

Campo `accountStatus` ausente em documentos legados significa ACTIVE; não exige migration. Null ou valor desconhecido não permite autenticação, login ou recuperação. A auditoria identifica estados inválidos, sem corrigi-los. Registro, perfil e edição administrativa comum ignoram campos de lifecycle fornecidos pelo cliente. O model valida metadata de documentos; as transições HTTP usam serviço específico.

## API administrativa

Prefixo `/api/v1`. Todas as rotas exigem sessão de administrador ativo; mutações exigem CSRF/Origin conforme F020. Retornam `Cache-Control: no-store`, `X-Request-Id` do servidor e nenhum JWT/cookie novo.

| Método e rota | Comportamento |
| --- | --- |
| DELETE `/admin/user/:id` | 405, `Allow: PATCH`, “Usuários não podem ser excluídos fisicamente.” Não desativa |
| PATCH `/admin/user/:id/deactivate` | 200 com DTO administrativo; desativa, revoga sessões e limpa recuperação |
| PATCH `/admin/user/:id/reactivate` | 200 com DTO administrativo; ativa e limpa metadata, sem restaurar sessões |
| GET `/admin/users?status=active` | Ativos e legados; padrão se omitido |
| GET `/admin/users?status=deactivated` | Desativados |
| GET `/admin/users?status=all` | Todos; estados desconhecidos continuam bloqueados na autenticação |
| GET `/admin/user/:id` | Detalhe administrativo também de contas desativadas |

Filtro inválido, vazio, array, objeto ou repetido retorna 400. ID malformado retorna 400; alvo inexistente nas rotas de lifecycle retorna 404. DELETE com ID válido não consulta o alvo e sempre retorna 405 após autorização. Visitante 401, cliente 403, CSRF inválido 403. Conta já no estado solicitado retorna 200 sem incrementar versão, alterar metadata original ou duplicar evento.

Auto-desativação e autorrebaixamento administrativos retornam 403. A redução do último administrador ACTIVE é proibida (409 na verificação da invariante; ação sobre a própria conta continua 403). Admins desativados não contam como operacionais. Lock/fencing compartilhado F010 recarrega executor/alvo/contagem e serializa desativação, reativação, edição de perfil/role e bootstrap. Escritas de lifecycle atrasadas exigem geração, role, status e versão esperados. Conflito retorna 409, sem reduzir geração ou versão.

Bootstrap conserva confirmação exata da database, senha oculta e ausência de defaults/argumentos de senha. Com zero admins ACTIVE, pode criar uma nova conta; não reativa/promove silenciosamente contas existentes. E-mail de conta desativada permanece reservado pelo índice único.

## Sessões e recuperação

Desativação incrementa `tokenVersion` e remove `resetPasswordToken`/`resetPasswordExpire` na mesma escrita transacional. Middleware consulta o status e a versão persistidos: JWT antigo e JWT fabricado com versão atual de conta desativada retornam 401. Login retorna o mesmo erro genérico de credenciais inválidas e contabiliza falhas no limiter F008, sem emitir sessão.

Forgot para conta desativada retorna a resposta uniforme 200, preserva o piso temporal F009 e não gera token nem envia email. Reset não reativa nem emite sessão para conta desativada, inclusive com token histórico injetado em fixture. Saves de recuperação/senha usam condição de status/versão para impedir escritas iniciadas antes da desativação; login revalida status/versão após comparar senha. Uma requisição já autorizada antes da desativação pode estar em andamento; não há cancelamento global de trabalho iniciado. Qualquer cookie emitido com geração antiga permanece inutilizável.

Reativação aceita novamente a **senha atual** após novo login. Não restaura JWT anterior, não redefine senha automaticamente e não autentica por si só. Uma resposta 401 da API no navegador limpa a autenticação Redux; rotas protegidas encaminham ao login, sem polling ou revelar publicamente que a conta foi desativada. Erros das rotas de autenticação/recuperação e respostas do limiter também recebem no-store.

## Preservação referencial

| Relação encontrada | Política |
| --- | --- |
| Address.user | Obrigatória; endereço mantido |
| Order.user | Obrigatória; pedido, snapshot F012, centavos F014 e pagamento F002 mantidos |
| OrderIdempotency.user | Obrigatória; claim/replay F005 mantido |
| Product.reviews[].user | Obrigatória; review, texto, rating e agregados mantidos |
| Product.user | Referência mantida; ausência histórica opcional pelo schema atual (`require`, não `required`) |
| AdminAuditEvent.actorUserId | Ator histórico mantido, inclusive depois de desativado |
| Order.administrativeArchivedBy | Opcional quando não arquivado; ator de arquivo histórico mantido |
| User.deactivatedBy | Opcional em ACTIVE; obrigatório em nova desativação |
| AdminMutationLock.bootstrapUserId | ID reservado para futura inserção; ausência de User não é órfão |
| AdminAuditEvent.targetId com targetType USER | Identificador histórico polimórfico; eventos antigos USER_DELETED podem apontar para alvo removido, sem serem reescritos |

StockMovement referencia Order/Product, não User. AuthRateLimit usa identidade derivada, não foreign key de User. Category referencia Category. IDs em JWT, contexto ALS e logs não são relacionamentos persistentes obrigatórios. Não houve nova FK artificial nem populate público de ator administrativo.

Desativação/reativação não altera Address, Order, OrderIdempotency, Product, reviews, Stock, ledger, arquivo, snapshot, pagamento ou eventos antigos. Avatar/Cloudinary, email, nome e hash de senha são preservados. Serializer público omite deactivatedBy/deactivatedAt/fence e secrets; DTO administrativo inclui somente metadata técnica do lifecycle, sem hash/reset token.

## Guardas do model

`findOneAndDelete`, `findByIdAndDelete`, `deleteOne`, `deleteMany`, `document.deleteOne`, APIs legadas quando disponíveis, substituições de documento, bulk deletes/replaces e aggregate com saída são bloqueados com `USER_PHYSICAL_DELETE_FORBIDDEN`. Collection do model também bloqueia deletes/replaces e bulk destructive mesmo com middleware desabilitado. Não existe flag/env de bypass produtivo.

Essas guardas não substituem permissões MongoDB: driver cru, shell e restore com credenciais de escrita permanecem capazes de alterar dados. Runtime HTTP não usa esses caminhos. Limpeza de fixture é restrita à database temporária identificada pelo runner e PID; teardown usa dropDatabase apenas na database pertencente ao teste.

## Auditoria F025

`USER_DEACTIVATED` e `USER_REACTIVATED`, targetType USER, actor autenticado e targetId. Metadata permitida: `fromStatus`/`toStatus`. Estado e evento são gravados na mesma transação snapshot/majority; falha de audit reverte transição/versão/reset. No-op não gera sucesso duplicado. Request ID correlaciona resposta, log estruturado e evento. Não registra nome/email/endereço/telefone, senha, JWT ou token de recuperação. `USER_DELETED` permanece aceito para leitura de registros históricos, sem produtor no fluxo atual.

## Auditoria referencial somente leitura

```powershell
npm.cmd run audit:users --prefix ecommerce
```

O operador deve conferir previamente a database configurada. **Esse comando não foi executado contra o banco comercial nesta task.** Perfil `users-audit` valida NODE_ENV/DB_URI centralmente, sem exigir secrets HTTP/SMTP/Cloudinary. Não aceita flags; autoCreate/autoIndex são false. Usa projeções/cursors técnicos, consulta existência de User e não imprime URI, nome, email, endereço, telefone ou texto de review.

Saída JSON: resumo READ_ONLY com contagens; inconsistências com categoria, relação, ObjectId do documento, missingTargetType User e missingUserId quando válido. Referência inválida não imprime o valor fornecido. Metadata/status inconsistentes também são identificados. Campos opcionais ausentes e ID reservado de bootstrap não são marcados automaticamente como órfãos. Custo cresce com o número de referências; avaliação produtiva de performance permanece F022.

Não recria usuários, apaga dependentes, altera referências ou aplica migration. Órfãos preexistentes exigem decisão posterior e backup/restore validado antes de qualquer reparo. F024 segue **PARCIAL / AGUARDANDO MONGODUMP + MONGORESTORE**; ferramentas não foram baixadas e não houve drill real.

## Limites e continuidade

Desativação **não é anonimização nem apagamento de PII**. F030 permanece aberto para retenção, erasure e privacy. Mídia/avatar continuam F018/F019. Pagamento F001 e frete F027 permanecem adiados; próxima recomendação F015 (consistência concorrente de reviews), sem início automático. Evidências: [relatório final](RELATORIO_FET_DATA_003.md) e [testes individuais](TESTES_FET_DATA_003.md).

## Reviews (FET-DATA-004)

Desativação não apaga reviews e mantém suas referências. DEACTIVATED recebe 401
antes do controller; audit:reviews considera o User existente, sem finding de
referência ausente. Ao reativar e fazer login novo, a review conserva seu ID e
count. [Contrato](REVIEWS_CONCORRENCIA.md).
# Atualização FET-MEDIA-001

F016 permanece corrigido: desativação conserva avatar e referência, que também bloqueia cleanup. Upload revalida estado/tokenVersion dentro da transação de attach; corrida com desativação aborta attach e conserva o avatar anterior. Legados não gerenciados exigem revisão humana e não são apagados automaticamente. Erasure/retention continuam F030. [Ciclo de vida de mídia](AVATAR_E_MIDIA.md).
# Privacidade F030 (09/10/2026)

Desativação F016 mantém PII e permanece reversível. O eixo privacyStatus é
independente: NORMAL, ANONYMIZATION_REQUESTED, ANONYMIZED. Apenas este último
é irreversível; reativação/update administrativo retorna 409 USER_ANONYMIZED.
User legado sem privacyStatus equivale a NORMAL sem migration. Não excluir User
fisicamente. [Contrato de privacidade](PRIVACIDADE_E_RETENCAO.md).

## F040 — notificações de lifecycle

Deactivation/reactivation enfileiram evento na transação da alteração, com
versão para dedupe. Operação idempotente sem mudança não duplica eventos.
DEACTIVATED continua elegível para a própria notificação; ANONYMIZED é suprimido
no envio. JWT antigo não é restaurado. [Contrato](EMAILS_TRANSACIONAIS.md).
