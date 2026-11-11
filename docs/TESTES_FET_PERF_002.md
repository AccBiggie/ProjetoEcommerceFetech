# Testes — FET-PERF-002 / F038

## Comandos

```powershell
node --test ecommerce/tests/frontendPerformanceArchitecture.test.js
node --test ecommerce/tests/frontendBundleBudget.test.js
node --test ecommerce/tests/frontendPaginationStale.test.js
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run audit:bundle --prefix ecommerce/frontend
npm.cmd run ci:bundle-budget --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce -- frontendPerformance.spec.js
npm.cmd run ci:commercial --prefix ecommerce
git -c core.safecrlf=false diff --check
```

Commercial Gate invoca integralmente arquitetura, `npm test`, build/budget,
`npm run test:e2e` e audits de ambos os pacotes, além de repository safety.
Não precisa repetir o build entre budget e E2E locais. Harness F039 fornece
replica set, DBs/portas/diretórios temporários e providers fake. Nenhum teste
abaixo depende de `dist/build` para a unidade: parser usa fixtures sintéticas.
Browser exige build real com manifest/proveniência. Usa Edge já instalado no
Windows; nenhum browser/Database Tools novo foi baixado.

## Arquitetura e leituras — oito casos

1. Admin ausente dos imports estáticos do router.
2. AuditTrail/PrivacyRequests têm dynamic imports literais e Suspense local.
3. Busca permanece submit, sem TextField amplo no shell.
4. Budget está no estágio build e testes no gate permanente.
5. Thunks reais de lista/detalhe usam helper e guards de identidade.
6. Replay/remount idêntico compartilha pending; request concluído pode ser refeito.
7. Mudança de chave aborta antiga e somente resposta atual é publicada.
8. Falha permite retry; dispatch/owner diferente não compartilha request.

## Parser/budget — dezoito casos

1. Entry reconhecido pelo manifest, sem depender de hash.
2. Raw UTF-8 e gzip determinístico real.
3. Bootstrap App dinâmico conta como initial; Admin conta como lazy.
4. Shared deduplicado e CSS separado.
5. Auditor não modifica os artefatos.
6. Budget dentro do limite aprova.
7. Limite menor de initialJsGzip reprova.
8. Limite menor de entryJsGzip reprova.
9. Limite menor de largestRouteGzip reprova.
10. Limite menor de initialCssRaw reprova.
11. Admin escondido em shared initial é detectado pela proveniência.
12. Rota lazy obrigatória retirada reprova.
13. index.html ausente falha fechado.
14. App do bootstrap ausente falha fechado.
15. Dependência compartilhada ausente falha fechado.
16. Proveniência initial ausente falha fechado.
17. Budget vazio/inválido falha fechado.
18. Path traversal de asset é recusado.

## Browser — nove casos

1. Home 360px: recursos JS/API/imagens, nenhum módulo admin, um GET products,
   hero eager/high única, lazy/async/alt/altura dos cards, axe zero, LCP/CLS lab.
2. Mesmas verificações em 1440px.
3. Home admin autenticada não baixa painel; navegação baixa Dashboard somente
   agora; abas audit/privacy baixadas somente quando abertas; um GET products,
   dois GET users (aba + filtro), nenhum GET orders; foco/title/axe preservados.
4. Chunk login atrasado: fallback status com h1, shell/main preservados, axe
   zero; após load title correto e navegação/back/forward mantêm foco; sem Admin.
5. Produto: único GET de detalhe, chunk sem Admin, primeira imagem eager e
   segunda lazy em fixture de galeria local, async/alt, foco e axe zero.
6. Orders: chunk cliente somente ao navegar, um GET página 1, sem Admin,
   foco/title/axe corretos.
7. Imagem de card bloqueada: altura do container igual antes/depois do download.
8. StrictMode real em harness React dev: efeito duas vezes e um GET por
   catálogo/detalhe; sem mutations.
9. Chunk com erro simulado apenas pelo Playwright: recuperação F031, foco/axe,
   storage local/session preservado e nenhum erro uncaught.

Cada caso instala checagens CSRF/CSP. Console errors inesperados, pageerror,
warnings React de keys e requests externos falham o teste. 401 anônimo esperado
é a única mensagem de recurso HTTP filtrada. Não há skip/retry/fail esperado.
Bytes e grafo são gates; nenhum LCP/CLS/tempo/score é limiar de aprovação.

## Thunks reais — seis casos (quatro novos)

1. Sucesso antigo do catálogo ignorado quando o transporte ignora abort.
2. Erro antigo do catálogo ignorado mesmo cenário.
3. Replay pendente de catálogo compartilha request; conclusão permite refetch.
4. Replay pendente de detalhe compartilha request; conclusão permite refetch.
5. Sucesso antigo de detalhe não sobrescreve o atual.
6. Erro antigo de detalhe não substitui sucesso atual.

O harness existente injeta Axios/constantes e agora importa latestRead real.
Espera um microtask para iniciar o transporte antigo antes de trocar chave,
mantendo a asserção forte de resposta ignorada mesmo sem abort efetivo.
Esse ajuste foi necessário após o gate inicial revelar a dependência nova
não resolvida no harness que remove imports; não houve bypass de guard.

## Regressões existentes exigidas

`accessibility.spec.js`: 15 casos axe/semântica/teclado/contraste/reflow,
incluindo privacy/admin/checkout. `pagination.spec.js`: seis casos de página
ativa de catálogo/admin/orders e resposta antiga descartada. Todos no E2E
completo. `orderIdempotency.spec.js`: duplo submit, perda de resposta, reload e
replay F005 mantêm um pedido; `frontendStorage.spec.js` mantém tentativa/carrinho
e recovery F031. Demais suítes cobrem F009/F016/F018/F019/F030/F037/F040.

Probe pré-fix: um teste temporário leu Home 360/1440 e dashboard no host isolado;
arquivo temporário removido após registrar [rede anterior](PERF_REDE_ANTES.json).
Um primeiro ensaio de instrumento falhou porque login via request não atualiza
Redux sem boot; o probe foi corrigido, sem mudança no produto, e passou.
Durante implementação, o teste de chunk atrasado revelou `page-has-heading-one`
moderate no fallback existente. Loader de página recebeu h1 transitório; foco
ignora esse heading e aguarda o definitivo. Sem suppression axe.

Resultados finais, valores de rede/lab e comandos executados estão no
[relatório](RELATORIO_FET_PERF_002.md). F024 mantém somente os quinze skips
mongodump/mongorestore autorizados; E2E exige zero skips.

## Isolamento final do harness Strict Mode

`storageHarness/main.jsx` importa StrictRead dinamicamente somente no cenário
`strict-read`. O módulo separado inicializa Provider/store e os thunks reais;
o entry de recovery nunca importa store. O primeiro E2E integral expôs a
normalização indevida de storage no harness quando a store era importada
estaticamente. Após isolamento, o focused **13/13** passou: nove casos de
performance e quatro de recovery, inclusive preservação byte a byte de dados
legados no reset seletivo. O backend/armazenamento de produção permaneceu intacto.
