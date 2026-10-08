# Entrega FET-DATA-002 — 08/10/2026

## Resultado

**CONCLUÍDO.** F012 / FET-P1-003 **CORRIGIDO NO CÓDIGO**;
F013 / FET-P1-004 **CORRIGIDO**.

## Branch, HEAD e estado do worktree

Branch: `main`. HEAD inicial e final:
`64d11ae7677ce7487ba8cf6da2cd0329aeb3cc9c`.
Worktree encontrado limpo; F014 já commitado. Alterações anteriores e commit
monetário preservados. Esta tarefa permanece sem commit, com alterações pendentes.
Sem reset, descarte ou publicação.

## Findings reproduzidos antes da correção

| Probe em banco temporário | Resultado anterior | Zero preservado |
| --- | --- | --- |
| CEP `"01234567"` | Number `1234567` persistido | NÃO |
| Telefone `"04123456789"` | Number `4123456789` persistido | NÃO |
| Cidade `"   "` | 201, Order criado | — |
| CEP `-1` | 201, Order criado | — |
| Telefone `-2` | 201, Order criado | — |
| quantity `true` | 400, já rejeitado por F014 | — |
| quantity `"1"` | 201, coerção ainda aceita | — |

Antes de alterar o schema foram executados os testes de regressão: cinco falhas
esperadas e um caso já corrigido na F014; telefone isolado também falhou com
perda confirmada. Não foi reproduzida aceitação de quantity=true neste HEAD:
registrar essa proteção preexistente evita atribuir uma correção já feita à tarefa.
Logs locais ignorados: `.local/shipping-before.log` e `.local/shipping-phone-before.log`.

## Causa raiz

Order usava Number em CEP/telefone, não armazenava destinatário/número/bairro/
complemento e aceitava texto sem validação de conteúdo. O checkout concatenava
campos do Address na rua. O controller ainda convertia quantity em string para
Number e não verificava formato de todos os IDs antes de consultar produtos.

## Estratégia implementada

Contrato central `shared/shippingAddress.mjs`, whitelist de dez campos,
strings reais com trim, limites da agenda, regex ASCII e complemento canônico
vazio. Todos os itens são validados antes de consultas. Dinheiro F014 calculado
somente depois, com preços do servidor. Snapshot completo independente de Address,
versão 2 definida no controller. Schema compatível com legados, UI estruturada,
storage textual e diagnóstico histórico somente leitura.

## Contrato final de shippingInfo

| Campo | Tipo | Obrigatório | Validação |
| --- | --- | --- | --- |
| recipientName | string | sim | trim, não vazio, até 120 |
| address | string | sim | trim, não vazio, até 200 |
| number | string | sim | trim, não vazio, até 30; 10A/S/N/KM 12 válidos |
| complement | string | não | trim, até 120; ausência vira "" |
| neighborhood | string | sim | trim, não vazio, até 120 |
| city | string | sim | trim, não vazio, até 120 |
| state | string | sim | trim, não vazio, até 80 |
| country | string | sim | trim, não vazio, até 80 |
| pinCode | string | sim | trim, exatamente 8 dígitos ASCII |
| phoneNo | string | sim | trim, 10–15 dígitos ASCII |

## Snapshot version e Order schema

Campo `shippingInfoVersion`, atual **2**, controlado pelo servidor.
Cliente enviando 1 não contorna validação. Antes: seis campos, CEP/telefone Number.
Depois: dez strings, obrigatoriedade condicional e validação completa na versão 2.
Versão ausente/1 permite campos históricos incompletos, leitura e status update.
Não há defaults que promovam pedidos históricos à versão 2.

## Address

Reutilizados todos os limites e regras canônicas de CEP/telefone. Schema de
strings compartilhado e validação antecipada de campos fornecidos na agenda.
Entrada formatada da agenda permanece compatível por adaptador; checkout recebe
somente dígitos. Ownership, índice único e favorito não mudam. Complemento
opcional e país default Brasil na agenda preservados.

## Quantity

Number, safe integer, mínimo 1, sem coerção. Rejeita true/false, strings, float,
zero, negativo, null/ausente, objeto/array, NaN/Infinity e overflow. JSON converte
NaN/Infinity em null; um teste direto cobre os valores numéricos reais.
Agrupamento de IDs equivalentes mantém a checagem agregada de estoque.

## Frontend

CEP text/numeric/maxLength 8; telefone tel/tel/maxLength 15; número text.
Card copia campos separados e edição manual guarda o valor final. React/Redux/
localStorage mantêm strings e zeros após reload. Rascunhos numéricos antigos
precisam ser preenchidos novamente. Detalhe exibe snapshot completo e fallback
histórico; F031 não foi declarado resolvido.

## Compatibilidade histórica

Valores armazenados são preservados; leitura pode apresentar números como texto
sem inserir zeros. Pedido antigo sem novos campos pode mudar status; teste
confirma que shippingInfo bruto permanece idêntico após salvar o status.
Não é possível provar zeros originais a partir do número; não foi inventado
preenchimento nem criada migração automática.

## Audit histórico

Script: `ecommerce/backend/scripts/auditShippingSnapshots.js`.
Comando: `npm.cmd run audit:shipping --prefix ecommerce`. **READ-ONLY**.
Perfil F036 mínimo `shipping-audit`, NODE_ENV/DB_URI. Sem update/delete, sem --apply,
autoCreate/autoIndex false e leitura da coleção bruta. Saída: ObjectId válido,
categorias, campos e contagens; sem PII/URI/secret.

Categorias: CURRENT_VALID, CURRENT_INVALID, LEGACY_VALID_STORED_VALUE,
LEGACY_NUMERIC_PINCODE, LEGACY_NUMERIC_PHONE, LEGACY_MISSING_FIELDS,
LEGACY_INVALID_FORMAT. Problemas podem se sobrepor, conforme documentação.
Banco real executado: **NÃO**.

## Dependências adicionadas e npm audit

**NENHUMA.** package.json ganhou somente audit:shipping; nenhuma dependência
ou lockfile mudou. npm audit não reexecutado por não haver mudança de dependências,
conforme a tarefa. Não executado npm audit fix.

## Testes focados

`node --test ecommerce/tests/checkoutValidation.test.js`: **113/113**, 4,283 s.
Inclui tipos/formatos, campos obrigatórios, limites, trims, quantities, ID/estrutura,
ausência de side effects, consulta antecipada proibida, whitelist/versão, preço
autoritativo, snapshot salvo, legado/status, CSRF e privacidade.

## Testes de audit

`node --test ecommerce/tests/shippingSnapshotAudit.test.js`: **11/11**, 1,561 s.
Classificações, banco temporário idêntico antes/depois, ausência de PII, perfil
mínimo/fail-fast, nenhuma API de escrita disponível e CLI real em subprocesso.

## API completa

`npm.cmd test --prefix ecommerce`: **497/497**, 33,612 s, exit 0.
373 testes anteriores preservados + 113 checkout + 11 audit.

## Build

`npm.cmd run build --prefix ecommerce/frontend`: **APROVADO**, 920 ms, exit 0.

## E2E

`npm.cmd run test:e2e --prefix ecommerce`: **25/25**, 2,2 min, exit 0.
24 fluxos anteriores atualizados/preservados + um novo cenário manual completo.
Seleção/editabilidade em 360/768/1440 px preserva campos separados e zeros;
manual cobre erros, storage/reload e detalhe. CSP/CSRF e dinheiro continuam verdes.

## git diff --check

**APROVADO.** Sem whitespace inválido. Logs de teste/build ignorados em `.local`.

## Probes pós-correção

| Probe | Persistência / resposta / resultado |
| --- | --- |
| CEP 01234567 | "01234567", string, zeros intactos |
| Telefone 04123456789 | "04123456789", string, zeros intactos |
| Whitespace obrigatório | 400 |
| CEP -1 | 400 |
| Telefone -2 | 400 |
| quantity=true | 400 |
| Dados inválidos | zero Orders adicionais; estoque/Address/favorito/e-mails iguais |
| Saved Address: editar no checkout | snapshot usa Campinas, cadastro era Curitiba |
| Editar Address depois | cadastro muda para Santos, Order continua Campinas |
| Excluir Address | Order legível e snapshot idêntico |
| Trocar favorito | Order não muda |
| F014 preço servidor 10000 cents, cliente 1 | usado 10000; totais 10000/20000/30000 para qty 1/2/3 |
| E2E F014 | 10 cents × 3 + 20 cents × 1 = 50 cents |
| Histórico audit temporário | 2 analisados: 1 atual e 1 legado numérico/incompleto |
| Legacy numeric CEP / phone / missing | 1 em cada categoria; categorias sobrepostas |
| Audit writes / PII no output | zero / NÃO |

## Banco utilizado e audit/migration real

Apenas bancos temporários `fetech_routes_auth_*`, bancos isolados dos testes
anteriores, `fetech_shipping_audit_*` e `fetech_e2e_*`; teardown remove os bancos
de fixtures. Nenhuma operação de teste usa o banco comercial `fetech`.
**BANCO REAL NÃO AUDITADO/MODIFICADO POR ESTA TASK.**
**AUDIT/MIGRATION NÃO EXECUTADO CONTRA O BANCO REAL.**
config.env não sobrescrito; secrets não alterados nem divulgados.

## F006 / F007 / F008 / F009 / F010 / F014 / F020 / F021 / F036

Todos **CONTINUAM CORRIGIDOS** no código; suítes anteriores executadas e verdes.
Preservados replay, cookie, limiter distribuído, forgot uniforme, proteção admin,
centavos, HTTP/CSP/CSRF, JSON sem JWT/no-store e fail-fast de configuração.

## Findings relacionados ainda abertos e riscos residuais

F001 pagamento real, F003 estoque concorrente, F004 atomicidade, F005 idempotência,
F024 backup/restore, F027 frete, F031 storage corrompido e F037 Product.
Zeros históricos perdidos podem ser irrecuperáveis; banco real ainda não auditado.
F024 deve preceder futuras correções históricas. Repetição de POST pode duplicar
pedidos; sem reserva/ledger/transações/gateway/transportadora nesta entrega.

## Documentação atualizada e auditoria histórica

Criados VALIDACAO_CHECKOUT.md e este relatório. Atualizados README.md, COMANDOS.md,
ROTAS.md, ESTADO_ATUAL_PROJETO_FETECH.md, PLANO_MELHORIAS_FETECH.md, ENDERECOS.md,
CONFIGURACAO.md e referência em DINHEIRO.md. Política monetária preservada.
Relatório original de auditoria e PDF: **NÃO ALTERADOS**.

## Alterações fora de escopo e impacto de compatibilidade

**NENHUMA.** Novo shippingInfo completo e textual é mudança intencional de API:
clientes externos com CEP/telefone Number, snapshot incompleto, quantity string,
pontuação ou whitespace inválido passam a receber 400 e precisam adaptar payload.
Frontend oficial atualizado. Histórico legível sem alteração automática dos dados.

## Status da remediação e próxima task recomendada

F012 / FET-P1-003: **CORRIGIDO NO CÓDIGO**.
F013 / FET-P1-004: **CORRIGIDO**.
Próxima recomendação: **F005 / FET-P0-005 — idempotência persistente na criação
de pedidos**, para retry/duplo clique/timeout/repetição. Não iniciada automaticamente.

## Arquivos criados/alterados e testes individuais

A relação abaixo é gerada a partir do diff e dos resultados finais dos testes.

### Arquivos criados

- `docs/RELATORIO_FET_DATA_002.md`
- `docs/VALIDACAO_CHECKOUT.md`
- `ecommerce/backend/scripts/auditShippingSnapshots.js`
- `ecommerce/backend/utils/shippingSchema.js`
- `ecommerce/backend/utils/shippingSnapshotAudit.js`
- `ecommerce/shared/shippingAddress.mjs`
- `ecommerce/tests/checkoutValidation.test.js`
- `ecommerce/tests/e2e/shipping.spec.js`
- `ecommerce/tests/shippingSnapshotAudit.test.js`

### Arquivos alterados

- `COMANDOS.md`
- `README.md`
- `ROTAS.md`
- `docs/CONFIGURACAO.md`
- `docs/DINHEIRO.md`
- `docs/ENDERECOS.md`
- `docs/ESTADO_ATUAL_PROJETO_FETECH.md`
- `docs/PLANO_MELHORIAS_FETECH.md`
- `ecommerce/backend/config/runtimeConfig.js`
- `ecommerce/backend/controllers/orderController.js`
- `ecommerce/backend/models/addressModel.js`
- `ecommerce/backend/models/orderModel.js`
- `ecommerce/backend/utils/addressInput.js`
- `ecommerce/frontend/src/component/Cart/Shipping.jsx`
- `ecommerce/frontend/src/component/Order/OrderDetails.jsx`
- `ecommerce/frontend/src/component/User/AddressForm.jsx`
- `ecommerce/package.json`
- `ecommerce/tests/api.test.js`
- `ecommerce/tests/configSecurity.test.js`
- `ecommerce/tests/e2e/addresses.spec.js`
- `ecommerce/tests/e2e/money.spec.js`
- `ecommerce/tests/e2e/routes.spec.js`
- `ecommerce/tests/httpSecurity.test.js`
- `ecommerce/tests/moneyApi.test.js`

### Checkout (113 testes)

- PASSOU: CHECKOUT leading zeros: persistência e resposta
- PASSOU: CHECKOUT leading zero telefone isolado
- PASSOU: CHECKOUT whitespace recipientName
- PASSOU: CHECKOUT tipo recipientName: 12345678
- PASSOU: CHECKOUT tipo recipientName: true
- PASSOU: CHECKOUT tipo recipientName: {}
- PASSOU: CHECKOUT tipo recipientName: []
- PASSOU: CHECKOUT tipo recipientName: null
- PASSOU: CHECKOUT tipo recipientName: undefined
- PASSOU: CHECKOUT whitespace address
- PASSOU: CHECKOUT tipo address: 12345678
- PASSOU: CHECKOUT tipo address: true
- PASSOU: CHECKOUT tipo address: {}
- PASSOU: CHECKOUT tipo address: []
- PASSOU: CHECKOUT tipo address: null
- PASSOU: CHECKOUT tipo address: undefined
- PASSOU: CHECKOUT whitespace number
- PASSOU: CHECKOUT tipo number: 12345678
- PASSOU: CHECKOUT tipo number: true
- PASSOU: CHECKOUT tipo number: {}
- PASSOU: CHECKOUT tipo number: []
- PASSOU: CHECKOUT tipo number: null
- PASSOU: CHECKOUT tipo number: undefined
- PASSOU: CHECKOUT whitespace neighborhood
- PASSOU: CHECKOUT tipo neighborhood: 12345678
- PASSOU: CHECKOUT tipo neighborhood: true
- PASSOU: CHECKOUT tipo neighborhood: {}
- PASSOU: CHECKOUT tipo neighborhood: []
- PASSOU: CHECKOUT tipo neighborhood: null
- PASSOU: CHECKOUT tipo neighborhood: undefined
- PASSOU: CHECKOUT whitespace city
- PASSOU: CHECKOUT tipo city: 12345678
- PASSOU: CHECKOUT tipo city: true
- PASSOU: CHECKOUT tipo city: {}
- PASSOU: CHECKOUT tipo city: []
- PASSOU: CHECKOUT tipo city: null
- PASSOU: CHECKOUT tipo city: undefined
- PASSOU: CHECKOUT whitespace state
- PASSOU: CHECKOUT tipo state: 12345678
- PASSOU: CHECKOUT tipo state: true
- PASSOU: CHECKOUT tipo state: {}
- PASSOU: CHECKOUT tipo state: []
- PASSOU: CHECKOUT tipo state: null
- PASSOU: CHECKOUT tipo state: undefined
- PASSOU: CHECKOUT whitespace country
- PASSOU: CHECKOUT tipo country: 12345678
- PASSOU: CHECKOUT tipo country: true
- PASSOU: CHECKOUT tipo country: {}
- PASSOU: CHECKOUT tipo country: []
- PASSOU: CHECKOUT tipo country: null
- PASSOU: CHECKOUT tipo country: undefined
- PASSOU: CHECKOUT whitespace pinCode
- PASSOU: CHECKOUT tipo pinCode: 12345678
- PASSOU: CHECKOUT tipo pinCode: true
- PASSOU: CHECKOUT tipo pinCode: {}
- PASSOU: CHECKOUT tipo pinCode: []
- PASSOU: CHECKOUT tipo pinCode: null
- PASSOU: CHECKOUT tipo pinCode: undefined
- PASSOU: CHECKOUT whitespace phoneNo
- PASSOU: CHECKOUT tipo phoneNo: 12345678
- PASSOU: CHECKOUT tipo phoneNo: true
- PASSOU: CHECKOUT tipo phoneNo: {}
- PASSOU: CHECKOUT tipo phoneNo: []
- PASSOU: CHECKOUT tipo phoneNo: null
- PASSOU: CHECKOUT tipo phoneNo: undefined
- PASSOU: CHECKOUT formato pinCode: -1
- PASSOU: CHECKOUT formato pinCode: "1234567"
- PASSOU: CHECKOUT formato pinCode: "123456789"
- PASSOU: CHECKOUT formato pinCode: "12A45678"
- PASSOU: CHECKOUT formato pinCode: "01234-567"
- PASSOU: CHECKOUT formato pinCode: "１２３４５６７８"
- PASSOU: CHECKOUT formato phoneNo: -2
- PASSOU: CHECKOUT formato phoneNo: "123456789"
- PASSOU: CHECKOUT formato phoneNo: "1234567890123456"
- PASSOU: CHECKOUT formato phoneNo: "(11) 99999-9999"
- PASSOU: CHECKOUT formato phoneNo: "abcdefghij"
- PASSOU: CHECKOUT formato complement: 123
- PASSOU: CHECKOUT formato complement: true
- PASSOU: CHECKOUT formato complement: {}
- PASSOU: CHECKOUT formato complement: []
- PASSOU: CHECKOUT formato complement: null
- PASSOU: CHECKOUT quantity true (boolean)
- PASSOU: CHECKOUT quantity false (boolean)
- PASSOU: CHECKOUT quantity 1 (string)
- PASSOU: CHECKOUT quantity 2 (string)
- PASSOU: CHECKOUT quantity 1.5 (number)
- PASSOU: CHECKOUT quantity 0 (number)
- PASSOU: CHECKOUT quantity -1 (number)
- PASSOU: CHECKOUT quantity null (object)
- PASSOU: CHECKOUT quantity undefined (undefined)
- PASSOU: CHECKOUT quantity [object Object] (object)
- PASSOU: CHECKOUT quantity  (object)
- PASSOU: CHECKOUT quantity NaN (number)
- PASSOU: CHECKOUT quantity Infinity (number)
- PASSOU: CHECKOUT quantity 9007199254740992 (number)
- PASSOU: CHECKOUT estrutura null
- PASSOU: CHECKOUT estrutura {}
- PASSOU: CHECKOUT estrutura ""
- PASSOU: CHECKOUT estrutura []
- PASSOU: CHECKOUT estrutura [null]
- PASSOU: CHECKOUT estrutura [{}]
- PASSOU: CHECKOUT estrutura [{"product":"invalid","quantity":1}]
- PASSOU: CHECKOUT estrutura [{"product":{},"quantity":1}]
- PASSOU: CHECKOUT shippingInfo estrutura ausente/array/escalar
- PASSOU: CHECKOUT corpo ausente/array e agrupamento de IDs equivalentes
- PASSOU: CHECKOUT todos os itens validados antes de consultar produtos
- PASSOU: CHECKOUT NaN e Infinity reais são rejeitados antes de consultas/criação
- PASSOU: CHECKOUT produto inexistente mantém 404; estoque insuficiente mantém 400
- PASSOU: CHECKOUT trims, complemento opcional, número textual e limites
- PASSOU: CHECKOUT preço servidor, quantidade válida, whitelist e versão controlada
- PASSOU: CHECKOUT saved address: edição final, edição/exclusão/favorito não alteram snapshot
- PASSOU: CHECKOUT legado: leitura sem reparo e transição de status
- PASSOU: CHECKOUT CSRF, tipos admin e privacidade preservados

### Audit (11 testes)

- PASSOU: AUDIT classificação current
- PASSOU: AUDIT classificação legacy strings
- PASSOU: AUDIT classificação numeric CEP
- PASSOU: AUDIT classificação numeric phone
- PASSOU: AUDIT classificação missing
- PASSOU: AUDIT classificação invalid
- PASSOU: AUDIT classificação invalid current
- PASSOU: AUDIT banco temporário: resultado e documentos idênticos, sem PII
- PASSOU: AUDIT somente find: nenhuma API de escrita disponível
- PASSOU: AUDIT perfil mínimo F036 e fail-fast
- PASSOU: AUDIT CLI real em subprocesso: leitura, zero alterações e sem apply

### Novo E2E

- PASSOU: entrega manual: validação, localStorage/reload e zeros no detalhe.
