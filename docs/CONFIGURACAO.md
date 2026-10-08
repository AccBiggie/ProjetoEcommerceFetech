# Configuração de ambiente — FET-SEC-008

FET-OPS-002 acrescenta `LOG_LEVEL` ao inventário central (18 variáveis): enum `debug/info/warn/error`, default test=`error`, development/production=`info`. Vazio/desconhecido falha antes de app/Mongo/listen; todos os perfis validam a opção. Consumidor: `config.logging.level`, logger central. Configuração real preservada; somente `config.env.example` atualizado. Startup emite JSON com nome da exceção e nomes permitidos de variáveis inválidas, sem valores/stack livre. [Contrato de observabilidade](OBSERVABILIDADE.md).

FET-OPS-001 acrescenta o perfil `database-operations`: valida centralmente `NODE_ENV` e `DB_URI` com database explícita, sem exigir JWT/SMTP/Cloudinary. Nenhuma variável obrigatória nova ou alteração em `config.env`. `--tools-dir` é argumento opcional da CLI; `FETECH_TEST_MONGO_TOOLS` pertence apenas ao runner de testes. Database Tools oficiais 100.3+ da série 100.x são pré-requisito externo, não dependência npm. [Runbook de backup/restore](BACKUP_RESTORE.md). F024 continua parcial até prova real de recuperação.

A API usa `ecommerce/backend/config/runtimeConfig.js`. `loadConfig(env, { profile })` é um parser síncrono, sem conexão externa, que retorna valores tipados e objetos congelados. `initializeConfig(env)` publica uma configuração já validada; `getRuntimeConfig()` permite aos consumidores acessar o snapshot. Alterações no ambiente após a inicialização exigem reinício. Testes podem injetar outro snapshot explicitamente, sempre passando pelas mesmas regras de validação.

`ConfigurationError` agrega nomes de variáveis e motivos seguros. Não armazena o objeto env, valores rejeitados, exceções do parser do driver ou URI completa. Nunca registre o objeto de configuração: ele contém secrets. Falhas operacionais do entrypoint também usam mensagens fixas, sem imprimir erros arbitrários de providers.

## Inventário real

Tabela construída a partir dos consumidores do HEAD inicial `f2101f4`. Os nomes foram preservados; não existem SMTP_HOST, SMTP_PASSWORD ou CLOUDINARY_CLOUD_NAME neste backend. Nenhuma dependência foi adicionada.

| Variável | Tipo normalizado | Categoria / obrigatória | Ambientes | Default | Sensível | Consumidor original → atual |
|---|---|---|---|---|---|---|
| NODE_ENV | enum | SAFE_DEFAULT | Todos os perfis | development quando ausente | Não | server, cookie, CSRF, bootstrap → runtimeConfig |
| PORT | inteiro 1..65535 | SAFE_DEFAULT | Server | 4000, preservado inclusive em produção | Não | server → config.port |
| DB_URI | URI Mongo | REQUIRED | Todos os perfis e ambientes | Nenhum | Sim, pode conter senha | database, bootstrap, seed → config.mongo.uri |
| JWT_SECRET | string preservada | REQUIRED | Server, todos os ambientes | Nenhum | Sim | userModel, authSession, limiter → config.jwt.secret |
| JWT_EXPIRE | duração jsonwebtoken | REQUIRED | Server, todos os ambientes | Nenhum | Não | userModel → config.jwt.expiresIn |
| COOKIE_EXPIRE | número positivo em dias | REQUIRED | Server, todos os ambientes | Nenhum | Não | authCookie → config.cookie.expireDays |
| FRONTEND_URL | origin HTTP(S) | REQUIRED production; OPTIONAL local | Server | Origin localhost:3000 em development/test quando ausente | Não | CSRF, userController → config.frontend |
| TRUST_PROXY_HOPS | inteiro 0..5 | SAFE_DEFAULT | Server | 0 / false | Não | trustProxy → config.proxy.hops |
| AUTH_FORGOT_MIN_RESPONSE_MS | inteiro 0..5000 | SAFE_DEFAULT | Server | 300 ms | Não | passwordRecovery → config.auth.minimumResponseMs |
| HOST | hostname SMTP | CONDITIONAL_GROUP; REQUIRED production | Server | Nenhum | Não | sendEmail → config.smtp.host |
| PORTEMAIL | inteiro 1..65535 | CONDITIONAL_GROUP; REQUIRED production | Server | Nenhum | Não | sendEmail → config.smtp.port |
| USER | string usuário/remetente SMTP | CONDITIONAL_GROUP; REQUIRED production | Server | Nenhum | Sim, identificador da integração | sendEmail → config.smtp.user |
| PASSWORD | string preservada | CONDITIONAL_GROUP; REQUIRED production | Server | Nenhum | Sim | sendEmail → config.smtp.password |
| EMAIL_SECURE | booleano explícito | OPTIONAL com SMTP | Server | true na porta 465; false nas demais | Não | sendEmail → config.smtp.secure |
| CLOUDINARY_NAME | string | CONDITIONAL_GROUP | Server | Provider desabilitado quando grupo ausente | Não | server/avatar → config.cloudinary |
| CLOUDINARY_API_KEY | string | CONDITIONAL_GROUP | Server | Nenhum | Sim | server/avatar → config.cloudinary |
| CLOUDINARY_API_SECRET | string preservada | CONDITIONAL_GROUP | Server | Nenhum | Sim | server/avatar → config.cloudinary |
| E2E_BROWSER | string canal Playwright | TEST_ONLY, opcional | Runner E2E, fora do backend | msedge no Windows; chromium nas demais plataformas | Não | playwright.config.js, permanece fora de runtimeConfig |

Antes da correção, NODE_ENV/PORT/Mongo/JWT/SMTP/Cloudinary não tinham um contrato de startup completo. Cookie, proxy e origin tinham validação própria; o timing fazia fallback silencioso para 300 ms em caso de valor inválido. O novo parser reutiliza os validadores puros de cookie, proxy e CSRF, sem enfraquecer F007/F020.

As políticas F008 **não têm env configurável**. Continuam congeladas em authRateLimits.js e são expostas por config.auth.rateLimits: login IP 50, conta 20, conta+IP 5 / 15 minutos; forgot IP 10, conta 5 / 15 minutos; reset IP 10 / 15 minutos; register IP 10 / 60 minutos. Os parâmetros de lease/retry/timeout F010 também são constantes internas. Não foram criadas envs artificiais.

Não há variáveis TEST_ONLY novas no backend. Os harnesses existentes definem fixtures temporárias, secrets efêmeros e mocks externos; nunca carregam config.env. Porta 0 continua restrita aos listeners injetados dos testes, fora de config.PORT.

## Perfis e startup

- **server**: valida todos os contratos antes de importar/configurar Express, configurar Cloudinary, conectar Mongo, preparar índices/migração e chamar listen.
- **bootstrap**: valida apenas NODE_ENV e DB_URI. Mantém terminal interativo, confirmação do banco, senha oculta e lock F010; não exige JWT, SMTP ou frontend. Não cria índices antes da confirmação.
- **seed**: valida apenas NODE_ENV e DB_URI. O script mantém sua proteção adicional: aceita somente banco local fetech na porta 27017. A tarefa não executa seed no banco real.
- **test**: é ambiente do perfil server, sem bypass de produção. Usa DB temporário e mocks. Casos de produção utilizam fixture HTTPS completa e secret efêmero.

`loadEnvironment()` concentra dotenv (quiet, caminho absoluto relativo ao backend, sem override do ambiente externo). É chamado uma vez por entrypoint executado, nunca em cada módulo de negócio. Importar server.js não conecta nem abre porta; `startServer(env, dependencies)` permite comprovar a ordem com serviços injetados. Somente o entrypoint decide o exit code: configuração inválida encerra com código 1.

Fluxo: dotenv → initializeConfig → app → provider configurado, se habilitado → connect Mongo → índices/migração → listen. SMTP não é conectado no startup. Se o parser falhar, nenhuma dessas etapas externas é executada.

## Regras

NODE_ENV aceita apenas development, test e production. Ausência assume development para execução local; string vazia/typo é erro. Staging deve usar NODE_ENV=production: nenhum ambiente novo foi inventado.

DB_URI é obrigatória em todos os perfis. O parser do MongoClient já instalado via Mongoose valida a sintaxe sem conectar; database explícita é exigida, inclusive local. Aceita mongodb://, mongodb+srv://, replica sets e IPv6. Production recusa database test. Credenciais não são exibidas. Formato válido não prova conectividade.

FET-ORDER-002: o perfil server exige replica set ou mongos com suporte a
transações. Depois de conectar, hello é verificado antes de prepare/listen.
Standalone falha com mensagem segura; não há fallback. Scripts operacionais
mantêm seus requisitos próprios. `inventory-audit` exige somente NODE_ENV/DB_URI
e não exige SMTP/Cloudinary/frontend. Não há secret/env artificial de runtime.
Para desenvolvimento dedicado e testes, veja [ESTOQUE_TRANSACIONAL.md](ESTOQUE_TRANSACIONAL.md).

JWT_SECRET é obrigatório em todos os ambientes. Em production exige no mínimo 32 bytes, sem espaços nas extremidades nem placeholders conhecidos. Isso impede erros grosseiros, sem prometer medir entropia. Não há secret default. JWT_EXPIRE é obrigatório e validado pelo próprio jsonwebtoken com uma chave exclusivamente interna de validação, que nunca autentica usuários. Preserva durações como 7d, 1h, 60 seconds e a semântica de string numérica em milissegundos. Deve gerar expiração positiva de pelo menos um segundo, sem overflow.

COOKIE_EXPIRE preserva dias, aceita fração positiva e precisa gerar data futura representável. Cookie permanece HttpOnly, Secure em production, SameSite=Lax, Path=/, host-only. Proxy continua restrito a 0..5, sem true, wildcard ou inferência de Host.

FRONTEND_URL production exige URL HTTPS absoluta sem credenciais, wildcard ou whitespace. Conforme F020, path/query são explicitamente normalizados para origin; tanto links de recuperação quanto allowlist utilizam essa origin. Development/test mantêm localhost:3000 e 127.0.0.1:3000 na allowlist junto da origin configurada. HSTS/CSP/CSRF não mudaram.

AUTH_FORGOT_MIN_RESPONSE_MS aceita inteiro 0..5000. O limite de cinco segundos preserva o intervalo operacional F009 e impede esperas absurdas. Ausência mantém 300; entrada inválida passa a bloquear startup, em vez de fallback silencioso. Resposta pública uniforme e limpeza do reset token permanecem.

SMTP está exposto na recuperação ativa de senha: production exige HOST, PORTEMAIL, USER e PASSWORD completos. Development/test permitem TODO o grupo ausente/vazio; preencher qualquer campo, inclusive EMAIL_SECURE, exige transporte completo. PORTEMAIL não tem default. EMAIL_SECURE aceita somente true/false; false não vira true por coerção. Secrets são preservados, sem trim silencioso; production recusa espaços nas extremidades em PASSWORD e CLOUDINARY_API_SECRET. Hosts inválidos não são enviados ao transporte.

Cloudinary é opcional porque cadastro e atualização sem avatar possuem fallback legítimo, e produtos armazenam URLs. Se qualquer campo estiver preenchido, os três são obrigatórios. Sem provider, tentativa de upload de avatar continua 503. Nenhuma credencial foi verificada remotamente; F029 permanece aberto.

Variáveis do sistema operacional e envs desconhecidas não são rejeitadas. Valores textuais comuns são normalizados conscientemente; secrets não são modificados.

## Operação local e produção

Use config.env.example como contrato, substituindo o placeholder JWT por secret gerado. Deixe todo o grupo SMTP vazio se não houver transporte local. Um config.env antigo com PORTEMAIL/EMAIL_SECURE preenchidos e demais campos SMTP vazios agora é parcial e deve ser corrigido pelo operador. O arquivo real não foi sobrescrito.

```powershell
npm.cmd start --prefix ecommerce
node --test ecommerce/tests/configSecurity.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
```

Configuração inválida impede startup. Corrija os nomes apontados e reinicie todas as instâncias. Não imprima configuração completa ou URIs com credenciais ao diagnosticar. Não execute bootstrap/seed como teste contra o banco real.

## Evidências e limites

Probe anterior, com dotenv substituído e conexão interceptada: production sem JWT_SECRET/JWT_EXPIRE, DB_URI com protocolo inválido e SMTP parcial chegou à configuração de Cloudinary e tentativa de conexão Mongo. Não houve chamada real. Após a correção, testes do entrypoint comprovam exit 1, connect 0 e ausência das sentinelas JWT/Mongo/SMTP/Cloudinary em stdout/stderr. Spies de startup comprovam app/provider/connect/listen 0 quando inválido; fixture válida comprova validação → connect → prepare → listen.

A suíte configSecurity.test.js mantém casos CFG-01..46. Inclui fixtures válidas, grupos completos/parciais, expiração, numeric/boolean parsing, imutabilidade, perfis operacionais e inspeção de arquitetura contra leituras dispersas. As regressões F006/F007/F008/F009/F010/F020/F021 continuam na suíte API e E2E permanente.

F023 (deployment/TLS), F024 (backup/restore), F025 (observabilidade) e F029 (SMTP/Cloudinary reais) permanecem abertos. Validação sintática não comprova DNS, permissões, quota, entrega ou conectividade. Gestão e rotação de secrets dependem da infraestrutura e de procedimento operacional futuro. Nenhum secrets manager, HSTS produtivo ou logger completo foi criado nesta tarefa.

## Perfil migration — FET-DATA-001

`loadConfig(env, { profile: "migration" })` reutiliza validação NODE_ENV/DB_URI e database explícita, sem exigir JWT/SMTP/frontend para auditar dados. Loader dotenv central continua único no entrypoint. CLI monetária é fronteira autorizada de leitura de process.env; módulos de negócio permanecem sem leitura dispersa. Flags de apply/confirm-db pertencem ao CLI, sem envs novas. Veja [MIGRACAO_DINHEIRO_CENTAVOS.md](MIGRACAO_DINHEIRO_CENTAVOS.md).

## Perfil shipping-audit — FET-DATA-002

`loadConfig(env, { profile: "shipping-audit" })` usa os mesmos parsers centrais
NODE_ENV/DB_URI, database explícita e regras de produção. Não exige configuração
HTTP/JWT/SMTP/Cloudinary/frontend. Sem novas variáveis. O entrypoint
`auditShippingSnapshots.js` usa o loader central e lê process.env apenas nessa
fronteira; é coberto pelo teste arquitetural CFG-42. Não aceita flags de escrita,
não cria índices/coleções automaticamente e não imprime URI/secrets/PII.
