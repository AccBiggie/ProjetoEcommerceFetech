# Segurança administrativa e primeiro administrador

FET-SEC-004 / F010 / FET-P1-002, atualizado pela FET-DATA-003 em 08/10/2026. Mutações HTTP auditadas exigem MongoDB com transações (replica set), conforme F025.
As regras são aplicadas pelo backend em PUT e PATCH de lifecycle; DELETE físico retorna 405. [Contrato atual](LIFECYCLE_USUARIOS.md).

## Política

| Operação | Resultado |
| --- | --- |
| Desativar a própria conta administrativa | 403, conta preservada |
| DELETE de qualquer usuário, inclusive próprio | 405 Allow: PATCH, sem mudança |
| Rebaixar a própria conta para user | 403, role preservada |
| Atualizar a própria conta mantendo admin, ou sem enviar role | Permitido, validações existentes |
| Rebaixar/desativar outro admin | Permitido quando resta pelo menos um admin ACTIVE |
| Operação que deixaria zero admins ACTIVE | 409; ação própria continua 403 |
| Promover um user | Permitido por executor atualmente admin |
| Desativar user comum | Preserva User e dependentes, revoga sessões |
| Reativar conta | ACTIVE, sem restaurar sessões; novo login necessário |
| Executor perdeu role enquanto aguardava | 403 após recarregar executor |
| Conflito/lease perdido | 409, mensagem segura em português |
| Storage do lock indisponível | 503, sem executar por fallback |

Formato de erro: `{ "success": false, "message": "..." }`, sem stack ou owner.
Role atual do MongoDB controla autorização. Após rebaixamento, JWT anterior
continua autenticando como user, mas rotas admin retornam 403; desativação causa
401. Admin desativado não opera nem conta para a invariante. Body não pode manipular `tokenVersion` ou `adminMutationFence`.
Dashboard mantém controles próprios desabilitados e apresenta erros 403/409.

## Lock e escritas atrasadas

Model `AdminMutationLock`, coleção `adminmutationlocks`:

- `_id`: singleton `admin-user-mutation`, com índice `_id_` único.
- `owner`: UUID aleatório por aquisição; null após liberação.
- `lockedUntil`: lease calculado pelo relógio MongoDB `$$NOW`.
- `fence`: geração crescente da aquisição, preservada após liberação.
- `bootstrapUserId`: ObjectId reservado para a criação inicial concorrente.
- `createdAt`, `updatedAt`: timestamps.

Configuração central em `backend/config/adminSafety.js`: lease 10.000 ms,
tentativas de aquisição por até 1.500 ms, intervalo 40 ms, maxTimeMS de 2.000 ms
nas operações do lock. Latência/seleção de servidor também depende do driver.
Aquisição é findOneAndUpdate atômico condicionado a owner livre/lease vencido.
Liberação em finally exige owner e geração; owner antigo não libera owner novo.
Documento persiste com lease passado. Não há TTL: apagar o singleton perderia
a geração usada para impedir escritas antigas.

Nas mutações HTTP, antes de ler executor, alvo e contagem, uma aquisição marca admins com a nova
geração interna `User.adminMutationFence`; alvos comuns também recebem geração.
A marcação só aumenta valores. Escritas de role/lifecycle exigem a mesma geração
e role lida, e a propriedade do lease é verificada antes da escrita. Assim,
uma operação pausada perde a capacidade de escrever quando uma aquisição nova
marca os documentos. Contagem e decisões são recarregadas após essa marcação.
Campo select:false e removido no toJSON; não aparece nas respostas públicas.
Edição de role não altera tokenVersion. Desativação incrementa uma vez; reativação mantém a versão.

O ID reservado de bootstrap impede duas inserções, inclusive quando uma save
antiga retorna após perder lease. Se esse ID já existir como conta comum e
o banco tiver zero admins ACTIVE, o ID pode ser rotacionado sob o mesmo lock; isso
não promove nem modifica a conta existente. Índices `_id` e e-mail do User
protegem duplicações. Serviços/CLI usam User e seu hook bcrypt.

Referências: [atomicidade por documento no MongoDB](https://www.mongodb.com/docs/v8.0/core/write-operations-atomicity/)
e [updates com pipeline e $$NOW](https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/).
O lock usa atomicidade por documento. Mutações HTTP com audit F025 usam
transações multi-documento e exigem replica set; bootstrap mantém seu contrato próprio.

Consulta por role foi avaliada no probe: COLLSCAN examinou um documento na
fixture final. Não foi adicionado índice role nesta task; avaliar seletividade
e volume operacional antes de acrescentá-lo. O lock serializa inclusive
promoções e transições de lifecycle para preservar revalidação e evitar corridas de role.

## Bootstrap operacional

Com banco configurado normalmente e MongoDB disponível, executar em terminal
interativo, a partir da raiz:

```powershell
npm.cmd run admin:bootstrap --prefix ecommerce
```

1. O comando lê a conexão configurada no servidor e exibe host, database,
   ambiente e quantidade de admins ACTIVE. Não exibe URI/credenciais MongoDB.
2. Digite exatamente o nome da database para confirmar. Nome errado cancela.
   A conexão inicial desativa criação automática de coleções/índices; índices
   do User são preparados somente após essa confirmação.
3. Informe nome e e-mail de uma conta nova.
4. Informe senha e confirmação. A entrada fica oculta, sem eco ou histórico
   de readline. As validações do User são reutilizadas.
5. Com zero admins ACTIVE confirmado novamente dentro do lock, cria um único admin
   com avatar default. Não utiliza Cloudinary/SMTP nem emite JWT/cookie.
6. Faça login pela aplicação normalmente; emissão de JWT e rate limiter são
   os mesmos do restante do sistema.

E-mail existente: aborta e exige outro e-mail; não há promoção silenciosa ou
troca da senha de uma conta existente. Admin já existente: aborta e orienta
gestão pelo dashboard. Exit code 0 significa sucesso; 1 significa cancelamento,
entrada inválida, conflito, admin existente ou falha operacional.

Sem senha default, segredo de bootstrap, argumentos CLI ou arquivos de senha.
Qualquer argumento é recusado antes de conectar. Ambiente não interativo é
recusado; provisionamento futuro por stdin não foi implementado. NODE_ENV não
libera ou bloqueia o bootstrap; acesso operacional, confirmação do banco e
ausência de admins são os controles. Não há endpoint HTTP de bootstrap.

O seed de produtos locais passa a usar o primeiro admin existente por `_id`,
sem exigir e-mail fixo, mantendo suas restrições ao banco local e preservação
dos produtos existentes.

## Deploy, testes e continuidade

Atualize e reinicie todas as instâncias da API. Instâncias antigas não verificam
as novas regras; não mantenha versões antigas processando mutações admin.
O novo campo é inicializado nas operações administrativas; não exige backfill
manual. O singleton é inicializado atomicamente ao primeiro uso; a API prepara
o model antes de abrir a porta. Não apagar/editar o singleton ou suas gerações
durante operações. Intervenções diretas no MongoDB ficam fora dessas garantias.

```powershell
node --test ecommerce/tests/adminSafety.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
```

Testes usam somente bases temporárias com teardown, SMTP mock e segredo JWT
efêmero. Capturam saída CLI e verificam eco oculto, lease vencido, escrita
antiga, conexões independentes, bootstrap simultâneo e regressões F006/8/9.
Resultado em 08/10/2026: 41/41 focados, 142/142 API, build e 19/19 E2E aprovados.
Banco real e config.env não foram alterados durante esta task.

F016 (relações órfãs/lifecycle), F025 (trilha administrativa completa), MFA e
RBAC granular permanecem pendentes. Bootstrap registra apenas mensagem segura
de sucesso; trilha operacional persistente completa continua em F025.
