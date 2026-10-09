# Testes FET-PRIVACY-001 — F030

## Isolamento e pré-fix

Início: main/2d31aa2, worktree limpo; F039 commitada. Node 24.19.0,
npm 11.17.0, MongoDB Server local 8.0.26; runner cria replica set, porta,
database e diretório próprios, guardando contra fetech/URI externa. Somente
provider de mídia/SMTP fake. Nenhum dump/restore ou download de Database Tools.

Test-first: privacyLifecycle inicial teve 1 aprovado e 2 falhas esperadas:
privacyStatus ausente e POST de solicitação retornando 404. Probe pré-fix
com grafo sintético confirmou DEACTIVATED com PII de perfil, Address, Order,
claim, review e avatar gerenciado ainda presentes; F016 é reversível e não
equivale a anonimização. Logs locais ignorados `.local/f030-prefix.log` e
`.local/f030-preprobe.log`; nenhuma falha foi convertida em skip.

## Cobertura dedicada

`privacyLifecycle.test.js`: estados/legado sem migration, tipo inválido no
Mongo falha fechado, mass assignment, concorrência de requests, body mínimo,
isolamento de usuário, DTO/no-store, auth/CSRF, limiter HMAC por conta,
cancelamento/re-solicitação, token após desativação, fila/admin/limites/filtros
e índices justificados.

`privacyAnonymization.test.js`: active/admin/sem sessão rejeitados, confirmação
exata, commit composto, tombstone sem mudança de identidade/createdAt,
alias UUID, bcrypt desconhecido/reset/versão, Address de outro owner,
comparação BSON de Order/ledger/claims/audit anterior, shipping retido,
review/agregados, cleanup fake, replay, JWT capturado/fabricado,
login/forgot sem email, reativação/update bloqueados, save/query/collection/
bulk/rename/pipeline sem restauração, novo cadastro sem reatar histórico,
rollback injetado em cinco participantes, execução concorrente, corrida com
reativação, escritor atrasado de Address/review, cancelamento e avatar default,
provider indisponível/PENDING, unmanaged/BLOCKED e referência compartilhada.

`privacyAudit.test.js`: snapshot exato de todas as coleções antes/depois,
zero chamadas de provider, nove códigos sem PII/HMAC no output, TTL existente,
buckets ativos preservados, registry/retention UNDEFINED, perfil mínimo F036
e CLI real no DB temporário rejeitando --apply antes de conectar.

`privacy.spec.js`: solicitação e sessão ativa, fila bloqueada para ACTIVE,
desativação fixture, confirmação forte, execução, JWT/login antigos rejeitados,
review pública com nome canônico e comentário preservado, auditoria sem PII;
cancelamento/reload/conta ativa sem cache persistente de privacidade.
Todos os requests de mutação verificam CSRF via harness existente.

## Comandos e resultados

Comandos executados na raiz (npm.cmd devido à política PowerShell local):

```powershell
node ecommerce/tests/runWithReplicaSet.js --test tests/privacyLifecycle.test.js tests/privacyAnonymization.test.js tests/privacyAudit.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
node ecommerce/tests/runWithReplicaSet.js node_modules/@playwright/test/cli.js test tests/e2e/privacy.spec.js
npm.cmd run ci:commercial --prefix ecommerce
git -c core.safecrlf=false diff --check
```

O comando focado de navegador acima é equivalente a rodar, a partir de ecommerce,
`node tests/runWithReplicaSet.js node_modules/@playwright/test/cli.js test tests/e2e/privacy.spec.js`;
esta última foi a forma executada. Não executar `node --test` diretamente sem
contexto RS proprietário: F039 exige identidade/base temporária do runner.

- Focados finais: **85/85 aprovados**, zero skips/todo, 15,112 s.
- Respostas privadas após ajuste da injeção: **35/35**, zero skips, 18,684 s.
- API integral preliminar: **1616 aprovados + 15 bloqueios F024 = 1631**,
  exit 0; gate final repete com todos os 85 casos finais e correção de tipos.
- API integral no gate final: **1633 aprovados + 15 bloqueios F024 = 1648**,
  exit 0; nenhum skip novo. Arquitetura **71/71**.
- Build direto: aprovado, exit 0.
- Build repetido pelo gate final: aprovado, 587 ms, exit 0.
- E2E integral preliminar: **59/59**, zero skips, 4,6 min, exit 0.
- Browser focado final após teardown: **2/2**, zero skips, 20,4 s, exit 0.
- E2E integral final após teardown: **59/59 aprovados**, zero skips, exit 0.
- **Commercial Gate final aprovado**, exit 0: repo safety/diff, arquitetura,
  API, build, E2E e audit. Backend/frontend: **zero vulnerabilidades** em ambos.
- Runners concluídos, nenhum test-run remanescente desta task; Mongo/API/Vite
  reais preservados. Logs locais finais `.local/f030-commercial-verified.log`,
  `.local/f030-focused-final.log`, `.local/f030-browser-focused-final.log`.
- Diff check: aprovado após normalizar linhas finais da documentação.

As quinze exceções são exatamente as já allowlisted de F024. Nenhuma nova
supressão, .only, todo, retry ampliado ou soft-fail. Sem alteração de pacote/
lock/dependência; package.json recebe audit:privacy, então audits de backend
e frontend são obrigatórios e estão incluídos no gate comercial.

## Probe pós-fix

Runner isolado executou `.local/f030-postprobe.cjs` (artefato local ignorado,
sem valores pessoais no output). Fixture real de teste: User, Address, Order,
StockMovement, OrderIdempotency, review, MediaUploadIntent/avatar fake e audit.
Desativação manteve PII; request REQUESTED; execução gerou tombstone, apagou
Address, mudou review.name, desvinculou avatar e registrou cleanup durável.

Busca por email/nome/endereço/telefone/URL sentinelas: **ausentes em User,
Address, display de review, logs e AuditEvent**. Orders/ledger/claims comparados
por BSON exato; todos os eventos antigos intactos. Order.shippingInfo ainda
contém sentinelas: **retido como histórico comercial, prazo UNDEFINED**.
Este resultado não representa eliminação total nem conformidade jurídica.

## Falhas intermediárias corrigidas

Enum de tipo único substituiu immutable incompatível com save/strict throw do
Mongoose; enum/required continuam impedindo outro tipo. Um teste usava accessor
incorreto de mailCount e outro nome incorreto de upsert: corrigidos os testes,
sem relaxar assertions. Fixture de privacyStatus array revelou cast de hidratação;
auth consulta tipo BSON válido antes de hidratar. Todas as falhas foram
reexecutadas e passaram. Avisos CRLF/NO_COLOR/npm e dynamic import preexistente
não foram tratados como erros nem escondidos.

Primeira tentativa do Commercial Gate interrompeu corretamente na suite API:
PRV-24 injetava erro na segunda chamada de findById. Auth passou a findOne
filtrado, portanto o teste não atingia mais o controlador /me. A injeção agora
atinge a chamada do controlador diretamente; 500/no-store/sem stack continuam
assertions obrigatórias. Reexecução focada 35/35 e repetição integral do gate.
Revisão final acrescentou escrita transacional no executor para conflito com
fencing/rebaixamento F010; os 85 casos passaram novamente após essa alteração.

A rodada seguinte do gate aprovou API/arquitetura/build e expôs três falhas E2E:
o novo teste de review pública deixava seu Product de estoque zero no catálogo
compartilhado, alterando contagens/seleção de fixtures antigas. Adicionado teardown
de exclusão do Product sintético ao finally do cenário; assertions antigas
preservadas, sem retry ampliado. Gate integral repetido após a correção.
