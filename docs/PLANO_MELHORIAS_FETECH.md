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
