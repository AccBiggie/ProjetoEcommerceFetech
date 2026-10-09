# Relatório FET-DATA-004 — F015

## Resultado e Git

Resultado: **CONCLUÍDO — F015 CORRIGIDO NO CÓDIGO** (validação final descrita abaixo).
Branch: `main`. HEAD inicial e final:
`e2f74b326182b5fd1f75834d9bb58c4d209aee66`.
Worktree inicial limpo; F016 já commitada (`feat: implementa ciclo de vida seguro
de usuários`). Nenhuma alteração anterior pendente para preservar. Worktree
final contém esta tarefa, **sem commit**; nenhum reset/clean ou push.

Baseline anterior: focused F016 96 aprovados; API 918 aprovados e 15 skips F024;
E2E 32/32, build e diff check aprovados.

## Finding reproduzido antes da correção

Banco temporário; duas sessões reais enviaram simultaneamente PUT `/api/v1/review`
com notas 1 e 5. Barrier exclusivamente no harness interceptou `Product.save`
depois da leitura até ambas chegarem. Sem hook/delay permanente no produto.
Ambas retornaram 200; duas chegadas na barrier.

| Medida | Esperado | Persistido antes |
| --- | ---: | ---: |
| Reviews | 2 | 2 |
| numOfReviews | 2 | 1 |
| ratings | 3 | 1 |

A média real do array era 3. Não houve perda de review nessa reprodução:
Mongoose preservou pushes, mas gravou agregados calculados de snapshots antigos.
Causa raiz: read-modify-save com recálculo em memória independente do estado
efetivamente persistido por outra requisição.

## Inventário do domínio

Model: `ecommerce/backend/models/productModel.js`; subdocumento com `_id`,
`user` (ObjectId/User), `name`, `rating`, `comment`; campos derivados `ratings`
e `numOfReviews`. Reviews não possuem timestamps; Product possui `createdAt`,
sem `updatedAt`. Não houve alteração de schema/nomes externos/collection/index.

Controller: `productController.js`. PUT `/api/v1/review` cria ou atualiza;
DELETE `/api/v1/reviews?productId=...&id=...` autor/admin; GET público `/reviews`
aceita `productId` e alias `id`. Create/update administrativo genérico usa
whitelist que já excluía reviews/agregados, mantida e testada. `ApiFeatures`
filtra `ratings`; os agregados continuam consultáveis.

Serializer Product usa apresentação monetária em `money.js`; resposta de mutação
de review usa projeção lean `_id/reviews/ratings/numOfReviews`, evitando defaults
ou validações monetárias alheias depois de uma write concluída. GET de produto
preserva serializer completo. `ProductDetails.jsx` envia Number e refaz GET de
produto após mutação, exibindo valores autoritativos do backend. Layout preservado.

Testes existentes de rotas/adminAudit/security/lifecycle permanecem; helper
multi-process de idempotência foi reutilizado sem alterações.

## Estratégia e atomicidade

Mecanismo: `findOneAndUpdate` com aggregation update pipeline. **Single-document:
SIM. Mutex em memória: NÃO.** Cliente: **transaction multi-doc NÃO**; admin delete:
**SIM**, somente para preservar a transação existente com AuditEvent F025.

Filtro atômico valida histórico. Create/update aplica `$map` à review existente
ou `$concatArrays` à nova; delete usa `$filter` com autorização no filtro. Segundo
estágio deriva contagem e média do array final. `returnDocument: after` retorna
snapshot daquela operação, sem leitura antiga/refetch para construir response.
Uma avaliação por User/Product mesmo entre conexões/processos. Última write
aplicada vence no conteúdo do mesmo usuário; usuários diferentes são preservados.
Update preserva `_id`, posição e metadados extras, sem alterar count indevidamente.

Rating individual: Number real, inteiro 1..5; strings, bool, null, float,
NaN/Infinity rejeitados antes da pipeline. Comentário string obrigatório com trim,
novo limite de 2000 após trim, sem truncar histórico maior. Média double
sum/count, sem arredondamento; vazio: média/count zero. Comparação de integridade:
tolerância absoluta `1e-12`; count derivado de `$size`. Campos ausentes equivalem
ao histórico vazio, explícito null não é ausência.

Mass assignment: autoria e nome vêm de req.user; ID novo do servidor; body `_id`,
user/userId/name/reviews/ratings/numOfReviews não controla review. Create/update
genérico administrativo também ignora reviews/ratings/numOfReviews. IDs são
validados/convertidos explicitamente em ObjectId. `$literal` protege strings/IDs
na pipeline. Outros campos Product e createdAt são preservados.

## Histórico inconsistente e audit

Duplicata de usuário/ID, nota/estrutura inválida ou agregados divergentes:
409 `PRODUCT_REVIEW_DATA_INCONSISTENT`, sem adivinhar quais linhas preservar,
sem remover ou corrigir implicitamente. Leitura posterior serve só para diagnóstico
404/403/409, nunca para determinar a write. Admin delete também não repara histórico.
Referência órfã é identificada pelo audit; runtime não percorre Users históricos
em cada mutação (a autoria nova já foi autenticada).

```powershell
npm.cmd run audit:reviews --prefix ecommerce
```

**READ-ONLY**. Perfil central reviews-audit; autoCreate/autoIndex false; todos
os argumentos proibidos, inclusive apply. Sem startup repair. Categorias:
REVIEW_COUNT_MISMATCH, REVIEW_RATING_MISMATCH, DUPLICATE_REVIEW_USER,
INVALID_REVIEW_RATING, INVALID_REVIEW_USER_REFERENCE, INVALID_REVIEW_STRUCTURE,
DUPLICATE_REVIEW_ID. Saída apenas totais/categorias/ObjectIds; sem comentários,
nomes, email, descrição ou valores inválidos de referências. Auditoria real:
**NÃO**. CLI validada somente na fixture temporária e documentos/indexes preservados.

## Integração F016 e F025

Review de User desativado permanece: **SIM**, referência resolve User existente.
User desativado cria/atualiza review: **NÃO (401)** antes do controller. Reativação
requer login novo e atualiza a mesma review; JWT antigo continua inválido.
Desativado não é órfão no audit.

Request ID e no-store: preservados. Comment nos logs: **NÃO**. Evento seguro
`product.review.data_inconsistent` com requestId/targetId, código exato aceito pelo
middleware/logger. Admin remove com PRODUCT_REVIEW_DELETED; metadata reviewId,
target Product, sem comentário. Falha do audit reverte write/agregados. Cliente
não produz evento administrativo. Auth/ownership/CSRF permanecem obrigatórios.

## Arquivos criados

- `ecommerce/backend/services/productReviewService.js`
- `ecommerce/backend/utils/reviewContract.js`
- `ecommerce/backend/utils/reviewAudit.js`
- `ecommerce/backend/scripts/auditReviews.js`
- `ecommerce/tests/reviewConcurrency.test.js`
- `ecommerce/tests/reviewAudit.test.js`
- `ecommerce/tests/e2e/reviews.spec.js`
- `docs/REVIEWS_CONCORRENCIA.md`
- `docs/RELATORIO_FET_DATA_004.md`
- `docs/TESTES_FET_DATA_004.md`

## Arquivos alterados

- `ecommerce/backend/controllers/productController.js`
- `ecommerce/backend/config/runtimeConfig.js`
- `ecommerce/backend/middleware/erros.js`
- `ecommerce/backend/observability/logger.js`
- `ecommerce/package.json` (script somente)
- `ecommerce/tests/configSecurity.test.js` (allowlist da fronteira de configuração)
- `ecommerce/tests/e2e/server.js` (dois usuários dedicados, evita quota de registro)
- `ROTAS.md`
- `docs/CONFIGURACAO.md`
- `docs/OBSERVABILIDADE.md`
- `docs/LIFECYCLE_USUARIOS.md`
- `docs/ESTADO_ATUAL_PROJETO_FETECH.md`
- `docs/PLANO_MELHORIAS_FETECH.md`

Dependências adicionadas: **NENHUMA**. Lockfiles preservados. npm audit:
**NÃO EXECUTADO**, dispensado pelo anexo sem mudança de dependência/lock;
nenhum audit fix. Alterações fora de escopo: **NENHUMA**.

## Testes adicionados e validação

Lista individual dos **72 concurrency + 29 audit + 1 E2E**:
[TESTES_FET_DATA_004.md](TESTES_FET_DATA_004.md). Testes de ratings/IDs/comments
malformados, autoria, snapshots, identidade/posição, legacy, ownership, CSRF,
F016/F025, duas conexões e dois processos; carga de 100 operações não é benchmark.

Comandos na ordem obrigatória:

1. `node --test ecommerce/tests/reviewConcurrency.test.js`: **72/72**.
2. `node --test ecommerce/tests/reviewAudit.test.js`: **29/29**.
3. `npm.cmd test --prefix ecommerce`: **1019 aprovados, 1034 testes, 0 falhas, 15 skips F024**.
4. `npm.cmd run build --prefix ecommerce/frontend`: **APROVADO**, exit 0.
5. `npm.cmd run test:e2e --prefix ecommerce`: **33/33 APROVADOS**, exit 0.
6. `git diff --check`: **APROVADO**, exit 0 (com `core.safecrlf=false` para evitar avisos de normalização LF/CRLF).

E2E focado adicional: `npm.cmd run test:e2e --prefix ecommerce -- reviews.spec.js`:
**1/1 APROVADO**. Durante desenvolvimento, foram corrigidos seletores de campo
obrigatório e do label em português (`3 Estrelas`), troca de sessão no teste e
limpeza do produto temporário em finally. A última rodada completa passou sem
afetar paginação/carrinho das fixtures existentes. Não houve correção de frontend
necessária. Arquivos novos também conferidos quanto a whitespace.

F024 skips: **15**, exclusivamente casos dependentes de mongodump/mongorestore
ausentes. Nenhum teste de review pulado. Nenhum Database Tool baixado/instalado.

## Probes pós-correção por HTTP

| Probe | Reviews/count | Média | Evidência |
| --- | --- | --- | --- |
| 2 users, notas 1 e 5 | 2 / 2 | 3 | Ambas preservadas |
| Mesmo user concorrente | 1 / 1 | 5 nesta execução | Conteúdo final depende da write aplicada por último |
| 20 users, notas 1..5 repetidas | 20 / 20 | 3 | Nenhuma review perdida |
| Update da nota 1 para 5 | 20 / 20 | 3.2 | Mesmo ID antes/depois |
| Delete daquela review | 19 / 19 | 3.1052631578947367 | Agregados dos sobreviventes |
| Histórico count 999 | 19 / 999 preservado | Preservada | 409; audit REVIEW_COUNT_MISMATCH |

Review ID do probe de update antes/depois: `6ac82f9d843f67ab8ab3809d`.
Legacy não recebeu reparo. Banco do probe:
`fetech_routes_auth_11216_1791504280291`; testes usam bases `fetech_routes_auth_*`
e `fetech_e2e_*`, replica sets locais temporários em portas dinâmicas. Banco
comercial/serviço existente/config.env não foram acessados/modificados/reiniciados.
**BANCO REAL NÃO ALTERADO.**

## Remediações preservadas

| Finding | Status |
| --- | --- |
| F002 | CONTINUA CORRIGIDO — state machine/pagamento antes de envio |
| F003 | CONTINUA CORRIGIDO — estoque transacional |
| F004 | CONTINUA CORRIGIDO — Order/estoque |
| F005 | CONTINUA CORRIGIDO — idempotência |
| F006 | CONTINUA CORRIGIDO — JWT revogável |
| F007 | CONTINUA CORRIGIDO — cookie seguro |
| F008 | CONTINUA CORRIGIDO — limiter distribuído |
| F009 | CONTINUA CORRIGIDO — recuperação uniforme |
| F010 | CONTINUA CORRIGIDO — último admin |
| F011 | CONTINUA CORRIGIDO — pedido não excluído fisicamente |
| F012 | CONTINUA CORRIGIDO — snapshot entrega |
| F013 | CONTINUA CORRIGIDO — quantity estrita |
| F014 | CONTINUA CORRIGIDO — dinheiro em centavos |
| F016 | CONTINUA CORRIGIDO — lifecycle User |
| F020 | CONTINUA CORRIGIDO — CSRF/Origin/headers |
| F021 | CONTINUA CORRIGIDO — JWT fora JSON/no-store |
| F025 | CONTINUA CORRIGIDO — logs/correlação/health/audit |
| F036 | CONTINUA CORRIGIDO — configuração central |
| F024 | CONTINUA PARCIAL — Database Tools/drill indisponíveis |
| F001 / F027 | ADIADOS, NÃO INICIADOS |

## Documentação, riscos residuais e próxima tarefa

Documentação atualizada: contrato específico, rotas, observabilidade, lifecycle,
configuração, estado corrente, plano e este relatório/lista de testes.
**AUDITORIA HISTÓRICA NÃO ALTERADA**; registros originais de F015 preservados.

Products históricos podem conter agregados inconsistentes, duplicatas ou órfãos;
duplicatas antigas exigem revisão humana. Reparo histórico real depende de F024
validado. Escritas manuais fora da API podem corromper o documento. Reviews seguem
embutidas no Product, com limite estrutural MongoDB; performance ampla pertence
a F022. Moderação/privacy de reviews estão fora do finding; F037 permanece aberto
para outras coerências de Product. Pagamento/frete continuam adiados.

Status: **F015 CORRIGIDO NO CÓDIGO**, histórico sem reparo automático.
Próxima recomendação: **F017 — hierarquia de categorias consistente sob
concorrência, impedindo ciclos, parent inválido e races create/update/delete**.
Não iniciada automaticamente. F024 parcial; F001/F027 adiados.
