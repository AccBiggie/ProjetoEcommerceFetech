# Relatório FET-SEC-008 — Validação central de ambiente

## Resultado

CONCLUÍDO. F036 / FET-P1-019: CORRIGIDO.

## Branch

main.

## HEAD inicial

f2101f4e67a947711cf8d449c05d5073a3fde690

## HEAD final

f2101f4e67a947711cf8d449c05d5073a3fde690. Sem commit nesta tarefa.

## Estado do worktree

Inicialmente limpo. F020 estava commitada em f2101f4, preservada integralmente. Nenhuma alteração anterior pendente. Esta tarefa permanece no worktree, sem staging/commit/push.

## Finding tratado

F036 / FET-P1-019 — validação incompleta de configuração no startup.

## Finding reproduzido antes da correção

Probe controlado com dotenv substituído e Mongo interceptado, sem usar config.env real: production sem JWT_SECRET/JWT_EXPIRE, DB_URI com protocolo HTTPS inválido e apenas HOST do grupo SMTP chegou à configuração Cloudinary e tentativa de conexão Mongo. Contadores: Mongo 1, Cloudinary config 1. A conexão foi interrompida por sentinela local; nenhum serviço externo foi chamado. Não foi alegado listen anterior neste probe.

## Causa raiz

Leituras dispersas de env, coerções independentes e validações parciais. Ausência de contrato agregado antes das etapas externas. Timing inválido podia virar fallback silencioso; providers incompletos só eram descobertos ao usar uma rota.

## Inventário de environment

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

## Estratégia implementada

Loader dotenv único por entrypoint, quiet e sem override. Parser puro loadConfig(env), validator com erros agregados por variável, snapshots normalizados e congelados, consumidor via getRuntimeConfig(). Nenhum ciclo config→app. Parsers de cookie/proxy/origin F007/F020 são reutilizados. Secrets não são copiados para erros e exceptions externas não são incorporadas ao erro agregado. Startup operacional usa mensagens genéricas sem imprimir erro arbitrário de provider.

## Arquivos criados

- docs/CONFIGURACAO.md
- ecommerce/backend/config/runtimeConfig.js
- ecommerce/tests/configFixtures.js
- ecommerce/tests/configSecurity.test.js
- docs/RELATORIO_FET_SEC_008.md

## Arquivos alterados

- COMANDOS.md
- README.md
- docs/AUTENTICACAO.md
- docs/ESTADO_ATUAL_PROJETO_FETECH.md
- docs/PLANO_MELHORIAS_FETECH.md
- docs/SEGURANCA_HTTP.md
- ecommerce/backend/app.js
- ecommerce/backend/config/authCookie.js
- ecommerce/backend/config/config.env.example
- ecommerce/backend/config/csrf.js
- ecommerce/backend/config/database.js
- ecommerce/backend/config/passwordRecovery.js
- ecommerce/backend/config/trustProxy.js
- ecommerce/backend/controllers/userController.js
- ecommerce/backend/models/userModel.js
- ecommerce/backend/scripts/bootstrapAdmin.js
- ecommerce/backend/scripts/seedProducts.js
- ecommerce/backend/server.js
- ecommerce/backend/services/authRateLimiter.js
- ecommerce/backend/utils/authSession.js
- ecommerce/backend/utils/avatar.js
- ecommerce/backend/utils/sendEmail.js
- ecommerce/tests/api.test.js
- ecommerce/tests/authCookieSecurity.test.js
- ecommerce/tests/authHarness.js
- ecommerce/tests/e2e/server.js
- ecommerce/tests/httpSecurity.test.js
- ecommerce/tests/passwordRecoverySecurity.test.js
- ecommerce/tests/privateResponseSecurity.test.js

## Dependências adicionadas

NENHUMA. Package manifests e lockfiles intactos.

## Configuração central

Arquivo: ecommerce/backend/config/runtimeConfig.js.
API: loadConfig(env, { profile }), initializeConfig(env, options), getRuntimeConfig(), loadEnvironment(), ConfigurationError. A API de configuração não chama process.exit; o entrypoint decide o exit code. getRuntimeConfig valida uma única vez na ausência de snapshot; depois fornece o snapshot já tipado. Nenhum módulo de negócio relê process.env.

## Perfis

Server: contrato completo, todos os ambientes. Bootstrap: somente NODE_ENV/DB_URI, preserva CLI interativa, confirmação e lock. Seed: somente NODE_ENV/DB_URI mais guard local existente. Test: NODE_ENV=test usando perfil server, sem profile que dispense regras produtivas; fixtures explícitas e mocks. E2E_BROWSER pertence somente ao runner Playwright e não ao servidor.

## Regras de production

- NODE_ENV=production explícito; typo/string vazia recusados.
- DB_URI com protocolo Mongo suportado e database explícita; database test proibida.
- JWT_SECRET obrigatório, >=32 bytes, sem placeholder ou whitespace nas extremidades.
- JWT_EXPIRE obrigatório, expiração positiva e representável; sem sessão sem expiração.
- COOKIE_EXPIRE finito, positivo em dias e data representável.
- FRONTEND_URL obrigatória, HTTPS absoluta sem credenciais/wildcard; path normalizado explicitamente para origin conforme F020.
- TRUST_PROXY_HOPS inteiro estrito 0..5; porta inteiro 1..65535.
- SMTP completo obrigatório; Cloudinary opcional, porém grupo parcial recusado.
- PASSWORD/CLOUDINARY_API_SECRET com whitespace nas extremidades são recusados, sem trim silencioso.

## Defaults seguros

NODE_ENV ausente → development; PORT → 4000 (contrato atual, também em produção); proxy → 0/false; timing → 300 ms; EMAIL_SECURE → porta 465. Frontend local ausente → origin localhost:3000, com allowlist local F020. Nenhum default de secret, database, JWT_EXPIRE ou cookie foi inventado. Políticas F008 continuam constantes originais, congeladas.

## Configurações obrigatórias

Server em todos os ambientes: DB_URI, JWT_SECRET, JWT_EXPIRE, COOKIE_EXPIRE. Production também FRONTEND_URL e HOST/PORTEMAIL/USER/PASSWORD. Bootstrap/seed: NODE_ENV válido (ou default development) e DB_URI. Banco explícito em todos os perfis.

## Configurações opcionais

PORT, TRUST_PROXY_HOPS, AUTH_FORGOT_MIN_RESPONSE_MS e EMAIL_SECURE têm defaults documentados. FRONTEND_URL local pode estar ausente. SMTP local e Cloudinary podem estar totalmente ausentes/vazios. E2E_BROWSER é exclusivo dos testes. Nenhuma env artificial para rate limit/lock foi criada.

## Grupos condicionais

### SMTP

HOST/PORTEMAIL/USER/PASSWORD completos se qualquer campo estiver preenchido, inclusive EMAIL_SECURE. Production exige o transporte. Local/test podem desabilitar o grupo inteiro. PORTEMAIL sem default, inteiro 1..65535; EMAIL_SECURE true/false estrito. Ausência preserva recuperação pública uniforme e limpeza do token F009.

### Cloudinary

NAME/API_KEY/API_SECRET completos quando algum estiver preenchido. Sem foto continua funcionando sem provider; tentativa de avatar sem provider continua 503. Produto usa URLs armazenadas. Configuração não demonstra conectividade/credencial válida.

## Secrets

Valores reais não foram carregados pelos testes nem alterados. Erros, stdout/stderr dos probes e documentação não contêm secrets reais. Exceções carregam apenas nomes e motivos fixos; nunca valores rejeitados. Não imprimir o objeto config (contém credenciais). Nenhum JWT real é incluído nos documentos.

## Startup fail-fast

Validação antes de Mongo: SIM. Antes de listen: SIM. Antes de configurar Cloudinary/importar app: SIM. Configuração inválida: exit 1. Parser Mongo usa MongoClient já instalado para validar sem abrir sockets, incluindo replica sets/IPv6/opções. Spies comprovam ordem válida: validated → connect → prepare → listen.

## Testes adicionados

- CFG-01: development mínimo válido e valores tipados.
- CFG-02: test isolado válido.
- CFG-03: production válida sem conexão.
- CFG-04: ambientes desconhecidos e vazios rejeitados.
- CFG-05: JWT ausente/vazio.
- CFG-06: JWT curto, placeholders e whitespace rejeitados.
- CFG-07: secret não consta da exceção.
- CFG-08: JWT_EXPIRE ausente/vazio.
- CFG-09: duração JWT inválida e positiva compatível.
- CFG-10: cookie inválido e data representável.
- CFG-11: frontend ausente production.
- CFG-12: frontend HTTP production rejeitada.
- CFG-13: frontend credenciais e wildcard rejeitados.
- CFG-14: origin normalizada preserva contrato F020 de path.
- CFG-15: proxy limites 0..5 e formato estrito.
- CFG-16: porta limites e formato estrito.
- CFG-17: Mongo ausente production.
- CFG-18: Mongo protocolos e database explícita.
- CFG-19: Mongo senha não vaza.
- CFG-20: SMTP ausente development permitido.
- CFG-21: SMTP parcial recusado e production exige transporte.
- CFG-22: SMTP completo tipado sem chamadas externas.
- CFG-23: SMTP porta e booleano estritos.
- CFG-24: SMTP senha não vaza.
- CFG-25: Cloudinary parcial recusado.
- CFG-26: Cloudinary completo e fallback sem foto.
- CFG-27: Cloudinary secret não vaza.
- CFG-28: política rate limit válida, sem env artificial.
- CFG-29: defaults de F008 preservados.
- CFG-30: timing 0..5000 e default 300.
- CFG-31: erros agregados identificam todas as falhas.
- CFG-32: erros agregados não armazenam valores sensíveis.
- CFG-33: startup inválido não cria app/listen nem configura providers.
- CFG-34: startup inválido não conecta Mongo.
- CFG-35: startup válido valida antes de connect/prepare/listen.
- CFG-36: F007 política cookie production.
- CFG-37: limiter recebe política central.
- CFG-38: piso F009 recebe valor normalizado.
- CFG-39: bootstrap e seed exigem somente env e Mongo.
- CFG-40: F020 allowlist usa origin central.
- CFG-41: CLI recusa configuração, exit 1 e stdout/stderr seguros.
- CFG-42: consumidores sem leitura direta de env.
- CFG-43: resultado congelado e env original não alterado.
- CFG-44: NODE_ENV ausente usa development; sem secret default.
- CFG-45: Mongo replica set, IPv6 e opções inválidas sem conectar.
- CFG-46: grupos vazios são ausentes; tipos não string recusados.

## Testes focados

`node --test ecommerce/tests/configSecurity.test.js`: 46/46, 842 ms.

## API completa

`npm.cmd test --prefix ecommerce`: 306/306, 37,950 s. 260 testes anteriores preservados e 46 novos.

## Build

`npm.cmd run build --prefix ecommerce/frontend`: APROVADO, 4,00 s.

## E2E

`npm.cmd run test:e2e --prefix ecommerce`: 21/21 sob CSP real do build, 2,1 min, exit code 0. Reexecução confirma também exit code nativo, pois PowerShell marcou stderr de warning NO_COLOR/FORCE_COLOR como NativeCommandError na primeira captura, embora os 21 testes tivessem passado. Nenhum código foi modificado por esse warning.

## npm audit

Executado: NÃO. Nenhuma dependência/lockfile mudou; a task dispensa reexecução nessa condição. Baseline anterior FET-SEC-007: zero vulnerabilidades. Não foi executado audit fix.

## Probe production válida

Aceita: environment production, port 4000, origin https://shop.example.test, proxy hops 0, SMTP habilitado e Cloudinary opcional desabilitado. Apenas propriedades não sensíveis foram exibidas.

## Probe production inválida

Múltiplas falhas agregadas: DB_URI, JWT_SECRET, COOKIE_EXPIRE e FRONTEND_URL. Startup recusado. Mongo connect: NÃO. Listen: NÃO. App/provider também não executados, conforme spies CFG-33/34 e CLI CFG-41.

## Probe de redaction

JWT secret vazou: NÃO. Mongo password vazou: NÃO. SMTP password vazou: NÃO. Cloudinary secret vazou: NÃO. Sentinelas fictícias não aparecem na stack/JSON da exception nem em stdout/stderr capturados do entrypoint.

## Probe SMTP

Parcial: recusado, campos faltantes listados sem valores. Completo: sintaticamente aprovado, port inteiro e secure booleano. Conectividade externa testada: NÃO.

## Probe Cloudinary

Parcial: recusado. Completo: sintaticamente aprovado. Conectividade externa testada: NÃO.

## Probe FRONTEND_URL

HTTP production: recusado. HTTPS production: aceito; origin normalizada. Allowlist central comprovada em CFG-40; cross-site continua 403 na suíte HTTP permanente.

## Probe proxy

0: aceito, false no Express. 1: aceito. 5: aceito. true/-1/6/abc: recusados. X-Forwarded-For não cria bypass no default.

## F006

CONTINUA CORRIGIDO. API completa valida tokenVersion, logout, replay 401, troca/reset de senha e isolamento de sessões antigas.

## F007

CONTINUA CORRIGIDO. Testes CC completos e CFG-36 preservam Secure production, HttpOnly, SameSite=Lax, Path=/, cookie host-only e hops 0..5.

## F008

CONTINUA CORRIGIDO. Políticas originais centralmente expostas sem novas envs; testes RL e HTTP preservam sexta falha 429 + Retry-After, Mongo compartilhado e falha segura.

## F009

CONTINUA CORRIGIDO. Testes PR/API preservam resposta uniforme, timing, SMTP falho/ausente, limpeza do token e concorrência. Timing normalizado exposto por config.

## F010

CONTINUA CORRIGIDO. Suíte adminSafety preserva autoações bloqueadas, último admin, lock e CLI bootstrap; perfil bootstrap não exige configuração HTTP irrelevante.

## F020

CONTINUA CORRIGIDO. 50 testes HTTP e 21 E2E sob CSP preservam Helmet/CSP/nosniff/frame/referrer/CSRF/Origin/Fetch Metadata, logout POST e GET/HEAD 405 sem mutação.

## F021

CONTINUA CORRIGIDO. Testes privados/auth/API preservam ausência de JWT no JSON, no-store e sessão no cookie HttpOnly.

## Findings ainda abertos relacionados

F023 deployment/TLS/reverse proxy; F025 observabilidade; F029 SMTP/Cloudinary reais; F024 backup/restore.

## Banco utilizado

Somente Mongo local em databases temporários com prefixos fetech_routes_, fetech_routes_auth_ e fetech_e2e_, derivados de PID/timestamp e removidos pelos harnesses. Validação de configuração não conecta a banco externo. BANCO REAL NÃO ALTERADO.

## Serviços externos

SMTP real chamado: NÃO. Cloudinary real chamado: NÃO. Transportes/upload são mocks dos testes existentes; probes são sintáticos ou interceptados.

## Config.env

NÃO SOBRESCRITO. Continua ignorado e fora de tracking/staging; somente config.env.example mudou.

## Secrets

NENHUM SEGREDO REAL EXPOSTO OU ALTERADO.

## Documentação atualizada

CONFIGURACAO.md, este relatório, README.md, COMANDOS.md, AUTENTICACAO.md, SEGURANCA_HTTP.md, ESTADO_ATUAL_PROJETO_FETECH.md, PLANO_MELHORIAS_FETECH.md. DEPENDENCIAS.md não exigiu alteração porque não houve pacote novo.

## Auditoria histórica

NÃO ALTERADA. MD e PDF históricos preservados.

## Alterações fora de escopo

NENHUMA. Logs temporários e probes permanecem ignorados em .local. Frontend de negócio, contratos de pedidos/estoque/pagamento, CSP e cookie não foram alterados. Startup só foi ajustado para validar antes das etapas existentes e evitar impressão de mensagens arbitrárias com secrets.

## Impacto de compatibilidade

Ambiente desconhecido/vazio; Mongo inválido/sem database; database test em production; JWT ausente/curto/placeholder/sem expiração válida; porta/proxy inválidos; cookie sem data futura válida; origin produtiva HTTP; SMTP/Cloudinary parciais; booleano inválido e timing fora de 0..5000 passam a impedir startup. Config antiga com PORTEMAIL/EMAIL_SECURE preenchidos e transporte vazio agora é parcial. Paths de FRONTEND_URL são normalizados explicitamente para origin também nos links de reset. Alteração de process.env após startup não modifica consumidores: reinicie o processo.

## Riscos residuais

Validação sintática não comprova conectividade externa; gestão/rotação de secrets depende de infraestrutura/procedimento operacional; SMTP/Cloudinary não foram verificados remotamente; observabilidade production permanece pendente; deployment real/TLS não foi provado; backup/restore permanece pendente. Verificação de comprimento/placeholders não mede entropia.

## Status da remediação

F036 / FET-P1-019: CORRIGIDO.

## Próxima task recomendada

F014 / FET-P0-010 — modelo monetário exato em centavos antes de alterações de pedido, estoque e pagamento. NÃO INICIADA.
