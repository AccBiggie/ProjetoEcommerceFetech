# Relatório FET-DATA-001 — Modelo monetário exato

## Resultado

CONCLUÍDO. F014 / FET-P0-010: **CORRIGIDO NO CÓDIGO**. Banco real ainda não migrado.

## Branch

main.

## HEAD inicial

d3bd5e9fe35a9eece03618955eb55c197cdfff94

## HEAD final

d3bd5e9fe35a9eece03618955eb55c197cdfff94. Nenhum commit nesta tarefa.

## Estado do worktree

Inicialmente limpo; F036 já commitada em d3bd5e9. Sem alterações anteriores pendentes. Todas as garantias anteriores preservadas. A implementação atual permanece sem staging/commit/push.

## Finding tratado

F014 / FET-P0-010 — divergência de precisão monetária.

## Finding reproduzido antes da correção

Probe real da API em database temporário: price="0.105" foi aceito e persistido; quantity=3; snapshot price=0.105; linha=0.315; itemsPrice=0.33; totalPrice=0.33. Divergência concreta entre preço/linha e total. Banco temporário removido no finally. A primeira tentativa do probe precisou criar a categoria fixture com name_key; só o resultado acima foi registrado como reprodução válida.

## Causa raiz

Product com strings arbitrárias, Order com Number decimal, arredondamento por unidade no controller e somas decimais independentes no frontend. Não havia unidade/parser/invariantes monetárias centrais.

## Inventário monetário

| Campo anterior | Model/local | Tipo anterior | Canônico novo | Uso |
|---|---|---|---|---|
| price | Product | String decimal arbitrária | priceCents: inteiro | Preço do servidor |
| oldPrice | Product | String decimal arbitrária | oldPriceCents: inteiro | Exibição/comparação |
| installmmentPrice | Product | String decimal arbitrária | installmmentPriceCents: inteiro | Parcela ilustrativa |
| orderItems[].price | Order | Number decimal | orderItems[].priceCents: inteiro | Snapshot unitário |
| itemsPrice | Order | Number decimal | itemsPriceCents: inteiro | Soma de linhas |
| taxPrice | Order | Number decimal | taxPriceCents: inteiro | Zero atual |
| shippingPrice | Order | Number decimal | shippingPriceCents: inteiro | Zero atual |
| totalPrice | Order | Number decimal | totalPriceCents: inteiro | Total do servidor |
| totalAmount | Resposta admin/orders | Soma Number decimal | totalAmountCents: inteiro | Agregado seguro |
| price/subtotal/total | Carrinho/localStorage/checkout | Conversões e somas decimais | priceCents e soma de centavos | Prévia local |
| off | Product/admin/seed | Number percentual | Permanece percentual | Não é dinheiro; F037 aberto |

## Estratégia implementada

Uma implementação compartilhada money.mjs, parsing estrito, arithmetic inteira com limites, modelos canônicos, invariantes Order, autoridade server-side e leitura legada estrita. API mantém campos históricos derivados como apresentação; frontend usa Cents. Migração explícita, sem startup automático, default dry-run, confirmação, relatório sem PII e CAS por documento. BigInt é transitório no parsing/formatação/distribuição de parcelas; persistência/JSON continuam Number safe integer.

## Utilitário monetário

Arquivo: ecommerce/shared/money.mjs; adaptador backend: ecommerce/backend/utils/money.js; ponte frontend: ecommerce/frontend/src/utils/money.js.
Funções: parseMoneyToCents, assertCents, formatCentsToDecimal, formatBRLFromCents, addCents, multiplyCents, sumCents, readCents, splitInstallments; normalizadores productMoney/orderMoney e apresentação Product/Order.
Regra: não negativo, decimal explícito com até duas casas na entrada, inteiro safe na representação. Científica textual/tokens JSON, vazio, whitespace, vírgula, booleano, precisão >2 e overflow são recusados. Zero na API preservado. Quantidade do cálculo é inteiro positivo.

## Representação canônica

Product: priceCents, oldPriceCents, installmmentPriceCents. Item Order: priceCents. Totais: itemsPriceCents, taxPriceCents, shippingPriceCents, totalPriceCents. Agregado admin: totalAmountCents, somente resposta. Linha calculada sob demanda, sem campo inventado. off segue percentual.

## Contrato da API

### Escrita

Admin envia price/oldPrice/installmmentPrice humanos. Servidor parseia estritamente e ignora Cents do cliente. Pedido usa somente IDs/quantidades para buscar preço atual; ignora quaisquer preços/totais/frete/imposto adulterados. JSON reviver preserva o token numérico antes de perder precisão no Number, incluindo o centavo no limite seguro.

### Leitura

Cents são autoritativos. Campos históricos permanecem derivados: price="199.90", totalPrice="59.70". Totais Order/admin anteriormente Number passam a string exata, mudança documentada para consumidores externos. Frontend oficial usa apenas Cents para cálculo/formatação.

### Compatibilidade legada

Documento exato sem Cents é normalizado em memória, sem escrita e com moneyLegacy=true. Canonical existente válido vence remanescente antigo. Canonical inválido não cai no legado. Precisão >2, overflow ou pedido inconsistente é erro controlado; nenhum valor é inventado. Apply manual remove campos antigos; a compatibilidade só deve ser removida após cutover/migração operacional verificada.

## Campos históricos

installmmentPrice preserva a grafia original e ganha installmmentPriceCents. off é percentual e não foi convertido. Parcelamento permanece ilustrativo, sem promessa de 12 cobranças iguais. splitInstallments distribui resto determinístico, sem criar juros/gateway/política financeira; admin/seed armazenam primeira parcela ilustrativa. F001/F037 continuam abertos.

## Product

Create persiste somente Cents. Update humano usa o mesmo parser; update parcial conserva preço. Edição de legado exato grava canônico/remove decimal, sem adivinhar dados ambíguos. Read deriva campos históricos e sinaliza legado. Filtros price[gt/gte/lt/lte] mantêm boundaries humanos e comparação inteira, com fallback legado estrito sem double/round. Ordenação por preço não existia; createdAt/_id permanece. sort=price não foi inventado.

## Carrinho

Representação: priceCents e quantidade inteira. Subtotal: sumCents(multiplyCents(...)). LocalStorage novo inclui centavos; compatibilidade decimal é derivada. Ao carregar, legado válido converte; inválido fica visível/removível e bloqueia cálculo/checkout. Overflow agregado também bloqueia. Shipping impede acesso com carrinho inválido. BRL só na apresentação.

## Checkout/pedido

Fonte de preço: Product no servidor. Snapshot: priceCents. Subtotal: soma exata de linhas. Tax e shipping: zero em centavos, sem frete real. Total: subtotal+tax+shipping. Model valida invariantes antes de salvar. Pagamento permanece Pending, sem cobrança. Detail/list/admin usam centavos retornados. Harden apenas necessário da quantidade para cálculo; F012/F013 completos não foram iniciados.

## Migração

Script: ecommerce/backend/scripts/migrateMoneyToCents.js.
Dry-run: npm.cmd run migrate:money --prefix ecommerce.
Apply: npm.cmd run migrate:money --prefix ecommerce -- --apply --confirm-db NOME_EXATO.
Proteções: confirmação antes de conexão/escrita; scan/counts antes de writes; production exige também --allow-production; perfil central migration valida somente NODE_ENV/DB_URI; sem dump URI/secrets/PII; bloqueados intactos; CAS evita sobrescrever mudanças concorrentes; idempotente. F024 deve ser resolvido antes de aplicar em dados comerciais; não recomendamos production apply agora. Não existe migração no startup.

## Migration real

**NÃO EXECUTADA CONTRA O BANCO REAL. DRY-RUN/APPLY TESTADOS SOMENTE EM DATABASES TEMPORÁRIAS.**

## Arquivos criados

- docs/DINHEIRO.md
- docs/MIGRACAO_DINHEIRO_CENTAVOS.md
- ecommerce/backend/scripts/migrateMoneyToCents.js
- ecommerce/backend/utils/money.js
- ecommerce/backend/utils/moneyMigration.js
- ecommerce/frontend/src/utils/money.js
- ecommerce/shared/money.mjs
- ecommerce/tests/e2e/money.spec.js
- ecommerce/tests/money.test.js
- ecommerce/tests/moneyApi.test.js
- ecommerce/tests/moneyMigration.test.js
- docs/RELATORIO_FET_DATA_001.md

## Arquivos alterados

- COMANDOS.md
- README.md
- ROTAS.md
- docs/CONFIGURACAO.md
- docs/ESTADO_ATUAL_PROJETO_FETECH.md
- docs/PLANO_MELHORIAS_FETECH.md
- ecommerce/backend/app.js
- ecommerce/backend/config/runtimeConfig.js
- ecommerce/backend/controllers/orderController.js
- ecommerce/backend/controllers/productController.js
- ecommerce/backend/models/orderModel.js
- ecommerce/backend/models/productModel.js
- ecommerce/backend/scripts/seedProducts.js
- ecommerce/backend/utils/apiFeatures.js
- ecommerce/frontend/src/actions/cartAction.js
- ecommerce/frontend/src/component/Admin/Dashboard.jsx
- ecommerce/frontend/src/component/Cart/Cart.jsx
- ecommerce/frontend/src/component/Cart/CartItemCard.jsx
- ecommerce/frontend/src/component/Cart/Shipping.jsx
- ecommerce/frontend/src/component/Home/ProductCard.jsx
- ecommerce/frontend/src/component/Order/OrderDetails.jsx
- ecommerce/frontend/src/component/Order/Orders.jsx
- ecommerce/frontend/src/component/Product/ProductDetails.jsx
- ecommerce/frontend/src/store.js
- ecommerce/frontend/src/utils/format.js
- ecommerce/package.json
- ecommerce/tests/api.test.js
- ecommerce/tests/configSecurity.test.js

## Testes adicionados

- MONEY-01 parsing exato
- MONEY-02 parsing exato
- MONEY-03 parsing exato
- MONEY-04 parsing exato
- MONEY-05 três casas recusadas
- MONEY-06 0.1 + 0.2 = 30 centavos
- MONEY-07 entradas inválidas
- MONEY-08 negativos recusados
- MONEY-09 notação científica textual recusada
- MONEY-10 limite de parsing sem arredondar
- MONEY-11 multiplicação exata
- MONEY-12 multiplicação overflow
- MONEY-13 soma exata
- MONEY-14 soma overflow
- MONEY-15 formatter decimal exato
- MONEY-16 formatter BRL e limite seguros
- MONEY-17 valores clássicos
- MONEY-18 quantidade estrita
- MONEY-19 parcelas distribuem resto sem perder centavo
- MONEY-20 fonte canônica vence legado
- MONEY-21 centavos inválidos não caem no legado
- MONEY-22 invariantes de pedido
- MONEY-23 carrinho subtotal exato
- MONEY-24 carrinho legado válido convertido
- MONEY-25 carrinho legado inválido marcado removível
- MONEY-26 carrinho canônico vence preço legado
- MONEY-27 carrinho overflow é inválido
- MONEY-28 modelo rejeita coerção de centavos
- API-MONEY-01 create persiste somente centavos
- API-MONEY-02 precisão inválida não cria produto
- API-MONEY-03 update exato
- API-MONEY-04 update parcial mantém dinheiro
- API-MONEY-05 canônico cliente ignorado
- API-MONEY-06 resposta decimal derivada
- API-MONEY-07 filtro boundaries exatos
- API-MONEY-08 autoridade de preço e subtotal
- API-MONEY-09 snapshot persiste só cents
- API-MONEY-10 total ignora shipping/tax adulterados
- API-MONEY-11 invariante bloqueia persistência interna
- API-MONEY-12 produto legado 0.105 não cria pedido
- API-MONEY-13 totais retornados e agregado admin
- API-MONEY-14 pedido legado válido legível sem escrita
- API-MONEY-15 pedido legado inconsistente rejeitado
- API-MONEY-16 filtro legado estrito sem rounding
- API-MONEY-17 edição legada escreve canônico
- API-MONEY-18 científica do token JSON recusada
- API-MONEY-19 update inválido não altera cents
- API-MONEY-20 soma/multiplicação overflow recusada
- API-MONEY-21 CSRF continua obrigatório
- API-MONEY-22 zero comercial preservado
- API-MONEY-23 token JSON mantém centavo no limite seguro
- MIG-01 dry-run default não escreve
- MIG-02 apply converte campos reais
- MIG-03 precisão 0.105 bloqueada intacta
- MIG-04 pedido inconsistente não corrigido
- MIG-05 segunda execução idempotente
- MIG-06 apply sem confirmação aborta
- MIG-07 relatório omitindo PII e pagamento
- MIG-08 somente database temporária
- MIG-09 missing/overflow/invalid classificados
- MIG-10 canônico não é multiplicado de novo
- MIG-11 legado arbitrário Order bloqueado
- MIG-12 perfil central não exige serviços HTTP
- MIG-13 CLI argumentos seguros e dry-run
- MIG-14 resumo antes da primeira escrita
- MIG-15 mudança concorrente não é sobrescrita
- MIG-16 CLI real em subprocesso só com fixture

Novos E2E individuais:

- Catálogo/carrinho/checkout/pedido mantêm exatamente R$ 0,50; localStorage e snapshot conferidos em centavos.
- Carrinho legado válido converte; inválido fica removível e bloqueia checkout.
- Admin preserva 199.90, rejeita três casas e edita para 249.99 sem arredondar.

## Testes focados money

node --test ecommerce/tests/money.test.js: **28/28**, 677 ms.
node --test ecommerce/tests/moneyApi.test.js: **23/23**, 2,016 s.

## Testes de migration

node --test ecommerce/tests/moneyMigration.test.js: **16/16**, 1,231 s.

## API completa

npm.cmd test --prefix ecommerce: **373/373**, 27,485 s. Baseline 306 preservado e 67 novos casos. Nenhuma falha no resultado final.

## Build

npm.cmd run build --prefix ecommerce/frontend: **APROVADO**, 959 ms.

## E2E

npm.cmd run test:e2e --prefix ecommerce: **24/24**, 1,9 min, exit code 0. 21 casos anteriores e 3 novos, com checks de CSP/CSRF ativos.

## git diff --check

APROVADO.

## npm audit / dependências

NÃO executado: nenhuma dependência/lockfile mudou. package.json recebeu somente comando migrate:money; zero pacotes adicionados/atualizados. Baseline anterior audit zero; não usado como auditoria nova. Não houve audit fix.

## Probe F014 original após correção

Entrada 0.105: REJEITADA, HTTP 400. Invalid Product criado: NÃO. Teste API-MONEY-12 também comprovou que produto legado 0.105 não cria pedido.

## Probe cálculo

Preço humano 19.90 → 1990 Cents; quantidade 3; snapshot 1990; subtotal/total 5970; display R$ 59,70.

## Probe 0.1 + 0.2

10 + 20 = 30 centavos; display R$ 0,30. Sem 0.30000000000000004 na lógica.

## Probe tampering

Cliente enviou priceCents=1 e totalPriceCents=1. Preço do servidor: 1990. Snapshot usado: 1990; total 5970. Product canônico do cliente também ignorado.

## Probe migration dry-run

Database temporária fetech_money_probe_PID_TIMESTAMP. Products: 2 scanned, 1 migrável, 1 bloqueado; Orders: 2 scanned, 1 migrável, 1 bloqueado. Writes: ZERO em ambas as coleções.

## Probe migration apply temporário

Primeira execução: 1 Product e 1 Order convertidos; bloqueados intactos. Segunda: zero alterações, 1 já migrado em cada coleção. Idempotente: SIM.

## Documentos bloqueados por precisão/inconsistência

Probe combinado: 2, sendo 1 Product com precisão 0.105 e 1 Order com total incoerente. Testes separados também exercitam missing, invalid, overflow e mudança concorrente. Relatório nunca inclui PII.

## Banco utilizado

Bases temporárias fetech_routes_*, fetech_routes_auth_*, fetech_e2e_*, fetech_money_* e fetech_money_probe_*. Teardown guardado removeu as bases; arquivo de estado E2E ausente ao final. **BANCO REAL NÃO ALTERADO.**

## F006

**CONTINUA CORRIGIDO**: JWT revogável/tokenVersion/replay e troca/reset, comprovados pelos testes auth.

## F007

**CONTINUA CORRIGIDO**: cookie Secure production/HttpOnly/Lax/Path e proxy, suíte CC.

## F008

**CONTINUA CORRIGIDO**: sexta falha 429/Retry-After, limiter distribuído, suíte RL.

## F009

**CONTINUA CORRIGIDO**: resposta uniforme/timing/SMTP falho/limpeza/concorrência, suíte PR.

## F010

**CONTINUA CORRIGIDO**: último admin, autoações, lock e bootstrap, suíte adminSafety.

## F020

**CONTINUA CORRIGIDO**: CSRF/admin/product/Origin/Fetch Metadata/Helmet/CSP e logout POST; suíte HTTP e 24 E2E.

## F021

**CONTINUA CORRIGIDO**: JWT ausente de JSON, privado no-store, suíte privateResponse/auth/API.

## F036

**CONTINUA CORRIGIDO**: 46 CFG e novo perfil migration reutilizam parser central, fail-fast e errors sem secrets; arquitetura ajustada somente para novo entrypoint autorizado.

## Findings ainda abertos relacionados

F001 pagamento; F003 estoque concorrente; F004 atomicidade; F005 idempotência; F012 CEP/telefone strings; F013 checkout; F024 backup/restore; F027 frete; F028 refund; F037 coerência comercial. Nenhum serviço real SMTP/Cloudinary foi chamado. config.env não sobrescrito; nenhum secret real exposto/alterado.

## Documentação atualizada

DINHEIRO.md, MIGRACAO_DINHEIRO_CENTAVOS.md, este relatório, README.md, ROTAS.md, COMANDOS.md, CONFIGURACAO.md, ESTADO_ATUAL_PROJETO_FETECH.md e PLANO_MELHORIAS_FETECH.md.

## Auditoria histórica

**NÃO ALTERADA.**

## Alterações fora de escopo

NENHUMA. Rejeição de quantidade booleana/fração e overflow combinado foi limitada à fronteira monetária permitida pela task. CEP/telefone continuam contrato anterior; frete/pagamento/estoque/atomicidade/idempotência não foram implementados. Logs/probes locais ignorados em .local.

## Impacto de compatibilidade

Product/Order usam novos campos Cents; decimais antigos são somente strings de apresentação na API. Totais Order antes Number agora string exata; consumidores precisam acompanhar. Frontend oficial foi migrado integralmente. Dados legados exatos têm dual-read sem escrita; ambiguidades são sinalizadas, sem arredondamento. Atualizar aplicação/frontend juntos com plano operacional; migration antes de remover compatibilidade futura. Campos antigos não são dual-written nas novas persistências.

## Riscos residuais

Banco real ainda não migrado; backup/restore obrigatório antes de apply produtivo; históricos ambíguos exigem revisão humana; F037 comercial permanece; F012/F013 pendentes; payment/freight não implementados; stock/order atomicity permanece aberta. Migração tem CAS por documento, sem transação global. Manutenção de escrita/plano de rollback ainda precisam ser definidos no cutover real.

## Status da remediação

F014 / FET-P0-010: **CORRIGIDO NO CÓDIGO**.

## Próxima task recomendada

F012 + F013 — snapshot de entrega e validações de checkout, preservando CEP/telefone strings. **NÃO INICIADA AUTOMATICAMENTE.**
