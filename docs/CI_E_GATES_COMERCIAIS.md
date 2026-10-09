# CI e gates comerciais — FET-CI-001

F039: **CORRIGIDO NO CÓDIGO / VALIDAÇÃO REMOTA PENDENTE**.
F026: **PARCIAL** — CI implementado; CD/target produtivo ainda pendente.
Enforcement remoto: **NÃO VALIDADO / DESCONHECIDO**. Nenhum push, run remoto
ou alteração de branch protection foi realizado nesta task.

## Inventário e contrato

O remote origin é GitHub, `AccBiggie/ProjetoEcommerceFetech`. Não havia pipeline
de CI. A branch encontrada foi `main`, HEAD `2d51203020c5015b374070c14261b08670599e2b`,
worktree inicialmente limpo. F022 já estava commitada; as referências anteriores
a F022 sem commit foram superadas. Não há lint/formatter/TypeScript configurados:
nenhum comando fictício foi adicionado.

[Workflow](../.github/workflows/ci.yml): documento JSON válido em YAML 1.2, disparado
por pull_request e push em main. Node **24.19.0**, Ubuntu **24.04**, MongoDB Server
**8.0.26**. Actions checkout/setup-node/upload-artifact fixadas em SHA completo;
checkout sem persistir credenciais, fetch-depth=0. Permissões `contents: read`.
Lockfiles separados do backend e frontend, ambos instalados com `npm ci`.
Cache somente npm; não armazena node_modules, config.env, banco ou estado de teste.
PRs cancelam runs anteriores do mesmo PR; pushes em main usam SHA próprio.

| Job | Gate | Timeout |
|---|---|---|
| repository | arquivos versionados/indexados, foco/skip via AST, diff do patch | 30 min |
| architecture | assertions existentes de arquitetura e testes dos gates | 30 min |
| api | suite integral no replica set temporário, reporter obrigatório | 30 min |
| build | build real do frontend | 30 min |
| e2e | build do host temporário + Chromium do Playwright instalado pelo lockfile + suite integral | 30 min |
| audit | npm audit backend e frontend; high/critical ou erro de rede reprovam | 30 min |
| **Commercial Gate** | always; exige success de todos os seis jobs | 5 min |

Não há continue-on-error nem soft fail. API completa executa uma vez por run
remoto. E2E faz seu próprio build para manter os jobs independentes; não depende
de um artefato de outra execução. Artefatos somente em falha E2E: screenshots,
traces e relatório, retenção sete dias, sem .local, env, URI ou state.json.

## Mongo e configuração

O instalador CI baixa do domínio oficial apenas o tarball do Server, verifica
SHA-256 fixado e extrai **somente mongod**. Não instala mongodump/mongorestore.
O runner reutiliza `replicaSetHarness`, inicia mongod próprio em 127.0.0.1 e porta
efêmera, replica set `fetech_test_rs`, diretório `.local/test-mongo-rs-*`.
Testes comprovam transação real e dois replica sets simultâneos independentes.

Antes de criar arquivos/processos/conexões, o runner recusa DB_URI/MONGO_URI/
MONGODB_URI/FETECH_TEST_MONGO_BASE recebidas e DB_NAME comercial, inclusive
`fetech`. Gera identidade aleatória de 128 bits. `testUri` exige essa identidade,
host loopback, porta efêmera, database base admin e replicaSet exato; recusa
credenciais, 27017/27018 e nomes fora de `fetech_<prefixo>_<pid>_<timestamp>`.
NODE_ENV=test sozinho não permite conexão/cleanup.

E2E exige diretório criado pelo runner `.local/test-run-*`, origin loopback em
porta efêmera e state.json nesse diretório. Estado e build do harness de storage
não se sobrepõem entre runs. As fixtures e teardown validam o nome e a URI contra
o replica set da execução antes de mutar ou remover dados. O mongod inteiro é
temporário e encerra no finally, inclusive em falhas. Cleanup de diretórios exige
parent/prefixo exatos. Interrupção encerra somente a árvore de processos criada
pelo runner (grupo no Linux, PID próprio com /T no Windows). Jobs têm timeout;
runner tem limite de vinte minutos, subprocessos dos gates vinte e cinco.

F036 continua centralizando configuração. `loadEnvironment` não chama dotenv
quando há identidade de teste válida; CI sem identidade falha antes de ler
config.env. Não há cópia/leitura do config.env comercial no pipeline. Fixtures
usam JWT aleatório, SMTP fake e Cloudinary fake; pagamento e frete reais não
são exigidos. Não há seed, migration, repair, syncIndexes ou audit no fetech.
Índices/transações/fixtures da suite continuam restritos às databases temporárias.

## Skips, foco e arquitetura

[Allowlist explícita](../ecommerce/scripts/ci/policy.js): quinze nomes de
`tests/backupRestore.test.js`, motivo literal
`MongoDB Database Tools ausentes: restore real bloqueado.`
O reporter coleta file/name/skip/todo/failure, exige resumo final bem sucedido e
cobertura de todos os arquivos *.test.js. Não fixa a quantidade total de passes.
Somente zero skips (Tools realmente disponíveis) ou os quinze bloqueios exatos
são aceitos; skip parcial, duplicado, inesperado ou todo reprova. Não transforma
F024 em corrigido. No ambiente atual e no CI, Tools não são instaladas.

E2E exige todos os casos passed/expectedStatus=passed, zero skips e zero retries;
forbidOnly=true. O scanner de AST rejeita .only, chamadas skip/todo/fixme/fail e
opções de foco/skip, incluindo aliases conhecidos, sem interpretar fixtures e
comentários como execução. Única chamada de skip permitida é a de F024 no
arquivo/motivo exatos, ainda confrontada com o relatório runtime.

Assertions de Order/User sem exclusão física, Cloudinary fora de controllers e
pagamento/estoque fora da transição foram movidas, preservadas, para
backendArchitecture.test.js. frontendStorageArchitecture continua protegendo
parser central e ausência de storage.clear. Arquitetura também executa emissão
real de JSON/cookie com JWT fake e rejeição de mass assignment pelo Product
domain. A suite integral mantém as provas transacionais, ownership, guards
físicos, cookies, lifecycle, idempotência, snapshots e concorrência.

## Repository safety e diff

O scanner lê a lista do índice Git, rejeita env reais, chaves/certificados,
backups/manifests/partials, artefatos Mongo e outputs privados/gerados.
Examples só são aceitos com placeholders reconhecidos ou URI local de exemplo;
seu conteúdo staged e working copy é verificado sem imprimir valores. Isso é
uma barreira estrutural, não um substituto de uma ferramenta completa de secret
scanning. Os testes usam índices/repositórios temporários; não alteram o índice
do projeto. Test sources novos também são analisados antes de staging local.

Em PR: merge-base(base.sha, HEAD)..HEAD. Em push: before..HEAD. Before zero usa
HEAD^ ou empty tree no primeiro commit. Hash inválido, objeto ausente ou diff
com whitespace reprovam. Localmente: git diff --check HEAD; mantém também a
verificação direta git diff --check. Não se confunde worktree limpo com patch
limpo em CI. Nenhuma interpolação de evento vira comando shell.

## Comandos oficiais

Na raiz, PowerShell (`npm` no Linux):

```powershell
npm.cmd ci --prefix ecommerce
npm.cmd ci --prefix ecommerce/frontend
npm.cmd run ci:commercial --prefix ecommerce
npm.cmd run ci:repo-safety --prefix ecommerce
npm.cmd run ci:architecture --prefix ecommerce
npm.cmd run ci:api --prefix ecommerce
npm.cmd run ci:build --prefix ecommerce
npm.cmd run ci:e2e --prefix ecommerce
npm.cmd run ci:audit --prefix ecommerce
```

Localmente, mongod deve existir em .local/mongod.exe no Windows, PATH no Linux
ou FETECH_TEST_MONGOD. Browser Windows default msedge; CI instala somente Chromium.
ci:e2e requer build já aprovado; ci:commercial executa a ordem completa, encerrando
no primeiro erro. Nenhum audit fix, suppressão de high/critical ou fallback verde
em falha de rede. Dependências novas: **nenhuma**. O parser Babel existente é
resolvido do frontend instalado pelo lockfile; os gates locais precisam de ambos
os npm ci. Não há formatter/lint inventado.

## Ativação remota e proteção de main

Depois de revisão/autorização para publicar as alterações, validar um PR/run real.
Em Settings > Rules/Branches, configurar main com PR obrigatório e status check
**Commercial Gate** obrigatório, restringir bypass conforme regra da equipe e
exigir branch atualizada se apropriado. Conferir nome e origem do check após o
primeiro run. [Documentação oficial de proteção de branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Esta configuração é manual e **não foi aplicada ou verificada** nesta task.
Workflow codificado não comprova bloqueio de merge. Não habilitar deploy como
consequência automática deste gate: F026/CD precisa de target e plano próprios.
F024 restore validado e índices F022/F037 continuam pré-requisitos comerciais;
F023 infraestrutura continua necessária. F029/F030 abertos, F001/F027 adiados.

Fontes de versões/supply chain: [actions/checkout](https://github.com/actions/checkout),
[actions/setup-node](https://github.com/actions/setup-node),
[actions/upload-artifact](https://github.com/actions/upload-artifact),
[MongoDB Server Ubuntu tarball](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu-tarball/).
# Gate F030 — privacidade

privacyLifecycle, privacyAnonymization, privacyAudit e privacy.spec participam
das suites obrigatórias, sem skips novos. Banco comercial, providers e migrations
reais são proibidos nesta validação. F030 implementa baseline técnico; prazos
formais de retenção permanecem UNDEFINED. F039 remoto/branch protection continuam
não validados, F026/CD parcial e F024 mantém os quinze bloqueios existentes.
[Contrato](PRIVACIDADE_E_RETENCAO.md).
