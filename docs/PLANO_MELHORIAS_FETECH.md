# Plano de melhorias Fetech

Este documento acompanha remediações posteriores à auditoria. Não altera
os achados históricos nem transforma a correção de um finding em aprovação
geral para produção. Não iniciar outra task automaticamente.

## F006 / FET-P0-006 — Revogação de sessão JWT

**Status: CORRIGIDO.** Task FET-SEC-001, prioridade P0, concluída em 07/10/2026.

Branch: `main`.
HEAD base da implementação e validação: `37d6093fa913bd95d845be1f6f0f52489dff63fe`.
Commit da remediação: o commit que adiciona este documento e a implementação
FET-SEC-001; consulte `git log --diff-filter=A -- docs/PLANO_MELHORIAS_FETECH.md`.
O hash acima identifica a base auditada, não o commit contendo a correção.

### Finding original e reprodução antes da correção

JWT antigo continuava válido após logout, troca e reset de senha. No HEAD
inicial, `getJWTToken()` assinava somente o ID e o middleware não verificava
estado de revogação. Logout apenas apagava o cookie. Alterar a senha não
invalida criptograficamente uma assinatura JWT já emitida.

Reprodução em servidor isolado, SMTP mockado e banco temporário:

| Cenário | JWT antes | Replay do JWT anterior após evento |
| --- | --- | --- |
| Logout | `/me` 200 | `/me` 200 |
| Troca de senha | Sessão válida | `/me` 200 |
| Reset | Sessão válida | `/me` 200 |

Test-first: os primeiros 26 testes permanentes foram executados antes de
alterar o backend. Resultado: **5 aprovados, 21 falhas, zero skips**, em
9,118 s. As expectativas 401 foram mantidas. Dois testes adicionais cobrem
concorrência durante a persistência de senha.

### Estratégia implementada

`User.tokenVersion` persistido, default zero, é incluído em todos os JWTs
emitidos por `getJWTToken()`. O middleware compara estritamente o claim com
o usuário atual. Claim ausente, versão inválida/divergente, JWT expirado,
assinatura inválida e usuário removido retornam 401 com mensagem genérica.

Eventos de revogação: logout, alteração autenticada de senha e reset.
Logout usa update condicional e `$inc` atômico, sem exigir middleware que
impediria limpar cookies inválidos. Somente a versão ainda corrente pode
alterar o documento. Replay de logout antigo preserva a sessão nova; duas
chamadas simultâneas incrementam somente uma vez.

Troca/reset preservam bcrypt e salvam senha/versão na mesma escrita do User,
condicionada à versão lida. Reset limpa hash/expiração e condiciona também
ao token original ainda válido. Uma revogação concorrente impede o save
desatualizado de restaurar versões. Login e mudança de role não incrementam.
Cadastro/perfil/admin ignoram o campo no input.

### Compatibilidade e deploy

Usuários antigos sem campo persistido usam default zero do Mongoose.
Login funciona sem correção manual; logout e save posterior persistem o
campo. Não foi criada migration, coleção Session ou dependência nova.

**JWTs emitidos antes da implementação serão invalidados e usuários
autenticados anteriormente precisarão fazer login novamente.** É um logout
global intencional após o deploy, sem fallback para JWT sem versão.
Reiniciar todos os processos da API é necessário para carregar o código.
Os processos locais anteriormente iniciados não foram reiniciados nesta
task, pois a execução da correção e seus testes usaram somente bases isoladas.

### Testes permanentes adicionados

Arquivo: `ecommerce/tests/auth.test.js`, com infraestrutura em
`ecommerce/tests/authHarness.js`.

| ID | Cenário |
| --- | --- |
| TEST-01 | JWT atual autentica, versão inicial zero e login não incrementa. |
| TEST-02 | JWT legado sem versão retorna 401. |
| TEST-03 | Versão divergente retorna 401. |
| TEST-04 | Logout revoga cópia manual do cookie anterior. |
| TEST-05 | Logout expira cookie HttpOnly. |
| TEST-06 | Novo login após logout autentica na nova versão. |
| TEST-07 | Replay de logout antigo não derruba sessão nova. |
| TEST-08 | Dois logouts simultâneos incrementam exatamente uma vez. |
| TEST-09 | Troca de senha revoga JWT antigo e valida o novo. |
| TEST-10 | Senha antiga falha e senha nova permite login. |
| TEST-11 | Reset revoga JWT anterior. |
| TEST-12 | Sessão pós-reset e novo login funcionam. |
| TEST-13 | Reset single-use e limpeza do hash/expiração. |
| TEST-14 | Conta removida retorna 401; logout permanece seguro. |
| TEST-15 | Role persistida remove acesso admin com 403 sem revogar autenticação. |
| TEST-16 | Cadastro ignora tokenVersion enviado pelo cliente. |
| TEST-17 | Atualização de perfil ignora tokenVersion do cliente. |
| TEST-18 | Atualização administrativa ignora tokenVersion do cliente. |
| TEST-19 | Expiração, assinatura inválida e token legado usam mensagem genérica. |
| TEST-20 | Versões com tipos/valores inválidos e ID inválido são rejeitadas. |
| TEST-21 | Logout sem sessão, inválido, expirado, legado ou divergente não incrementa. |
| TEST-22 | Logout revoga todas as sessões da versão corrente. |
| TEST-23 | Login legado e logout concorrente sem campo persistido. |
| TEST-24 | Troca/reset de usuário legado persistem senha e versão. |
| TEST-25 | Senha rejeitada não incrementa versão nem revoga sessão. |
| TEST-26 | Recuperação preserva SHA-256, expiração e limpeza na falha SMTP. |
| TEST-27 | Save de senha iniciado antes de logouts não restaura versão antiga. |
| TEST-28 | Trocas simultâneas de senha têm apenas um save/sessão vencedor. |

Os 13 grupos anteriores permanecem na suíte completa. O helper antigo agora
captura o cookie novo após troca/reset e comprova 401 usando o anterior;
após logout faz novo login para os testes independentes subsequentes.
Mensagens de falha não incluem corpos contendo JWT ou URL de recuperação.
Nenhum teste foi removido, ignorado ou teve expectativa de segurança relaxada.

### Validação final

| Comando | Resultado | Duração disponível |
| --- | --- | --- |
| `node --test ecommerce/tests/auth.test.js` | 28/28 aprovados; zero falhas/skips | 12,677 s |
| `npm.cmd test --prefix ecommerce` | 41/41 aprovados; zero falhas/skips | 9,518 s |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado | Vite: 2,98 s |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19 aprovados | Playwright: 1,9 min |

### Probes pós-correção

Script isolado local, sem emissão externa de e-mails; somente status e
versões foram registrados, sem cookies, JWTs, secrets ou senhas reais.

| Probe | Resultado |
| --- | --- |
| A — Logout | `/me` antes 200; replay após logout 401. |
| B — Troca de senha | JWT antigo 401; JWT novo 200. |
| C — Reset | JWT antigo 401; JWT novo 200. |
| D — Replay de logout antigo | JWT novo permanece 200. |
| E — Logout simultâneo | Versão inicial 0; final 1, sem incremento duplo. |

### Isolamento e escopo

Bases `fetech_routes_auth_<pid>_<timestamp>`, `fetech_routes_*` e
`fetech_e2e_*`, com teardown. **BANCO REAL NÃO ALTERADO.** Configuração real
não foi sobrescrita e nenhum secret/JWT/cookie real foi registrado.
O relatório histórico da auditoria não foi editado.

Alterações funcionais fora de escopo: **NENHUMA**. Frontend, contratos de
pedido/estoque, método GET de logout e opções de cookie foram preservados.
`ecommerce/package.json` só amplia o runner para incluir o novo arquivo de
testes; nenhuma dependência ou lockfile foi alterado.

### Riscos residuais e próxima task

Logout invalida globalmente todas as sessões da versão corrente. Sessões
individuais por dispositivo não existem. Rate limiting, MFA, cookie Secure,
hardening HTTP/CSRF e retirada do JWT do JSON continuam pendentes.
O limite terminal de inteiro seguro falha fechado; não há overflow silencioso.

Próxima task recomendada: **F008 / FET-P0-008 — proteção contra brute force
e rate limiting de autenticação e recuperação**. Não iniciada.

Documentação atualizada: `README.md`, `ROTAS.md`,
`docs/ESTADO_ATUAL_PROJETO_FETECH.md` e `docs/AUTENTICACAO.md`.

## F008 / FET-P0-008 — Rate limiting

**Status: CORRIGIDO.** Task FET-SEC-002, prioridade P0, concluída em 07/10/2026.
Branch `main`; HEAD inicial `92e83494cfd7e8899fe353fa420d17a9efcc2a44`, worktree
inicial limpo. A implementação permanece no worktree, sem novo commit.

### Finding e reprodução

Login e recuperação permitiam tentativas ilimitadas. Em servidor e banco
temporários, foram executadas **12 tentativas inválidas consecutivas**:
**12 respostas 401, zero 429**, em aproximadamente **1,020 s**. Nenhuma senha,
conta real, cookie, JWT ou segredo foi registrado.

Test-first: os primeiros 28 testes foram adicionados antes de alterar o
backend; **5 passaram e 23 falharam**, em 13,662 s, sem skip. Depois foram
adicionados cenários complementares de falha parcial, índice e normalização.
O cenário de formato alternativo de e-mail também foi executado vermelho
antes da correção: retornava 401 quando deveria compartilhar o bloqueio 429.
Nenhuma expectativa de segurança foi relaxada.

### Solução e políticas

Rate limiting distribuído persistido em MongoDB, sem Redis ou dependência
nova. Model `AuthRateLimit`, coleção `authratelimits`, campos `_id` (HMAC),
`scope`, `count`, `pending`, `windowStartedAt`, `expiresAt`. Índices: `_id_`
único e `expiresAt_1` TTL (`expireAfterSeconds: 0`). A API prepara o índice
antes de abrir a porta; acesso principal usa `_id`, sem collection scan.

| Scope | Limite | Janela |
| --- | --- | --- |
| Login conta+IP | 5 falhas | 15 min |
| Login conta global | 20 falhas | 15 min |
| Login IP | 50 falhas | 15 min |
| Recuperação conta | 5 requisições | 15 min |
| Recuperação IP | 10 requisições | 15 min |
| Reset IP | 10 requisições | 15 min |
| Cadastro IP | 10 tentativas | 60 min |

Políticas em `backend/config/authRateLimits.js`. Contas existentes e
inexistentes têm a mesma derivação de chave, sem consulta prévia ao User.
Normalização acompanha os controllers existentes, com trim/lowercase.
Chaves HMAC-SHA256 usam a JWT_SECRET já existente com separação de domínio;
não são persistidos e-mail, IP puro, senha, cookie, JWT ou reset token.
As instâncias precisam compartilhar chave/política e ter relógios sincronizados.

IP vem de `req.ip`, mantendo `trust proxy=false`. Alterar X-Forwarded-For
não renova quotas. A configuração definitiva de proxies depende da topologia
de produção; no proxy local atual os clientes compartilham o IP do proxy.

### Concorrência, expiração e falhas

Janela fixa por chave, iniciada pela primeira tentativa. Pipeline de
`findOneAndUpdate` reseta janelas vencidas e adquire capacidade atomicamente.
Login reserva `pending` antes de consulta de senha/bcrypt, considerando
`count + pending`. Falha converte reserva em contador; sucesso limpa falhas
de conta/conta+IP, preserva contador global de IP e reservas de outras requisições.
Formulários incompletos e demais erros de login também consomem tentativas.

Se um scope posterior negar acesso, reservas anteriores são liberadas uma
vez. A conclusão aguarda todas as operações iniciadas, mesmo havendo falha
parcial. Não há retry cego de decrementos. Conclusões de janelas antigas
não alteram janelas novas. Reservas abandonadas por queda/falha expiram
logicamente com a janela; não há bloqueio permanente.

Forgot/reset/register consomem quotas antes do controller. Em forgot, a
quota de IP admitida pode ser consumida mesmo se a conta negar a solicitação.
Bloqueio impede geração/substituição de token, SMTP e cadastro adicional.
Logout e alteração autenticada de senha não recebem este limiter.

Resposta de bloqueio: **429**, mensagem genérica e **Retry-After**, sem revelar
scope ou existência de conta. Falha de storage: **503**, sem fallback local
ou emissão de sessão. TTL é cleanup eventual; timestamps determinam a
expiração mesmo que o documento ainda exista. Nenhuma alteração no User
para contadores, lock ou tentativas. Store separado permite troca futura.

### Testes permanentes

Arquivo `ecommerce/tests/rateLimit.test.js`, reutilizando `authHarness.js`.
Os casos JWT existentes limpam a coleção entre casos para isolamento,
sem desabilitar o limiter. Nenhum teste anterior foi removido/enfraquecido.

| ID | Cenário |
| --- | --- |
| RL-01 | Login abaixo do teto mantém 401. |
| RL-02 | Sexta tentativa conta+IP retorna 429. |
| RL-03 | Resposta 429 genérica e sem dados internos. |
| RL-04 | Sucesso limpa conta/conta+IP; próxima falha começa em um. |
| RL-05 | Sucesso preserva falhas globais do IP. |
| RL-06 | Conta inexistente também é limitada. |
| RL-07 | Distribuição entre contas atinge teto de IP. |
| RL-08 | IPs distintos atingem teto global de conta. |
| RL-09 | Spoof de X-Forwarded-For não renova quotas. |
| RL-10 | Quatro falhas + três simultâneas: uma 401 e duas 429. |
| RL-11 | Retry-After existe e é positivo. |
| RL-12 | Janela de 100 ms expira logicamente sem exclusão TTL. |
| RL-13 | Recuperação permitida mantém SMTP mockado. |
| RL-14 | Recuperação bloqueada não envia nem substitui token. |
| RL-15 | Reset inválido atinge teto IP. |
| RL-16 | Cadastro bloqueado não cria conta adicional. |
| RL-17 | Dois serviços/conexões independentes compartilham contadores. |
| RL-18 | Chave única, TTL e timestamps presentes. |
| RL-19 | Logout continua disponível e replay JWT retorna 401. |
| RL-20 | Troca de senha mantém revogação e sessão nova válida. |
| RL-21 | Reset mantém revogação e single-use. |
| RL-22 | Bloqueio ocorre antes de consulta de senha/bcrypt. |
| RL-23 | Login/forgot/reset/register usam scopes independentes. |
| RL-24 | Trim/lowercase compartilham chave de conta. |
| RL-25 | Storage contém somente campos previstos e identificadores derivados. |
| RL-26 | Falha do storage retorna 503 sem bcrypt/fallback. |
| RL-27 | Concorrência na criação inicial respeita chave única e teto. |
| RL-28 | Reservas abandonadas expiram; conclusão antiga preserva janela nova. |
| RL-29 | Forgot limita IP mesmo entre contas inexistentes. |
| RL-30 | Falha na aquisição de scope libera reserva anterior. |
| RL-31 | Falha na conclusão não emite cookie/JWT. |
| RL-32 | Consulta por chave examina um documento e uma chave, sem COLLSCAN. |
| RL-33 | Conclusão repetida não incrementa novamente. |
| RL-34 | Liberação parcial não libera reserva de outra requisição. |
| RL-35 | Formato alternativo de e-mail convertido pelo controller não cria quota nova. |

### Probes pós-correção

| Probe | Resultado |
| --- | --- |
| Login | 12 tentativas: primeiras cinco 401; sete seguintes 429. Primeiro 429 na sexta; Retry-After 900 s. |
| Recuperação | Cinco envios mockados; sexta 429, sem novo envio/token. |
| Concorrência | Após quatro falhas: três simultâneas resultaram em 401, 429, 429. |
| Spoof | Cinco headers distintos resultaram em 401; sexto header distinto retornou 429. |

Multi-instância: dois serviços com stores e conexões Mongo independentes,
mesma base temporária. A registrou três falhas; B registrou mais duas; ambas
observaram bloqueio da mesma chave. Sem memória compartilhada de contadores.

### Validação final de FET-SEC-002

| Comando | Resultado | Duração disponível |
| --- | --- | --- |
| `node --test ecommerce/tests/rateLimit.test.js` | 35/35 aprovados; zero falhas/skips | 20,429 s |
| `npm.cmd test --prefix ecommerce` | 76/76 aprovados; inclui os 28 testes JWT e 13 grupos anteriores | 18,990 s |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado | Vite: 457 ms |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19 aprovados | Playwright: 1,5 min |

O diagnóstico de ausência de JWT após falha do storage foi revalidado
isoladamente após tornar a asserção segura para não imprimir tokens em falhas.
Índice principal confirmado por explain: um documento e uma chave examinados,
sem COLLSCAN. Bases temporárias removidas no teardown.

### Isolamento, documentação e escopo

Bases temporárias `fetech_routes_auth_<pid>_<timestamp>`, `fetech_routes_*`
e `fetech_e2e_*`, com teardown. SMTP mockado, segredo JWT efêmero no teste,
config.env real preservado. **BANCO REAL NÃO ALTERADO.** Os processos locais
anteriores não foram reiniciados contra a base real nesta task; carregar o
novo código exige reiniciar a API. Nenhum relatório histórico foi editado.

Frontend preservado: seu tratamento centralizado já apresenta a mensagem
da API, incluindo 429. Não foi criado E2E artificial; todos os fluxos
existentes continuam como gate. Documentos atualizados: AUTENTICACAO,
PLANO_MELHORIAS, README, ROTAS e ESTADO_ATUAL_PROJETO_FETECH.

Alterações funcionais fora de escopo: **NENHUMA**. Nenhuma dependência ou
lockfile alterado; npm audit não reexecutado por não haver mudança de dependências.

### Riscos residuais e próxima task

**F009 / FET-P1-001 — recuperação revela existência de conta permanece aberto.**
MFA permanece ausente. Proxy/trust proxy definitivo depende da infraestrutura;
MongoDB é dependência de disponibilidade e capacidade do limiter. Observabilidade
e alertas completos serão tratados posteriormente. Bot/CAPTCHA está fora do
escopo. Ataques distribuídos ainda podem causar restrição temporária a uma
conta; por isso o teto global de conta (20) é mais permissivo que conta+IP (5).

Próxima task recomendada: **F009 / FET-P1-001 — eliminar enumeração de contas
no fluxo de recuperação de senha**. Não iniciada.

## F009 / FET-P1-001 — Enumeração na recuperação de senha

**Status: CORRIGIDO — FET-SEC-003, 07/10/2026.**
Branch `main`; HEAD inicial/final `92e83494cfd7e8899fe353fa420d17a9efcc2a44`.
F006 e alterações anteriores de F008 preservadas; nenhuma alteração commitada
nesta task. Nenhuma dependência/lockfile/config.env real alterado. Auditoria
histórica preservada. Apenas bases temporárias; nenhum e-mail real enviado.

### Finding, reprodução e causa raiz

Baseline repetido: API 76/76 em 19,881 s. Probe anterior com fixtures:

| Caso | Status | Body anterior |
| --- | --- | --- |
| Existente | 200 | `success:true`, `message:Email send to <fixture> successfully` |
| Inexistente | 404 | `success:false`, `message:User not found` |
| Existente + falha SMTP | 503 | `success:false`, `message:SMTP de teste indisponível` |

Content-Type JSON nos três casos, sem Set-Cookie; status/corpo distintos já
permitiam enumeração. O controller retornava cedo para inexistente e propagava
erro SMTP somente quando uma conta era encontrada. Suíte escrita antes da
correção: 23 testes, 12 falhas e 11 passes. Depois foram adicionados dois gates
extras para limpeza concorrente e falha estrutural de lookup.

### Solução e contrato novo

Solicitações permitidas recebem HTTP 200 e exatamente:

```json
{
  "success": true,
  "message": "Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha."
}
```

Existente/inexistente/SMTP ausente/SMTP falho são equivalentes em status, JSON
e headers específicos. Sem PII ou confirmação de envio. Inexistente não cria
User/hash nem chama SMTP. Sucesso mantém token seguro/hash/expiry; falha limpa
hash/expiry por ID + hash original e registra somente o evento constante
`password_recovery_email_failed`. Falhas estruturais seguem middleware normal.
F008 permanece antes do controller, mantendo 429 e Retry-After.

Piso assíncrono com relógio monotônico: `AUTH_FORGOT_MIN_RESPONSE_MS`, default
300 ms, testes 20 ms, valores finitos de 0 a 5000, inválidos usam 300.
Timer aguarda o tempo restante sem bloquear o event loop; helper permite
relógio/sleep injetados. Configuração zero desativa o piso. Sem fila/outbox.
A UI existente apresenta a mensagem da API e preserva erros 429/globais.

### Testes permanentes adicionados

Arquivo `ecommerce/tests/passwordRecoverySecurity.test.js`:

| Teste | Cobertura |
| --- | --- |
| PR-01 | Existente, 200 genérico |
| PR-02 | Inexistente, 200 genérico |
| PR-03 | Igualdade de status, body e headers públicos |
| PR-04 | Falha SMTP, 200 genérico |
| PR-05 | Limpeza persistida de hash/expiry |
| PR-06 | Sucesso mantém SHA-256 e expiração futura |
| PR-07 | Inexistente não cria User/recuperação |
| PR-08 | Inexistente não envia SMTP |
| PR-09 | Existente envia uma vez |
| PR-10 | Ambos bloqueiam na sexta tentativa com Retry-After |
| PR-11 | Bloqueio impede SMTP |
| PR-12 | Bloqueio preserva token/expiração |
| PR-13 | Trim/lowercase/coerção mantêm identidade e contrato |
| PR-14 | Nenhuma PII/estado interno na resposta |
| PR-15 | Logging somente com evento constante seguro |
| PR-16 | Reset single-use |
| PR-17 | JWT anterior retorna 401 após reset |
| PR-18 | Sessão nova pós-reset retorna 200 |
| PR-19 | Piso temporal de inexistente |
| PR-20 | Piso temporal de existente/SMTP rápido |
| PR-21 | Equalização determinística e operações além do piso |
| PR-22 | SMTP não configurado mantém contrato e limpa token |
| PR-23 | Limiter indisponível continua 503 |
| PR-24 | Falha antiga preserva token concorrente mais recente |
| PR-25 | Erro estrutural de lookup não vira sucesso |

Expectativas antigas de forgot 404/503 atualizadas para o contrato genérico;
asserts de limpeza, expiração, quotas, JWT e single-use foram preservados.
E2E de recuperação verifica a nova mensagem pública; frontend não exige mudança.

### Verificação e probes finais

| Comando | Resultado |
| --- | --- |
| `node --test ecommerce/tests/passwordRecoverySecurity.test.js` | 25/25, 5,232 s |
| `npm.cmd test --prefix ecommerce` | 101/101, 19,943 s; inclui 28 JWT e 35 limiter |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado, 683 ms |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19, 1,7 min |

Uma execução intermediária de E2E falhou por acentos corrompidos na expectativa
do teste de recuperação. Expectativa corrigida em UTF-8; suíte completa repetida
e aprovada. A API já retornava a mensagem correta. Nenhum teste foi removido.

Probe final: existente/inexistente/SMTP falho retornam o JSON genérico acima e
HTTP 200. Status igual: SIM; body igual: SIM. Existente: SMTP mock uma vez,
token criado (valor não registrado). Inexistente: nenhum SMTP. Falha: token
ausente após limpeza. Primeiro 429: sexta tentativa; Retry-After: 899 segundos.

Timing local de cinco amostras por caso, piso 300 ms e SMTP mock, sem exceder
limiter (limpeza de contadores na base temporária entre grupos):

| Caso | Mínimo | Mediana | Máximo |
| --- | --- | --- | --- |
| Existente | 317,96 ms | 325,94 ms | 342,42 ms |
| Inexistente | 315,34 ms | 325,51 ms | 327,32 ms |

**Este probe local não comprova resistência absoluta a timing attacks em produção.**
F006 continua corrigido (PR-16/17/18, suíte JWT 28/28). F008 continua corrigido
(PR-10/11/12/23, suíte limiter 35/35). Bases `fetech_routes_auth_*`,
`fetech_routes_*`, `fetech_e2e_*`, removidas no teardown.
**BANCO REAL NÃO ALTERADO. NENHUM E-MAIL REAL ENVIADO.**

### Riscos residuais e continuidade

Latência SMTP real pode ultrapassar o piso. F040 tratará processamento assíncrono
e outbox; observabilidade completa permanece pendente. Forgots concorrentes
podem sobrescrever tokens; último save prevalece e links anteriores podem
ficar inválidos. Limpeza condicionada protege uma recuperação mais recente.
MFA continua ausente; limiter depende de MongoDB; hardening HTTP/cookies,
proxy definitivo e alertas ainda exigem tarefas próprias. Nenhuma correção
fora de escopo iniciada. Reiniciar API será necessário para carregar o código;
processos antigos não foram reiniciados contra a base real durante a task.

Documentos vivos atualizados: README, ROTAS, AUTENTICACAO, ESTADO_ATUAL e este
plano; relatórios históricos não alterados. Sem alterações de dependências,
npm audit não foi necessário nesta task.

Próxima recomendação: **F010 / FET-P1-002 — impedir autoexclusão,
autorrebaixamento e perda do último administrador; bootstrap administrativo
seguro.** Não iniciada automaticamente.
