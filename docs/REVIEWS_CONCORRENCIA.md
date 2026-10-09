# Avaliações e concorrência — FET-DATA-004 / F015

`Product.reviews` é a fonte de verdade. `numOfReviews` é o tamanho do array final;
`ratings` é a soma das notas dividida pelo tamanho, sem arredondamento. Array vazio
produz contagem e média zero. A comparação de integridade aceita diferença de
até `1e-12` na média double; a operação sempre grava a média calculada pelo MongoDB.

## Contrato HTTP

- `PUT /api/v1/review`: usuário autenticado, body `{productId, rating, comment}`.
  Nota deve ser um Number inteiro entre 1 e 5, sem coerção de strings/booleanos.
  Comentário deve ser string obrigatória, com trim. Novo limite: 2000 caracteres
  após trim (antes não havia limite explícito). Comentários históricos maiores
  não são automaticamente considerados inválidos nem truncados.
- `DELETE /api/v1/reviews?productId=...&id=...`: autor ou administrador.
- `GET /api/v1/reviews?productId=...`: público; preserva alias `id` do produto.

IDs devem ser ObjectIds válidos; inválidos retornam 400, produto/avaliação ausente
retorna 404 e exclusão por outro cliente retorna 403. Mutação exige cookie válido
e `X-Fetech-CSRF: 1`; resposta privada mantém `no-store` e `X-Request-Id`.
Create/update/delete respondem `{success:true, product:{_id,reviews,ratings,numOfReviews}}`:
snapshot projetado retornado pela própria operação atômica, sem refetch para
construir a resposta. Ele representa aquela operação, mesmo se outra write
posterior já ocorreu. GET de produto continua retornando o produto completo.

O frontend envia nota numérica e busca novamente o produto no backend após
mutação; exibe os agregados recebidos, sem recalcular média autoritativa local.

## Garantia de escrita

`productReviewService` usa `findOneAndUpdate` com aggregation update pipeline e
`returnDocument: after`. O filtro verifica integridade do histórico dentro da
mesma operação. Primeiro transforma o array atual; em um segundo estágio deriva
contagem e média do array transformado. Não há read-modify-save, mutex local,
contador incremental ou dependência de Redis.

Uma review por usuário/produto: `$map` atualiza a existente preservando `_id`,
posição e campos históricos extras; `$concatArrays` insere uma nova com ObjectId
gerado no servidor. Última write efetivamente aplicada determina o conteúdo
quando o mesmo usuário concorre. Usuários distintos preservam suas avaliações.
Delete usa `$filter` com ownership no filtro atômico e recalcula ambos os agregados.
Comentários/nomes são `$literal`, sem interpretar expressões MongoDB.

A mutação de cliente precisa somente da atomicidade de um documento. Exclusão
administrativa permanece na transação F025 que inclui `PRODUCT_REVIEW_DELETED`:
falha na gravação do AuditEvent reverte a exclusão e seus agregados. Metadata
contém apenas `reviewId`; target é Product. Cliente não gera audit administrativo.

O servidor valida explicitamente entradas porque pipelines não aplicam casting
e validators convencionais do Mongoose. Autoria/nome vêm de `req.user`. Body não
controla `_id`, `user`, `name`, `reviews`, `ratings` ou `numOfReviews`. A whitelist
de create/update genérico administrativo de Product também exclui os três campos
de review. Outros campos do produto são preservados. Schema real não tem timestamps
de review nem `updatedAt` do produto; `createdAt` permanece intacto.

## Histórico e auditoria

Histórico com duplicação de usuário/ID, nota inválida, estrutura inválida ou
agregados divergentes bloqueia novas mutações com 409 e
`PRODUCT_REVIEW_DATA_INCONSISTENT`. Não escolhemos uma duplicata, removemos linha
ou corrigimos agregado implicitamente. Campos ausentes `reviews`, `ratings`,
`numOfReviews` equivalem ao histórico vazio; campos explicitamente nulos são inválidos.
A leitura de diagnóstico após falha não participa da escrita.

```powershell
npm.cmd run audit:reviews --prefix ecommerce
```

O script usa perfil central `reviews-audit`, valida ambiente/URI, desativa
`autoCreate`/`autoIndex`, lê documentos BSON sem defaults/casting e rejeita todos
os argumentos, inclusive `--apply`. Emite resumo `READ_ONLY` e categorias:

- `REVIEW_COUNT_MISMATCH`
- `REVIEW_RATING_MISMATCH`
- `DUPLICATE_REVIEW_USER`
- `INVALID_REVIEW_RATING`
- `INVALID_REVIEW_USER_REFERENCE` (ID inválido ou User inexistente)
- `INVALID_REVIEW_STRUCTURE`
- `DUPLICATE_REVIEW_ID`

Saída só contém categorias, totais e ObjectIds válidos. Nunca imprime nome,
comentário, email, descrição ou valor malformado de referência. O runtime verifica
integridade dentro do Product; a auditoria verifica também existência do User.
Não há lookup de usuários de todas as reviews em cada mutação.

F016 mantém User desativado existente e sua review histórica. Desativado recebe
401 antes do controller; reativação com novo login atualiza a mesma review.
Desativado não é órfão. F025 registra `product.review.data_inconsistent` com
`requestId` e `targetId` do produto, sem textos de reviews.

## Limitações

O audit não foi executado no banco comercial. Testes e probes usam bancos
temporários em replica sets locais descartáveis; a solução de cliente não exige
transações. Não há reparo, migration de startup, nova collection ou índices.
Escritas manuais fora da API ainda podem corromper dados; próxima mutação os
sinaliza. Histórico inconsistente pode bloquear avaliações até revisão humana.
Reparo real exige backup/restore validado; F024 permanece parcial pela ausência
de mongodump/mongorestore. F037 cobre outras coerências de Product; moderação e
privacy estão fora do escopo. Pagamento F001 e frete F027 continuam adiados.
