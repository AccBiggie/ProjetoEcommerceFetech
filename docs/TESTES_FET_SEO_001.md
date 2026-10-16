# Testes e evidências — FET-SEO-001 / F032

Data: 16/10/2026. Branch `main`, HEAD inicial/final
`af6c182453069dd76131ae8c54bd1cbe67df609e`. Worktree inicial limpo, F038 commitada.
Alterações SEO sem commit. Execução local, não validação de deployment/CI remoto.

## Comandos e resultados

| Comando factual | Resultado |
|---|---|
| `node --test ecommerce/tests/frontendSeo.test.js ecommerce/tests/frontendSeoArchitecture.test.js` | 10/10 aprovados; zero skips |
| `npm.cmd run test:e2e --prefix ecommerce -- seo.spec.js` | Versão final 6/6 aprovados; zero skips |
| `npm.cmd run ci:commercial --prefix ecommerce` — architecture | 154/154 aprovados, zero skips |
| `npm.cmd test --prefix ecommerce` via Commercial Gate | 1.827 aprovados + 15 skips F024 = 1.842 resultados; zero falhas |
| `npm.cmd run build --prefix ecommerce/frontend` via gate e execução focada | aprovado |
| `npm.cmd run audit:seo --prefix ecommerce/frontend` via gate e execução focada | 10 checks aprovados; READ_ONLY_OFFLINE; componentes produtivos bloqueados explicitamente |
| `npm.cmd run ci:bundle-budget --prefix ecommerce/frontend` via gate e execução focada | aprovado sem alterar budgets |
| `npm.cmd run test:e2e --prefix ecommerce` via gate | 90/90 aprovados em 7,7 min; zero skips/retries/falhas |
| `npm.cmd run ci:commercial --prefix ecommerce` | APROVADO na execução final, todos os estágios |
| `git diff --check` | aprovado |
| `npm.cmd audit --prefix ecommerce` via gate (`--audit-level=high`) | zero vulnerabilidades |
| `npm.cmd audit --prefix ecommerce/frontend` via gate (`--audit-level=high`) | zero vulnerabilidades |

Os comandos API/build/budget/E2E/audits são executados de fato pelos estágios do
Commercial Gate; não foram repetidos integralmente após aprovação sem motivo.
O gate roda API com concorrência 4 e E2E com 1 worker/zero retries, sem redução
de cobertura ou relaxamento de limites para SEO.

## Bundle F038

Métricas raw/gzip do auditor do repositório (gzip determinístico):

| Métrica | Medido | Limite preservado |
|---|---:|---:|
| Initial JS raw | 653367 | 680814 |
| Initial JS gzip | 215357 | 218809 |
| Entry gzip | 95605 | 98482 |
| Initial CSS raw/gzip | 1706 / 830 | 1792 / 872 |
| Maior rota/lazy gzip | 11270 | 11823 |
| Dashboard gzip | 5724 | 6009 |
| Initial chunks | 11 | 13 |
| Total JS chunks | 42 | 48 |
| Hero raw | 88358 | 100000 |

Não houve mudança de limites ou antecipação de rotas privadas/admin no bundle
inicial. Warning preexistente de import dinâmico/estático de store continua; não
é falha de build nem evidência de regressão. Sem medição de CWV em produção.

## Probe obrigatório: HTML inicial sem React

Leitura direta de `frontend/build/index.html`, confirmada por GET profundo do
servidor E2E sem executar React (`request.get`):

| Campo | Recebido |
|---|---|
| Title | Loja Fetech \| Entre já para o mundo gamer |
| Description | Loja Fetech de hardware e tecnologia |
| Canonical | ausente |
| OG | ausente |
| Metadata específica de produto | NÃO |
| JSON-LD | ausente |
| Idioma | pt-BR |

O host E2E retornou HTTP 200 no fallback profundo. Isso mede o host de teste,
não estabelece comportamento HTTP do futuro hosting de produção.

## Probes no navegador

- Produto A → B: título/nome/schema mudam para dados da fixture correspondente;
  Offer BRL compara com centavos persistidos, Stock define availability.
- Produto → Home → Admin → Produto: schema não permanece em Home/Admin, title
  muda, robots privado é noindex e não sobram canonical/OG antigos. Uma tag por chave.
- Produto → Login: cenário adicional incluído no gate completo; testa remoção de
  JSON-LD/canonical/OG e título/robots de autenticação.
- Conta/privacidade/endereços/carrinho/entrega/reset: noindex, sem canonical/schema,
  sem e-mail/nome da fixture ou token sentinela no head.
- Busca, categoria e página: noindex sem termo arbitrário copiado para o head.
- URL inexistente/produto removido: noindex sem JSON-LD; título coerente.
- Strict Mode em React de desenvolvimento, harness isolado: efeito executa duas
  vezes e head continua único. Import dinâmico do harness mantém isolamento F031.
- Lazy/Suspense: chunk de produto retido por promise controlada no teste; fallback
  visível não publica schema incompleto e resolve para metadata correta.
- Axe executado sem supressões no produto, produto indisponível e login, além da
  suíte permanente F033. Nenhuma certificação WCAG integral é alegada.

## Origem, schema e segurança

Testes puros usam apenas domínio reservado `catalog.example.com`, nunca origem
real. Canonical de produto tem ID real da fixture e remove tracking/query/hash;
origem arbitrária na query não altera a base autorizada. Origem inválida retorna
null. HTTPS absoluta de imagem é mantida; relativa exige origem validada.
Sem origem configurada no build testado: canonical/og:url ausentes; isso é esperado.
Não é alias para origem runtime do navegador.

Fixtures testam priceCents=319960 → `3199.60`, priceCents=1 → `0.01`, Stock 2/0,
rating válido/zero/negativo/NaN/fora da escala e ausência de campos inventados.
JSON.parse do texto serializado recupera dados sem permitir `</script>` breakout;
limite Unicode não corta pares substitutos de emoji.

## robots, sitemap e auditoria offline

robots permite crawl de noindex e não anuncia sitemap fictício. Arquivo está no
build; entrega e headers públicos reais não medidos. Sitemap:
`BLOCKED_BY_DEPLOYMENT`; componentes produtivos: `BLOCKED_BY_F023`.
Sem fonte integral/delivery/domínio, nenhum gerador/fonte falsa é apresentado.
Auditoria lê apenas build e política versionada: nenhuma rede, banco ou credencial.

## Ajustes encontrados durante validação

Primeiro startup E2E falhou ao compilar o novo harness StrictSeo por resolução de
react-router a partir do diretório de testes. Corrigido com alias no builder
exclusivo do harness; reexecução focada 5/5 aprovada.
Primeiro estágio architecture detectou serialização JSON fora de storage.
Exceção agora permite somente JSON.stringify no helper SEO público; JSON.parse
e acesso a local/sessionStorage continuam proibidos ali. Reexecução 154/154.
Primeiro E2E completo: 89/90, com falha na expectativa do novo teste lazy durante
transição SPA. React conserva a página anterior em transições pendentes; o teste
foi corrigido para medir fallback no acesso direto profundo e continuar verificando
Product → Login. Nenhuma mudança no código de produção foi necessária para isso.
Reexecução focada: 6/6. Reexecução final integral do Commercial Gate: API
1.827 aprovados/15 F024, architecture 154/154, E2E 90/90, build/budget/SEO/audits
aprovados. Os seis cenários SEO passaram também dentro da suíte completa.
Não foram criados skips, retries, budgets maiores ou mudanças no backend para passar.

## Preservação operacional

Runner F039 cria replica set e bancos temporários em portas dinâmicas; não usa
`fetech` nem serviços locais do usuário. SMTP e mídia são provedores falsos locais.
Banco real **NÃO ALTERADO**; SMTP/Cloudinary reais **NÃO CHAMADOS**; índices
comerciais **NÃO APLICADOS**; config.env e auditoria histórica preservados.

SHA-256 do gerador histórico antes/depois:
`09E1191860580C7614058016B5731B8254A1B5098FF4DCED665644C6AAA7B8D4`.
15 skips são exclusivamente os bloqueios existentes F024 mongodump/mongorestore,
sem instalar Tools ou afirmar restore validado. Nenhum skip SEO/E2E permitido.

F024/F026 parciais, F029 aberto e F039 remoto pendente. F030/F033 baselines técnicos;
F038/F040 corrigidos no código; SMTP real não validado. F001/F027 não iniciados.
Status SEO permanece parcial por F023, mesmo com testes locais verdes.
