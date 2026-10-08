# Autenticação e revogação JWT

Atualização FET-SEC-001, FET-SEC-002 e FET-SEC-003 em 07/10/2026. A autenticação continua usando JWT
assinado no cookie `token` HttpOnly; o frontend não armazena o JWT em Redux,
localStorage ou sessionStorage. A resposta JSON continua contendo o token.

## Versão de autenticação

`User.tokenVersion` é um Number persistido, inteiro não negativo, com default
zero. O payload de todo JWT novo inclui `id`, `tokenVersion`, `iat` e `exp`.
Cadastro, perfil e atualização administrativa possuem allowlists e ignoram
`tokenVersion` enviado pelo cliente. Login não incrementa a versão.

O middleware valida assinatura e expiração, rejeita claims de versão ausentes
ou inválidos, consulta o usuário no MongoDB e compara as versões estritamente.
Sessões revogadas, expiradas, inválidas e de contas removidas retornam 401 com
`success: false` e mensagem genérica. A role persistida determina a autorização:
rebaixar um admin mantém a autenticação, mas retira imediatamente seu acesso
administrativo (403).

## Eventos de revogação

| Evento | Persistência e sessão resultante |
| --- | --- |
| `GET /api/v1/logout` | Incremento atômico condicionado ao ID e à versão do JWT; expira cookie e mantém HTTP 200 para sessão ausente/inválida/revogada. |
| `PUT /api/v1/password/update` | Valida senha atual/nova, salva senha e versão incrementada no mesmo documento e emite JWT atualizado. |
| `PUT /api/v1/password/reset/:token` | Valida recuperação, salva senha/versão, remove hash e expiração e emite JWT atualizado. |

Logout **revoga todas as sessões da versão corrente do usuário**, inclusive
outros navegadores. Um JWT revogado não pode incrementar a versão novamente
nem derrubar uma sessão criada posteriormente. Duas chamadas simultâneas com
o mesmo JWT incrementam uma única vez. Sessões individuais por dispositivo
não foram implementadas.

Documentos antigos sem `tokenVersion` são hidratados com zero pelo Mongoose.
A condição de atualização aceita zero ou campo ausente apenas no documento
persistido; **não existe fallback de versão para JWT recebido**. `$inc` persiste
o campo no logout. Save após troca/reset persiste a versão normalmente. Não
há migration ou backfill obrigatório.

Alterações de senha usam `document.$where` para condicionar o save à versão
lida, preservando o hook bcrypt existente. Se outra revogação vencer primeiro,
o save desatualizado retorna 401 e não altera a senha/versão. No reset, o save
também exige o hash original e a expiração ainda válida. Hash SHA-256, token
aleatório, single-use e limpeza após falha de SMTP permanecem protegidos.
Referência técnica: [Mongoose Model.prototype.$where](https://mongoosejs.com/docs/api/model.html#Model.prototype.$where).

## Deploy e compatibilidade

**Todos os JWTs emitidos antes da introdução de `tokenVersion` serão rejeitados.**
Usuários anteriormente autenticados precisarão fazer login novamente uma vez
após o deploy. Reinicie os processos da API para carregar a implementação;
em ambiente com várias instâncias, atualize todas, sem manter servidores antigos
aceitando JWTs sem versão. Não implante uma versão antiga após a mudança sem
considerar que ela deixaria de verificar a revogação.

Não é necessário alterar o frontend ou corrigir usuários manualmente no MongoDB.
A versão é limitada a inteiros seguros de JavaScript. O limite terminal
`Number.MAX_SAFE_INTEGER` não autentica nem emite JWT; atingir esse limite
exigiria aproximadamente nove quadrilhões de revogações por conta. Ao alcançá-lo,
o sistema falha fechado, sem incremento inseguro, e exige tratamento operacional.

## Testes permanentes

Com MongoDB local ativo, na raiz do projeto:

```powershell
node --test ecommerce/tests/auth.test.js
node --test ecommerce/tests/rateLimit.test.js
node --test ecommerce/tests/passwordRecoverySecurity.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
```

A suíte focada usa `fetech_routes_auth_<pid>_<timestamp>`; API anterior usa
`fetech_routes_*`; navegador usa `fetech_e2e_*`. As bases são temporárias e
removidas no teardown. SMTP é mockado e a chave JWT é efêmera no processo de
teste, sem ler `config.env`. Nenhum teste utiliza o banco real `fetech`.

Os 28 testes focados cobrem claims, replays, concorrência, usuários legados,
mass assignment, autorização atual, exclusão, recuperação e validações rejeitadas.
O mapeamento individual e os resultados estão em [PLANO_MELHORIAS_FETECH.md](PLANO_MELHORIAS_FETECH.md).

## Rate limiting distribuído — F008

Os endpoints públicos `/login`, `/password/forgot`, `/password/reset/:token`
e `/register`, sob `/api/v1`, usam a coleção MongoDB `authratelimits`.
Não há Redis, contadores em memória ou bloqueio permanente no User.

| Scope | Limite | Janela |
| --- | --- | --- |
| `login:account-ip` | 5 falhas | 15 min |
| `login:account` | 20 falhas | 15 min |
| `login:ip` | 50 falhas | 15 min |
| `forgot:account` | 5 requisições | 15 min |
| `forgot:ip` | 10 requisições | 15 min |
| `reset:ip` | 10 requisições | 15 min |
| `register:ip` | 10 tentativas | 60 min |

As políticas ficam centralizadas em `backend/config/authRateLimits.js`.
Não foi adicionada configuração obrigatória. A factory do serviço permite
injetar políticas, store e relógio nos testes; não há endpoint de bypass.

O IP vem de `req.ip`. A política padrão do Express mantém `trust proxy=false`:
`X-Forwarded-For` recebido de origem não confiada não altera a chave. Atrás do
Vite/proxy atual, requisições compartilham o IP do proxy. Em produção, definir
uma lista/topologia de proxies confiáveis antes de identificar clientes reais;
não habilitar `trust proxy=true` indiscriminadamente.
Referência: [Express atrás de proxies](https://expressjs.com/en/guide/behind-proxies/).

Chaves são HMAC-SHA256 com separação de domínio, scope e identidade. Usa-se a
`JWT_SECRET` já existente, exclusivamente no backend, sem nova variável obrigatória.
E-mail segue a conversão já usada pelos controllers, seguida de trim/lowercase;
formatos alternativos que o controller converte para o mesmo e-mail não criam
novas quotas. O limiter não consulta a existência da conta para derivar a chave.
E-mail, IP puro, senha, JWT e token de recuperação não são armazenados na coleção.
Todas as instâncias devem usar a mesma chave e políticas; rotacionar a chave
muda as chaves do limiter e invalida os JWTs existentes.

### Concorrência e janelas

Cada chave possui janela fixa iniciada pela primeira tentativa. O MongoDB
reseta logicamente uma janela vencida e adquire capacidade numa única operação
`findOneAndUpdate` com pipeline, consultando `_id` indexado. Não é necessário
replica set/transação para as operações atômicas individuais desta implementação.
Referência: [findOneAndUpdate com pipeline](https://www.mongodb.com/docs/manual/reference/method/db.collection.findoneandupdate/).

Login reserva capacidade em `pending` antes da consulta de senha/bcrypt.
`count + pending` deve ficar abaixo do limite para admitir outra tentativa.
Falha converte a reserva em `count`; sucesso libera a reserva e zera falhas
de conta/conta+IP, preservando o histórico global de IP e reservas concorrentes.
Erros de login, incluindo formulário incompleto, contam como tentativas falhas.
Quotas atingidas impedem inclusive um login correto até a expiração aplicável.

Se um scope posterior negar a tentativa, as reservas anteriores são liberadas.
Liberação/finalização ocorre uma única vez; todas as operações iniciadas são
aguardadas mesmo se uma falhar. Conclusões antigas são condicionadas à janela
original e não alteram janelas novas. Uma queda do processo/storage pode deixar
reservas pendentes até o fim da janela, sem bloqueio permanente. As instâncias
devem manter relógios sincronizados; o relógio de teste é injetável, sem sleeps longos.

Forgot/reset/register consomem capacidade antes do controller, independentemente
do resultado. Em forgot, uma solicitação negada pelo scope da conta ainda pode
consumir a quota de IP previamente admitida. Após bloqueio, não há geração de
token, chamada SMTP, bcrypt de cadastro ou criação de conta adicional.
Logout, alteração autenticada de senha e rotas administrativas não recebem
este limiter. As garantias de tokenVersion, hash, validade e single-use permanecem.

### Respostas, storage e cleanup

Bloqueio retorna HTTP **429**, header `Retry-After` em segundos, arredondado para
cima, e mensagem genérica: “Muitas tentativas. Tente novamente mais tarde.”
Não informa qual scope bloqueou nem a existência da conta. O frontend já
apresenta a mensagem da API pelo tratamento centralizado de erros; não houve
alteração de UI ou criação de E2E artificial.

Falha do MongoDB/limiter retorna **503**, sem autenticar, emitir sessão ou liberar
acesso por fallback local. Writes parciais podem conservar reservas até expirar.
O store Mongo está separado do serviço para permitir substituição futura.

Model `AuthRateLimit`: `_id` derivado, `scope`, `count`, `pending`,
`windowStartedAt`, `expiresAt`. Índices: `_id_` único e `expiresAt_1` TTL com
`expireAfterSeconds: 0`. A API prepara o índice antes de abrir a porta.
O TTL limpa dados eventualmente; a autorização compara timestamps e desbloqueia
sem aguardar exclusão física. Referência: [TTL do MongoDB](https://www.mongodb.com/docs/manual/core/index-ttl/).

## Riscos residuais

F009 foi corrigido quanto a status, corpo e headers públicos. Latência SMTP
externa ainda pode introduzir variação temporal além do piso configurado.
MFA, cookie Secure, hardening HTTP/CSRF, CAPTCHA e remoção do JWT do JSON
dependem de tarefas próprias. Proxy definitivo, capacidade/disponibilidade do
MongoDB, alertas e observabilidade completa também exigem validação operacional.
`GET /logout` permanece GET. Estas remediações não alteram pedidos, estoque
ou pagamento. O relatório histórico da auditoria não foi editado.

## Recuperação sem enumeração — F009 / FET-P1-001

`POST /api/v1/password/forgot` responde HTTP 200 com o mesmo JSON para conta
existente, inexistente, SMTP ausente e falha SMTP:

```json
{
  "success": true,
  "message": "Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha."
}
```

Não confirma conta ou entrega; não expõe PII, token, ID ou expiração. A UI já
apresenta a mensagem da API; 429 e falhas globais continuam no fluxo de erro.
Trim/lowercase e coerção existente são preservados. Não há envio nem criação
de User/token para inexistente. F008 consome quotas antes do lookup; a sexta
tentativa da mesma conta em 15 minutos continua 429 com `Retry-After`.

Sucesso de SMTP preserva hash SHA-256/expiração de 15 minutos. Falha registra
apenas `password_recovery_email_failed`, sem erro bruto ou credenciais, e remove
hash/expiração persistidos. A remoção exige ID + hash original, preservando um
token mais recente. Erros de consulta/save/cleanup seguem o middleware global;
falha do limiter permanece 503. Não se converte indisponibilidade estrutural
em sucesso. Reset single-use e revogação JWT de F006 continuam protegidos.

Configuração opcional: `AUTH_FORGOT_MIN_RESPONSE_MS`, default 300 ms. Valores
finitos entre 0 e 5000 são aceitos; inválidos usam 300. Zero desativa o piso e
não é recomendado para produção. Não exige mudança no config.env existente.
O relógio monotônico mede o tempo no controller; timer assíncrono espera apenas
o restante, sem busy-wait. O piso não se aplica ao 429 já emitido pelo gate.
Testes configuram 20 ms; helper aceita relógio/sleep injetados para verificação
determinística. O probe com 300 ms mostrou medianas locais próximas de 326 ms.

SMTP externo lento pode ultrapassar o piso: não há garantia de resistência
absoluta a timing attacks. F040 tratará processamento assíncrono/outbox.
Forgots concorrentes ainda podem substituir tokens (último save prevalece),
inclusive tornando um link enviado anteriormente inválido. Não foi redesenhado
esse fluxo; limpeza condicionada evita apagar uma recuperação mais recente.
Observabilidade completa, MFA e hardening HTTP/cookies continuam pendentes.
