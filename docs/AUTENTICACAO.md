# Autenticação e revogação JWT

Atualização FET-SEC-001 em 07/10/2026. A autenticação continua usando JWT
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

## Riscos residuais

Rate limiting, MFA, cookie Secure, hardening HTTP/CSRF e remoção do JWT do JSON
dependem de tarefas próprias. `GET /logout` permanece GET. Esta remediação
não altera pedidos, estoque, pagamento ou outros achados da auditoria.
