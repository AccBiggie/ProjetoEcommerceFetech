# Coerência de Product — FET-CATALOG-001 / F037

## Listagens — F022

Catálogo default 12; admin products default 25; máximo 100, sort createdAt/_id com limites centrais. Summaries usam cents/decimais explícitos F014, uma imagem, sem description/reviews; edição busca GET product/:id antes de montar body F037. Domínio, mutações, estoque e auditoria transacional preservados. **Índice F037 continua pré-requisito de deployment**, não aplicado no fetech. [Paginação/índices](PAGINACAO_E_PERFORMANCE_API.md).


Create, update e seed passam por `backend/utils/productDomain.js` e
`backend/services/productMutationService.js`. O backend decide o estado comercial;
o formulário envia somente uma solicitação. Não há reparo automático de históricos.

| Campo real | Persistido? | Entrada HTTP? | Derivado? | Fonte de verdade / regra |
| --- | --- | --- | --- | --- |
| `_id`, `__v` | Sim | Não | Sistema | Mongo/Mongoose |
| `name`, `description` | Sim | Sim | Não | String com trim, não vazia, Unicode; sem limite novo ou unicidade inventada |
| `countDown` | Sim | Sim | Não | String não vazia, máximo existente de 50 caracteres; não é utilizada como regra comercial pelo frontend atual |
| `price` | Somente legado | Sim | Na resposta | F014 parse estrito; no máximo duas casas, sem arredondar |
| `priceCents` | Sim | Não | Da entrada `price` | Inteiro seguro >= 0; preço zero preservado pelo caso comercial API-MONEY-22 |
| `oldPrice` | Somente legado | Sim, inclusive null | Na resposta | Referência opcional; null remove desconto |
| `oldPriceCents` | Sim, nullable | Não | Da entrada `oldPrice` | Null ou >= priceCents; igualdade permite desconto zero, conforme fallback do formulário anterior |
| `off` | Sim | Não | Sim | Percentual inteiro, arredondamento half-up, calculado em BigInt |
| `installmmentPrice` | Somente legado | Não | Na resposta | Spelling histórico mantido |
| `installmmentPriceCents` | Sim | Não | Sim | Primeira parcela de `splitInstallments(priceCents, 12)`; resto distribuído nas primeiras parcelas |
| `Stock` | Sim | Sim | Não | Available-to-sell, Number inteiro seguro >= 0 |
| `stockLedgerVersion` | Sim nos novos produtos | Não | Sistema | Versão 1 declara baseline completo a partir da criação |
| `category_id` | Sim nos novos writes | Sim | Resolvido | Category existente, sob coordenação F017 |
| `category` | Sim | Sim por compatibilidade | Nome resolvido | Cópia de Category.name; ID e nome divergentes são rejeitados |
| `images[].public_id`, `url`, `banner` | Sim | Sim | Não | Metadados validados; array vazio permitido pelo fallback atual |
| `images[]._id` | Sim | Não | Sistema | ID de subdocumento Mongoose |
| `reviews[]._id`, `user`, `name`, `rating`, `comment` | Sim | Somente serviço de reviews | F015 | Endpoint genérico de Product rejeita reviews |
| `ratings`, `numOfReviews` | Sim | Não | Sim | Array final de reviews, pipeline atômico F015 |
| `user`, `createdAt` | Sim | Não | Sistema | Admin autenticado e relógio do servidor |

Dinheiro continua em cents. A fórmula de desconto é
`floor(((old-current)*200 + old)/(2*old))`, em BigInt; old null/zero produz off=0.
Não há cálculo financeiro em float. As 12 parcelas já existiam no formulário e
no seed; a UI descreve o valor como parcela ilustrativa. Não foi criada uma
política de juros, pagamento ou settlement. O serializer mantém decimais derivados
dos cents, `moneyLegacy`, e o typo `installmmentPrice`. Leituras de legado não
reescrevem documentos nem recalculam silenciosamente seu parcelamento persistido.
`productMoney`, utilizado pela migração F014 histórica, mantém sua conversão.
Essa ferramenta histórica não deve reparar produtos do novo contrato nullable.

O corpo é uma allowlist fechada: name, description, price, oldPrice, Stock,
category, category_id, images, countDown. Qualquer outro campo retorna
400 PRODUCT_FIELD_NOT_MUTABLE. Textos não aceitam objetos, arrays ou coerção
de números/booleanos. Dinheiro inválido retorna PRODUCT_PRICE_INVALID ou
PRODUCT_OLD_PRICE_INVALID; relação inválida retorna PRODUCT_PRICE_RELATION_INVALID.

Imagens são metadata administrativa direta, sem upload próprio de Product.
Cada item contém exclusivamente public_id, url e banner; IDs não vazios e únicos.
URLs externas devem ser HTTPS sem credenciais. As exceções locais existentes são
`/demo-products/<arquivo>`, `/Profile.png` e `/logo192.png`, sem traversal.
Não há fetch remoto, verificação de ownership de assets ou chamada Cloudinary.
F029 permanece aberto. Imagens históricas fora desse contrato continuam legíveis;
alterá-las requer uma solicitação válida, sem reparo automático na leitura.

## Transações, estoque e categorias

Todo create/update/delete HTTP de Product participa da coordenação de revisão
F017, inclusive updates parciais, porque a operação revalida sua categoria atual.
Isso estende a coordenação anterior e serializa writes administrativos de catálogo;
leituras, reviews e reservas não adquirem esse lock. Custo: menor paralelismo de
writes administrativos, aceitável nesta correção; performance pertence a F022.

Um novo Product usa baseline stockLedgerVersion=1. Stock > 0 gera INITIAL_STOCK
com delta positivo, stockBefore=0 e stockAfter=Stock; zero não gera movimento.
Admin solicita target absoluto. Dentro do snapshot atual, o serviço calcula
`delta = target - current`, atualiza Product e cria ADMIN_ADJUSTMENT somente
quando delta != 0. Movement guarda actorUserId e reason técnico, sem texto livre/PII.
Não tem order/quantity, que pertencem exclusivamente a RESERVE.

Product, movement, revisão de hierarquia e AuditEvent commitam juntos. Falhas
em movement/audit abortam tudo. Write conflicts com `$inc` de reserva provocam
retry do callback e nova leitura do estoque. O alvo absoluto vale na ordem de
serialização: reserva antes do ajuste pode terminar em target; reserva depois
termina em target-quantidade. Não há lost update nem mudança da semântica F003/F004.
Um retry abortado não duplica movement nem evento. Orders preservam seus snapshots.

Legado sem marker permanece sem alegação de ledger completo. O primeiro ajuste
novo registra o stockBefore efetivamente observado e seu delta; não recria o
passado. O audit valida esses movimentos individualmente, mas não compara a soma
histórica incompleta com Stock. Para novos produtos, compara soma em BigInt com Stock.

Category ID/nome são resolvidos do mesmo documento. Ambos enviados devem indicar
a mesma categoria, ou 400 PRODUCT_CATEGORY_MISMATCH. Rename já sincronizava
Product.updateMany dentro da transação F017; a garantia foi preservada e testada.
Reviews concorrentes permanecem independentes: só campos allowlisted recebem
`$set`, nunca um save de documento stale contendo arrays e agregados.
Histórico de reviews inconsistente impede mutação genérica com 409, sem repará-lo.

DELETE físico retorna 409 PRODUCT_IN_USE se houver StockMovement ou referência
em Order, inclusive arquivado. Produto sem essas referências pode ser excluído.
Não há archive de Product nesta tarefa; um produto com ledger inicial continuará
protegido mesmo com Stock zero. Lifecycle administrativo futuro é escopo separado.
A corrida delete/reserve escreve o mesmo Product: ou o delete é impedido, ou a
reserva é recusada sem Order/movement órfão. F005 pode devolver 503 e manter a
intenção PROCESSING se o produto desaparecer após o preflight; esse protocolo foi
preservado, sem takeover automático da intenção.

## Índice e implantação

O índice único antigo `(order, product, type)` também abrangia order ausente;
por isso impediria o segundo ajuste administrativo do mesmo produto. O novo
`one_order_product_reserve` mantém a mesma unicidade exclusivamente para RESERVE.
A operação explícita cria a proteção nova **antes** de retirar o índice antigo:

```powershell
# Somente após autorização operacional e preparação da database correta no ambiente:
npm.cmd run upgrade:stock-index --prefix ecommerce -- --confirm-database NOME_EXATO
```

O helper é idempotente e não reescreve documentos. A aplicação não migra índices
automaticamente: create/ajuste falham com 503 PRODUCT_STOCK_LEDGER_INDEX_REQUIRED
se detectarem o índice antigo. Evita commit parcial ou uma primeira operação
aparentemente válida seguida de falha no segundo ajuste. O índice não foi
alterado no fetech durante esta tarefa. O rollout real deve ser planejado com a
proteção operacional de F024; backup/restore real continua não comprovado.

## Auditoria somente leitura

```powershell
npm.cmd run audit:products --prefix ecommerce
```

Perfil products-audit exige apenas configuração mínima F036 (ambiente/database/log).
Usa driver bruto e snapshot consistente entre coleções no replica set,
autoCreate=false, autoIndex=false, sem models de aplicação,
servidor, SMTP, provider ou migrations. Rejeita todos os argumentos, inclusive
--apply/--repair. Não imprime documentos, URLs, nomes, comentários ou credenciais;
somente contagens, IDs técnicos e códigos. Nenhuma execução contra o banco real
foi feita nesta tarefa. Auditoria não equivale a repair autorizado.

Detecta preço/referência inválidos, desconto/parcela divergentes, Stock inválido,
categoria ausente/divergente, issues reutilizadas de assessReviews, imagem
inválida/duplicada, ledger inconsistente e referências órfãs de movimento.
Históricos sem baseline são contados separadamente. Reparos reais aguardam F024.

F002–F018, F020/F021/F025/F031/F036 continuam protegidos; F019 cobre novas
substituições de avatar. F024 PARCIAL, F029/F030 abertos, F001/F027 adiados.
[Validação e relatório](RELATORIO_FET_CATALOG_001.md).
