# Relatório FET-DATA-005 — F017

## Resultado e Git

Resultado: **CONCLUÍDO — F017 CORRIGIDO NO CÓDIGO**. Validação final registrada abaixo.
Branch main. HEAD inicial/final `c24776dcf16eeae9bca257d25089bf3586a88ef2`.
Estado inicial: worktree limpo, branch 20 commits à frente de origin/main.
F015 já commitada: `fix: garante consistência atômica das avaliações de produtos`.
Nenhuma alteração anterior pendente. Alterações existentes no HEAD preservadas.
Esta task sem commit, reset, clean, push ou próximo finding iniciado.

## Finding reproduzido antes da correção

`node --test ecommerce/tests/categoryHierarchyLegacyProbe.test.js`: 3/3.
Executado antes de alterar controllers/service de produção, em replica set
temporário. Probes reproduzem as leituras/guards e writes do caminho original,
com duas transações reais e barrier de teste depois das leituras e antes dos
writes. Não são requests HTTP instrumentadas, nem uma corrida por timing casual.

| Probe | Inicial | Operações concorrentes | Final vulnerável |
| --- | --- | --- | --- |
| Write skew | A/B roots | A.parent=B; B.parent=A | Ambos commits, A→B→A |
| Child/delete | P sem refs | Validate P/create Child; check refs/delete P | P removida, Child.parent=P |
| Product/delete | P sem refs | Validate P/create Product; check refs/delete P | P removida, Product.category_id=P |

IDs do probe original: A `6ac856e709eb7cc9d84d6109`, B
`6ac856e709eb7cc9d84d610b`; parents finais B/A, ciclo SIM.
Child parent `6ac856e709eb7cc9d84d610d`, child
`6ac856e709eb7cc9d84d610f`, orphan SIM.
Product category `6ac856e709eb7cc9d84d6111`, product
`6ac856e709eb7cc9d84d6113`, orphan SIM.

Causa raiz: snapshot isolation sem escrita comum nas transações que alteravam
documentos distintos. AuditEvents distintos não criavam conflito entre elas.

## Inventário Category e referências

Model `ecommerce/backend/models/categoryModel.js`, collection categories.
Parent `parent_id`, ObjectId ref Category, default null; campo ausente root legado.
Campos name/name_key/timestamps, sem slug/path/ancestors persistidos.
POST `/api/v1/admin/category`, PUT/DELETE `/api/v1/admin/category/:id`.
GET `/api/v1/categories`, `/category/:id`, `/admin/categories` e
`/admin/category/:id`; filtro parent_id=null/ID. Guards de ID/permissão preservados.
Frontend CategoriesContext/CategoriesManager compartilha árvore, selectors e
visited/fallback; já excluía self/descendants e exibia os erros do backend.
Catálogo filtra category_id e descendentes; fallback legado por category name.
Nenhum populate Category encontrado nos fluxos inventariados.

| Origem | Campo | Target | Obrigatório? | Antes / proteção implementada |
| --- | --- | --- | --- | --- |
| Category | parent_id | Category | Não | Ancestors validados em snapshot; agora após singleton comum |
| Product | category_id | Category | Opcional no schema legado | Resolução por ID; agora create/assignment coordenados |
| Product | category | Nome/texto Category | Sim | Resolução alternativa/desnormalização; também coordena e bloqueia delete |
| AdminAuditEvent | targetId/targetType CATEGORY | ID histórico | Sim | Histórico permanente; preservado após delete, não FK de lifecycle |

Todos os models pesquisados; não existem outras FKs Category em Order, User,
Address, StockMovement, OrderIdempotency, AuthRateLimit ou AdminMutationLock.
Scripts de escrita: migração aditiva existente em utils/categories/startup e
seedProducts. Ambos agora usam o protocolo; não foram executados comercialmente.

## Estratégia e hierarchy state

Serviço central `categoryHierarchyService.js`: bootstrap idempotente do state,
coordenação, validation/traversal, current BSON health e delete guards.
Reutiliza runAuditedAdminMutation; singleton incrementado como primeira operação
da callback, depois releitura/validação/mutação/AuditEvent e commit.
Toda Category mutation coordena, inclusive rename; baixo volume administrativo
justifica a política simples. Product create e updates com category_id/category
coordenam; updates sem categoria, deletes de Product, reads e Orders não tocam state.

Model CategoryHierarchyState; collection categoryhierarchystates;
singleton category-hierarchy; fields _id/revision/updatedAt; sem TTL, sem endpoint,
sem revision de cliente. Bootstrap revision=0 fora da transaction evita upsert
duplicate-key não repetível na primeira concorrência. Duplicate é tratado apenas
para o ID singleton; dados de domínio não são escritos nessa etapa.

Mongo withTransaction: primary/snapshot/majority, maxCommitTimeMS=10000,
timeoutMS=30000. Write conflict comum resolve write skew entre conexões/processos.
Retry repete validação e escrita; rollback abrange revision e audit. Sem mutex,
Map, lock de processo ou lease. Nenhum provider/filesystem/log de sucesso externo
na callback. Compatível com requisito comercial de replica set/mongos, sem fallback.

## Parent validation e legacy

Parent bruto inválido: 400 CATEGORY_INVALID_ID. Parent válido inexistente:
409 CATEGORY_PARENT_NOT_FOUND. Self/ciclo novo direto ou indireto:
409 CATEGORY_HIERARCHY_CYCLE. Histórico self/cycle/missing parent/tipo malformado:
409 CATEGORY_HIERARCHY_DATA_INCONSISTENT. Target inexistente mantém 404.
Traversal ancestor por ancestor com visited Set, sem carregar árvore inteira
nem limitar arbitrariamente profundidade. Cadeia atual também é validada antes
de rename/reparent/delete; BSON bruto impede casting esconder corrupção.
Histórico continua legível/auditável. Auto repair: **NÃO**.

Parent root null/ausente preservado; arrays/objetos/booleans/números não são IDs.
Category allowlist name/parent_id; _id/revision/timestamps não vêm do cliente.
Create não aceita _id cliente: self-parent externo não pode controlar ID novo;
helper com ID conhecido foi testado para rejeitar self também em create.

## Delete e Product integration

Com child: 409 CATEGORY_HAS_CHILDREN. Com Product por ID ou nome:
409 CATEGORY_IN_USE. Outras FKs de lifecycle: nenhuma encontrada.
Leaf sem refs pode ser removida fisicamente, conforme contrato anterior.
Cascade: NÃO. Reparent automático: NÃO. Remoção de Category de Product: NÃO.

Product create/assignment valida categoria existente dentro da mesma transação
coordenada; assignment por nome participa também. IDs inválidos/categoria ausente
mantêm 400 histórico de Product. Categoria ausente/invalid não persiste.
Quando delete vence, child/reparent/Product assignment revalidam e falham;
quando assignment vence, delete encontra refs e falha. Nunca novo orphan pelos
caminhos coordenados. Product updates sem categoria continuam funcionais.

## Audit F025

CATEGORY_CREATED/UPDATED/DELETED e PRODUCT_CREATED/UPDATED preservados.
Parent/category_id aparecem em changedFields quando alterados. Nome/arbitrary
text não entra na metadata. RequestId do header correlaciona evento; targetId
de Category deletada permanece. Mongo mutation + revision + AuditEvent atômicos.
Falha de audit aborta create/update/delete/Product create; retry real gera somente
um evento final. Nenhum audit extra para leitura da árvore.

## Audit categories

`npm.cmd run audit:categories --prefix ecommerce`.
Modo READ-ONLY; profile categories-audit mínimo, sem SMTP/Cloudinary/HTTP.
AutoCreate/autoIndex desativados; projections mínimas; JSON somente IDs/códigos.
Detecta CATEGORY_MISSING_PARENT, CATEGORY_SELF_PARENT, CATEGORY_CYCLE e
PRODUCT_MISSING_CATEGORY. Ciclos canonicalizados uma vez por componente,
visited impede loop, inclusive fixture de 2000 nodes. Respeita category_id
opcional legado e category obrigatório. Sem --apply/repair; argumentos rejeitados.
Snapshot completo antes/depois idêntico na função e no CLI.
Banco real: **NÃO EXECUTADO**.

## Arquivos criados

- docs/HIERARQUIA_CATEGORIAS.md
- docs/RELATORIO_FET_DATA_005.md
- docs/TESTES_FET_DATA_005.md
- ecommerce/backend/models/categoryHierarchyStateModel.js
- ecommerce/backend/services/categoryHierarchyService.js
- ecommerce/backend/utils/categoryHierarchyAudit.js
- ecommerce/backend/scripts/auditCategories.js
- ecommerce/tests/categoryHierarchy.test.js
- ecommerce/tests/categoryHierarchyConcurrency.test.js
- ecommerce/tests/categoryHierarchyAudit.test.js
- ecommerce/tests/categoryHierarchyLegacyProbe.test.js
- ecommerce/tests/helpers/categoryHierarchyHarness.js
- ecommerce/tests/helpers/categoryHierarchyWorker.js

## Arquivos alterados

- ROTAS.md
- docs/OBSERVABILIDADE.md
- docs/ESTADO_ATUAL_PROJETO_FETECH.md
- docs/PLANO_MELHORIAS_FETECH.md
- ecommerce/backend/config/runtimeConfig.js
- ecommerce/backend/controllers/categoryController.js
- ecommerce/backend/controllers/productController.js
- ecommerce/backend/middleware/erros.js
- ecommerce/backend/scripts/seedProducts.js
- ecommerce/backend/utils/categories.js
- ecommerce/package.json (somente script audit:categories)
- ecommerce/tests/api.test.js (novos status de parent/cycles)
- ecommerce/tests/configSecurity.test.js (novo entrypoint na allowlist de scripts)
- ecommerce/tests/e2e/routes.spec.js (caso Category ampliado)

Dependências adicionadas: **NENHUMA**. Lockfiles e config.env preservados.
Testes novos listados individualmente em [TESTES_FET_DATA_005.md](TESTES_FET_DATA_005.md).

## Validação

| Comando | Resultado |
| --- | --- |
| node --test ecommerce/tests/categoryHierarchy.test.js | 37/37 |
| node --test ecommerce/tests/categoryHierarchyConcurrency.test.js | 14/14, 40 races de dois nodes |
| node --test ecommerce/tests/categoryHierarchyAudit.test.js | 10/10 |
| node --test ecommerce/tests/categoryHierarchyLegacyProbe.test.js | 3/3 pré-fix |
| node --test ecommerce/tests/adminAudit.test.js | 57/57 regressão F025 |
| node --test ecommerce/tests/configSecurity.test.js | 46/46 F036 |
| npm.cmd test --prefix ecommerce | 1083 aprovados, 0 falhas, 15 skips F024; 1098 total |
| npm.cmd run build --prefix ecommerce/frontend | Aprovado |
| npm.cmd run test:e2e --prefix ecommerce | 33/33 aprovados |
| git diff --check | Aprovado após relatório final |
| npm.cmd audit --prefix ecommerce | Executado, 0 vulnerabilidades |

Primeira API completa detectou somente novo entrypoint faltante na allowlist CFG-42.
Corrigido segundo o padrão existente e API inteira reexecutada sem falhas.
Os 15 skips permanecem exclusivamente por MongoDB Database Tools ausentes.
Nenhum mongodump/mongorestore baixado; nenhum npm audit fix.

## Probes pós-fix

| Probe | Responses | Estado final |
| --- | --- | --- |
| Dois nodes | 200 / 409 CATEGORY_HIERARCHY_CYCLE | A.parent=B, B.parent=null; revision=23; 1 CATEGORY_UPDATED |
| Três nodes | 200 / 409 / 200 | A.parent=B; B root; C.parent=A; revision=145; 2 CATEGORY_UPDATED |
| Child/delete | 200 delete / 409 parent missing | Parent removida, child ausente; revision=147; orphan NÃO |
| Product create/delete | 200 delete / 400 assignment | Category removida, Product ausente; revision=152; orphan NÃO |
| Multi-process | 409 / 200 | Acyclic; revision=180; 1 CATEGORY_UPDATED |

IDs dois nodes na execução focused final: A `6ac85887d24dada3b23ed929`,
B `6ac85887d24dada3b23ed92b`; ciclo NÃO. 40 repetições: nenhuma com ciclo.
20 child creates + delete: nenhum orphan. Assignment por ID/nome, create/update,
reparent/delete new/old parent: estados finais válidos. Duas conexões independentes
e duas APIs em processos distintos: exatamente um reparent vence na corrida de
dois nodes. Write conflict real contado no driver: retry ocorreu, um audit persistido.

Legacy self/cycle/missing/malformed: 409 controlado, snapshot sem alteração,
GET/listagem funcionais. Auditor detecta missing parent, componentes de cycles,
Product orphan, sem writes e sem dados arbitrários no output.

## Banco utilizado e preservação de findings

Replica set local isolado iniciado pelo harness existente, portas efêmeras,
dbpath `.local/test-mongo-rs-*`; databases `fetech_routes_auth_<pid>_<timestamp>`,
`fetech_routes_<pid>_<timestamp>` e demais fixtures isoladas da suíte. Teardown
apaga somente banco/diretório temporário validado. E2E usa sua fixture temporária.
**BANCO REAL NÃO ALTERADO.** Config.env preservado; nenhuma migration comercial.

F002, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012, F013,
F014, F015, F016, F020, F021, F025 e F036: **CONTINUAM CORRIGIDOS**, evidenciados
pela API completa sem falhas e build; validação browser registrada acima.
F024: **CONTINUA PARCIAL**, restore drill real depende das Database Tools.
F001 pagamento e F027 frete: **ADIADOS / NÃO INICIADOS**.
F037: **ABERTO** (preços/imagens/off/installments/coerência completa de Product).
Auditoria histórica: **NÃO ALTERADA**. Fora de escopo: **NENHUMA alteração**.

## Compatibilidade e riscos residuais

Cycles antes retornavam 400 e podiam passar concorrentemente; agora recebem
409 e são serializados. Parent inexistente mudou de 400 para 409. Delete com
children/Product já era bloqueado, agora o bloqueio é consistente sob concorrência
e possui código estável. Product reference validada no protocolo distribuído.
Históricos legíveis/auditáveis podem falhar fechado em mutations; nenhuma migration
real executada. Todos os processos escritores precisam receber a nova versão.

Dados históricos podem ter cycles/missing parents; repair exige decisão humana
e F024 validado. Writes diretos fora do protocolo não têm essa garantia.
Serialização global reduz concorrência de writes administrativos, sem serializar
reads/Orders. F037 permanece aberto; pagamento/frete continuam adiados.

## Status da remediação e próxima recomendação

F017: **CORRIGIDO NO CÓDIGO**.
Próxima recomendação: **F018 + F019 — endurecer upload/avatar: validar origem e
tipo real antes do provider e eliminar mídia órfã na substituição**.
Não iniciada automaticamente. F001/F027 adiados; F024 parcial.
