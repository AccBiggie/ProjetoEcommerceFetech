# Hierarquia de categorias — FET-DATA-005 / F017

Category representa uma floresta. `parent_id` é ObjectId opcional referenciando
Category, com default `null`. Campo ausente também é root legado válido.
Não existem slug/path/materialized ancestors. Nomes normalizados usam `name_key`
único, interno. A listagem pública continua livre de locks e dados legados
inconsistentes continuam legíveis; a UI tem visited/fallback para componentes
sem root e exclui self/descendants do seletor administrativo.

| Origem | Campo | Target | Obrigatório? | Contrato/proteção |
| --- | --- | --- | --- | --- |
| Category | parent_id | Category | Não | Parent existente, sem self/ciclo; roots null/ausente |
| Product | category_id | Category | Não no schema legado; novas atribuições usam ID | Existência validada sob coordenação; delete bloqueado |
| Product | category | Nome Category / texto legado | Sim | Nome desnormalizado e resolução alternativa; delete também verifica nome |
| AdminAuditEvent | targetId + targetType=CATEGORY | ID histórico | Sim para ações Category | Não é FK de lifecycle; evento sobrevive ao delete |

Todos os models foram pesquisados. Order, Address, StockMovement, User,
OrderIdempotency, AuthRateLimit e AdminMutationLock não têm FK para Category.
AuditEvent não deve bloquear exclusão: registra o ID histórico, sem populate
obrigatório. Product não usa populate Category; catálogo filtra por category_id
e descendentes, com fallback de nome para legado.

## Serialização distribuída

`categoryHierarchyService.js` coordena toda mutação Category (inclusive rename)
e Product create/atribuição por ID **ou nome**, na mesma transação que a mutação
e AuditEvent F025. Product update sem categoria e Product delete continuam
usando sua transação auditada sem tocar hierarchy state. Pedidos e leituras
não entram nessa coordenação.

Model interno `CategoryHierarchyState`, collection `categoryhierarchystates`,
singleton `_id="category-hierarchy"`, campos `revision` e `updatedAt`, sem TTL,
sem endpoint e sem revision recebida do cliente. Bootstrap idempotente fora
da transação cria revision=0; duplicate-key do primeiro upsert concorrente é
tratado somente para esse `_id`. Nenhum dado de domínio é alterado nessa etapa.

A primeira operação de cada callback transacional incrementa o mesmo singleton.
Depois vêm leitura e validação, gravação e AuditEvent. Isso força write conflict
entre processos distintos e elimina write skew de documentos diferentes.
`session.withTransaction` repete a callback inteira, inclusive incremento e
validação, após erro transient; somente revision/mutação/audit do commit final
persistem. Opções: primary, snapshot, majority, maxCommitTimeMS=10000 e
timeoutMS=30000, preservando a política existente. Sem mutex local, lease ou
fallback standalone. Sem providers, filesystem ou logs de sucesso na callback.

A migração aditiva de categorias legadas que já existia no startup e
`seedProducts.js` também participam do protocolo. Não se acrescentou repair de
ciclos ou referências históricas. Esses scripts não foram executados no banco
comercial nesta tarefa.

## Validação e exclusão

Ancestors são percorridos dentro da transação, depois do incremento, com Set
de IDs visitados e sem limite arbitrário de profundidade. Não se carrega a árvore
inteira por mutação. A cadeia antiga do target também é validada antes de mudar
parent/rename/delete: inconsistência histórica não vira repair implícito.
Leitura de BSON bruto evita esconder parent inválido pela hidratação Mongoose.
Category update usa allowlist name/parent_id. IDs/timestamps/revision internos
não vêm do cliente. Parent HTTP aceita null/ausente ou string hexadecimal de
24 caracteres, sem coerção de objetos/arrays/booleans/números.

| Situação | HTTP | Código |
| --- | ---: | --- |
| Parent com formato/tipo inválido | 400 | CATEGORY_INVALID_ID |
| Parent direto válido mas inexistente | 409 | CATEGORY_PARENT_NOT_FOUND |
| Self ou ciclo novo direto/indireto | 409 | CATEGORY_HIERARCHY_CYCLE |
| Ciclo/missing parent/tipo inválido na cadeia histórica | 409 | CATEGORY_HIERARCHY_DATA_INCONSISTENT |
| Category possui child | 409 | CATEGORY_HAS_CHILDREN |
| Category usada por Product (ID/nome) | 409 | CATEGORY_IN_USE |
| Target Category inexistente | 404 | Contrato anterior |
| Product category_id inválido ou categoria não cadastrada | 400 | Contrato anterior preservado |

Leaf sem referências pode ser removida fisicamente. Não há cascade, reparent
automático nem remoção silenciosa de categoria no Product. Delete e child
create/reparent/Product assignment escrevem o mesmo singleton: quem perde
revalida o estado e falha quando a relação já não pode existir.

## Audit F025

CATEGORY_CREATED/UPDATED/DELETED e PRODUCT_CREATED/UPDATED permanecem atômicos
com suas mutações. Falha de insert AuditEvent aborta tudo, inclusive revision.
Parent/category_id aparecem em changedFields quando alterados. Request ID
do header é o mesmo do audit; somente IDs/campos permitidos são registrados.
Retries não duplicam eventos e delete preserva targetId histórico.

## Auditoria somente leitura

```powershell
npm.cmd run audit:categories --prefix ecommerce
```

Profile mínimo `categories-audit`: DB_URI/config mínima, sem SMTP, Cloudinary,
HTTP ou app.listen. AutoCreate/autoIndex desabilitados. Lê projections dos
campos necessários, emite JSON com resumo READ_ONLY e IDs/códigos, nunca nomes,
descrições, preços ou usernames. Detecta CATEGORY_MISSING_PARENT,
CATEGORY_SELF_PARENT, CATEGORY_CYCLE e PRODUCT_MISSING_CATEGORY. Cada
componente cíclico é reportado uma vez, canonicalizado; visited impede loops.
`category_id` legado ausente/null é permitido quando category obrigatório existe.
Não possui --apply e rejeita qualquer argumento. Exit 0 indica auditoria
executada; problemas encontrados são registrados no output, como nas auditorias
existentes. Exit 1 indica falha de execução/configuração.

Não executar contra banco comercial nesta task. Testes com fixtures temporárias
comparam snapshot completo antes/depois, inclusive execução CLI.

## Limites

A garantia cobre os caminhos de escrita inventariados no projeto; writes diretos
no banco feitos fora desse protocolo podem violar invariantes. Deploy deve
atualizar todas as instâncias escritoras; processo antigo não participa do lock.
Dados históricos podem continuar inválidos. Repair exige decisão humana e
backup/restore drill F024 validado; nenhum repair/migration real foi executado.
Serialização global limita throughput de writes administrativos, aceitável para
esse domínio; leitura/catalog browsing permanece livre.
F037 (coerência comercial completa de Product) permanece aberto, F024 parcial,
F001 pagamento e F027 frete adiados. Próxima recomendação F018+F019 não iniciada.
