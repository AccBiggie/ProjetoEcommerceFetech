# Validação do checkout e snapshot — FET-DATA-002

Contrato vigente em 08/10/2026: F012 / FET-P1-003 **CORRIGIDO NO CÓDIGO**;
F013 / FET-P1-004 **CORRIGIDO**. Banco comercial não auditado nem alterado.

## POST /api/v1/order/new

Exige sessão válida e CSRF existentes. Valida corpo, array de produtos, entrega
e todos os itens antes de consultar produtos, calcular centavos ou criar Order.
Input inválido retorna `400` com `{ "success": false, "message": "..." }`.
ObjectId válido inexistente continua retornando `404`; estoque insuficiente, `400`.
Payload inválido não cria pedidos, altera estoque/endereços/favoritos ou envia e-mail.

```json
{
  "shippingInfo": {
    "recipientName": "Cliente Teste",
    "address": "Rua Exemplo",
    "number": "10A",
    "complement": "",
    "neighborhood": "Centro",
    "city": "Curitiba",
    "state": "PR",
    "country": "Brasil",
    "pinCode": "01234567",
    "phoneNo": "04123456789"
  },
  "orderItems": [{ "product": "0123456789abcdef01234567", "quantity": 2 }]
}
```

O produto ilustrativo precisa existir. Preços, totais, usuário, pagamento e versão
do cliente não controlam o resultado. Servidor cria `shippingInfoVersion: 2`,
pagamento `Pending`, frete/impostos zero e dinheiro conforme [DINHEIRO.md](DINHEIRO.md).
Repetir o POST ainda pode gerar outro pedido (F005).

## Contrato final de shippingInfo

| Campo | Tipo | Obrigatório | Regra após trim | Máximo |
| --- | --- | --- | --- | ---: |
| `recipientName` | string | sim | não vazio | 120 |
| `address` | string | sim | não vazio | 200 |
| `number` | string | sim | não vazio; aceita `10A`, `S/N`, `KM 12` | 30 |
| `complement` | string | não | ausente vira `""`; vazio permitido | 120 |
| `neighborhood` | string | sim | não vazio | 120 |
| `city` | string | sim | não vazio | 120 |
| `state` | string | sim | não vazio | 80 |
| `country` | string | sim | não vazio; formulário inicia com Brasil | 80 |
| `pinCode` | string | sim | exatamente 8 dígitos ASCII sem pontuação | 8 |
| `phoneNo` | string | sim | 10–15 dígitos ASCII sem pontuação | 15 |

Sem coerção de Number, boolean, objeto ou array para texto. `null` é inválido,
inclusive no complemento. Trim preserva espaços internos. Zeros iniciais de CEP,
telefone e número permanecem. CEP brasileiro é o contrato atual, mesmo com país
editável; validação internacional continua pendente.

Regras e limites vieram do Address e ficam em `ecommerce/shared/shippingAddress.mjs`,
reutilizado pelo frontend/backend e schema compartilhado. A agenda mantém seu
adaptador compatível com CEP/telefone formatados: verifica pontuação permitida,
remove formatação e aplica o mesmo contrato canônico. O endpoint do pedido recebe
diretamente dígitos; `01234-567` e `(11) 99999-9999` retornam 400. Ownership e
favorito único do CRUD continuam preservados.

## Produtos e quantity

Array real não vazio; cada item é objeto com `product` string de 24 caracteres
hexadecimais e `quantity` Number inteiro seguro >= 1. Booleanos, strings, floats,
zero, negativos, null, ausência, objetos, arrays, NaN, Infinity e overflow são
rejeitados. JSON não representa NaN/Infinity; há teste direto do controller.
Sem Number/parseInt/defaults permissivos. IDs equivalentes são agrupados sem
distinção de maiúsculas/minúsculas. Soma e verificação de estoque são preservadas.

## Snapshot e histórico

Order copia somente os dez campos finais. Label, favorite, user, _id e timestamps
da agenda não entram na entrega. Não há sourceAddressId, populate(Address) ou
referência obrigatória. Edições no checkout integram o snapshot; editar/excluir
Address ou trocar favorito posteriormente não altera o pedido.

Schema usa strings. Versão 2 exige contrato completo; ausência/versão 1 permite
leitura e atualização de status sem exigir novos campos. F014 continua ativo.
Mongoose apresenta números históricos como texto em memória (`1234567` vira
`"1234567"`), sem inserir zeros. Ler não escreve; atualizar status não migra
shippingInfo. Não há backfill, preenchimento artificial ou migração de snapshots.
Valores originais já perdidos podem exigir fonte externa para correção manual.

## Frontend

Cards copiam cada campo separadamente, mantendo edição manual e complemento
opcional. CEP: text/numeric/maxLength 8/padrão 8 dígitos. Telefone:
tel/tel/maxLength 15/padrão 10–15. Número: text. Validação antecipada e limites
compartilhados; backend autoritativo. Detalhe exibe destinatário, rua/número,
complemento, bairro, cidade/estado, país, CEP e telefone, com fallback legado.

React/Redux/localStorage recebem strings normalizadas; recarga preserva zeros.
Rascunhos antigos numéricos precisam de preenchimento novamente, sem adivinhar
zeros. F031, proteção geral contra JSON corrompido em storage, continua aberto.

## Audit histórico READ ONLY

Script: `ecommerce/backend/scripts/auditShippingSnapshots.js`.

```powershell
npm.cmd run audit:shipping --prefix ecommerce
```

F036 perfil `shipping-audit`: NODE_ENV e DB_URI, sem JWT/SMTP/Cloudinary/frontend.
Carrega ambiente pelo mecanismo central. Usa coleção bruta, autoCreate/autoIndex
false, sem update/delete; rejeita argumentos, inclusive --apply. Saída e erros
não expõem URI/secret/PII. Relatório contém apenas ObjectId válido, categorias,
campos afetados e contagens. Não imprime nome, endereço, CEP, telefone, e-mail
ou pagamento. Anuncia READ ONLY.

| Categoria | Significado |
| --- | --- |
| CURRENT_VALID | versão 2 válida |
| CURRENT_INVALID | versão 2 fora do contrato |
| LEGACY_VALID_STORED_VALUE | sem versão/1, textos válidos; não prova recuperação de zeros |
| LEGACY_NUMERIC_PINCODE | CEP Number |
| LEGACY_NUMERIC_PHONE | telefone Number |
| LEGACY_MISSING_FIELDS | campo obrigatório ausente |
| LEGACY_INVALID_FORMAT | tipo/formato/texto inválido ou versão desconhecida |

Categorias de problema podem se sobrepor, inclusive em documentos versão 2;
sua soma pode exceder pedidos analisados. Categorias válidas não se sobrepõem
com problemas. Auditoria é diagnóstico, não confirmação de dados recuperáveis.
**Banco real não auditado/modificado.** Antes de ações futuras sobre histórico,
validar backup/restore F024 e selecionar explicitamente o ambiente.

## Verificação e riscos

```powershell
node --test ecommerce/tests/checkoutValidation.test.js
node --test ecommerce/tests/shippingSnapshotAudit.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
git diff --check
```

Testes em bancos temporários, SMTP substituído. F006/F007/F008/F009/F010/F014/
F020/F021/F036 preservados. Abertos: F001 pagamento, F003 estoque concorrente,
F004 atomicidade, F005 idempotência, F024 backup/restore, F027 frete, F031 storage,
F037 Product. Sem dependências/lockfiles/secrets/config.env alterados. Auditoria
histórica original intacta. Clientes externos precisam do snapshot completo,
CEP/telefone strings e quantity Number inteiro. Próxima recomendação: F005,
idempotência persistente; não iniciada automaticamente.
