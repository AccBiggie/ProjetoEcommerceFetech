# Relatório FET-MEDIA-001 — F018 e F019

## Resultado

F018 **CORRIGIDO NO CÓDIGO**. F019 **CORRIGIDO NO CÓDIGO PARA NOVAS SUBSTITUIÇÕES**. Upload binário validado e lifecycle durável implementados e verificados com Mongo temporário e provider fake. Assets históricos não gerenciados exigem revisão humana; integração Cloudinary real não foi validada.

## Branch

main.

## HEAD inicial

991b4a36b9a4eaed5159d998272d80c7bf090022 (F017 commitada).

## HEAD final

991b4a36b9a4eaed5159d998272d80c7bf090022. Nenhum commit nesta tarefa.

## Estado do worktree

Inicial limpo; final com alterações desta tarefa, sem stage/commit. Não houve mudança de branch, push, deploy ou operação em banco real.

## Findings tratados

F018 / upload arbitrário de avatar e F019 / assets órfãos na substituição. Escopo: avatar do User. Não foi criado upload de Product/Category ou endpoint administrativo de mídia.

## F018 reproduzido antes da correção

Probe HTTP autenticado executado antes da alteração de produção: PUT de perfil com `https://example.test/not-an-image.txt` retornou 200 e o stub de Cloudinary recebeu essa string diretamente. Não houve rede real. Evidência capturada: PRE_F018, providerCalled=true, providerArgument igual ao input. Replay histórico isolado em tests/helpers/avatarLegacyProbe.js mantém a demonstração fora da suíte normal; o replay atual não representa o handler corrigido.

## F019 reproduzido antes da correção

O mesmo probe mostrou old-avatar substituído por new-avatar, uma chamada upload e zero chamadas destroy; nenhuma obrigação persistida de limpeza. Evidência PRE_F019, orphan=true. Dois probes passaram antes da correção; replay histórico posterior também passou 2/2.

## Inventário anterior

backend/utils/avatar.js enviava string arbitrária para uploader.upload com folder=avatars, width=150/crop=scale. Cadastro e perfil recebiam avatar string. User guardava public_id/url sem revision ou ledger. Frontend usava FileReader/data URI. Parser multipart era global e anterior à autenticação. Não havia compensação, cleanup durável, reconciliação ou auditoria de mídia. Public IDs históricos não provam ownership por usuário.

## Estratégia implementada

Endpoint dedicado binário; perfil/cadastro JSON com campos de mídia recusados; decoder real; provider encapsulado; namespace controlado pelo servidor; intent antes do upload; attach e obrigação antiga em transação com CAS; cleanup protegido por referências e fence; reconciler dry-run e auditor read-only. Contrato detalhado em [AVATAR_E_MIDIA.md](AVATAR_E_MIDIA.md).

## Contrato HTTP

PUT /api/v1/me/avatar: multipart, um arquivo avatar, sem campos extras, sessão ativa + CSRF/Origin + dez tentativas por conta/hora. 400 contrato, 401 sessão, 403 CSRF, 409 CAS, 413 tamanho, 415 conteúdo, 429 limite, 502 provider inválido/falha, 503 provider ausente. Retorna User confirmado. Register/me/update usam JSON; mídia nesses endpoints retorna 400. Perfil textual continua disponível sem Cloudinary.

## Validation

Limite rígido 5 MiB; assinatura + MIME concordante + formato real + decodificação integral Sharp, limite 16.777.216 pixels, sem animação/multipágina. PNG/JPEG/WebP aceitos; SVG/GIF/PDF/texto/truncado/spoof recusados. Arquivo reencodado como PNG até 512×512; filename/extensão não entram no provider/namespace. Limite exato e +1 byte testados.

## Provider boundary

mediaProvider.js aceita Buffer e managed ID; upload_stream, resource_type image, overwrite false, timeout 30 s. secure_url HTTPS e public_id correspondente são obrigatórios. Erros sanitizados. destroyImage aceita apenas managed namespace. Fake fica nos testes; produção não importa fake. Provider é chamado fora das transações.

## Managed namespace

fetech/users/<ObjectId>/avatar/<UUID-v4>. ID gerado por crypto.randomUUID no servidor antes do upload. Nenhum nome, path, public_id, revision ou URL do cliente determina o identificador. Assets legados fora dessa forma são LEGACY_UNMANAGED_AVATAR, sem remoção automática.

## MediaUploadIntent

User, kind, provider, publicId único, expectedAvatarRevision, status PREPARED/UPLOADED/ATTACHED/CLEANING/CLEANED/FAILED, failureCode técnico e timestamps. PREPARED precede qualquer upload externo. Sem TTL, bytes, URL, email, filename ou segredo. CLEANING impede attach durante cleanup.

## MediaCleanupTask

User, kind, provider, publicId, reason REPLACED_AVATAR/UNATTACHED_UPLOAD, status PENDING/COMPLETED/BLOCKED, attempts, lastAttemptAt, failureCode e timestamps. Unique provider/publicId, sem TTL. Anterior não gerenciado gera BLOCKED para revisão humana. Padrão local não gera destroy.

## Avatar revision

Inteiro seguro controlado pelo servidor, oculto na resposta; legado ausente equivale a zero. CAS valida revision, tokenVersion e conta ativa. Revision inválida falha 409; nenhum reparo automático.

## Replacement flow

Validar bytes → preparar intent → upload fora de transação → validar resposta → intent UPLOADED → transação de User/revision/ATTACHED/task antiga → commit → cleanup externo. Falha na persistência da obrigação antiga aborta attach. O anterior só é removido depois do commit.

## Failure handling

Provider indisponível/erro não altera avatar. Resposta inválida fica sujeita à compensação. Falha DB pós-upload conserva intent anterior ao efeito e, quando possível, task. Resultado desconhecido de commit exige consulta de referências antes da limpeza. Destroy pós-commit falho mantém PENDING sem falhar resposta da substituição. not found conclui; repetição é idempotente. Crash antes de attach e após commit têm recuperação verificada. Resposta tardia não pode attach depois de CLEANING; task COMPLETED pode ser reaberta se asset reaparecer.

## Concurrent replacement

Duas e dez operações sobre mesma revision: exatamente um vencedor; demais 409. Avatar/revision correspondem ao vencedor; perdedores compensados. Testes incluem conexão independente e dois processos API, não só Promise.all no mesmo processo. Cleanup jamais remove winner/current/shared.

## Profile concurrency

Perfil textual escreve apenas name/email; não substitui avatar/revision. Corrida com upload pausado preserva ambos. Frontend separa salvar foto e salvar texto, conserva campos textuais locais durante atualização de foto e mostra erro sem desmontar o formulário.

## F016 integration

Conta desativada não faz upload. Corrida com desativação aborta attach e preserva foto anterior. Deactivation não remove avatar. Referências de qualquer User, inclusive inativo, impedem destroy. Erasure permanece F030.

## Reconciliation

reconcile:media sem args é dry-run, sem provider/escrita. Apply exige --apply --confirm-db NOME_EXATO antes de conectar, replica set/mongos e provider. Graça 15 minutos; estado/referências reconsultados; stale PREPARED/UPLOADED/FAILED/CLEANING sem referência pode gerar cleanup. Referenciado vira ATTACHED. Legado bloqueado. Tasks em andamento frescas ficam protegidas. CLI apply verificada só em database temporária com fake injetado.

## Media audit

audit:media usa acesso nativo read-only, autoCreate/autoIndex false e não carrega provider. Detecta metadata ausente, URL insegura, namespace legado, IDs compartilhados, intent stale, ATTACHED sem referência e tasks pendentes/bloqueadas. Output: contagens, códigos e IDs técnicos, sem publicId/URL/PII. Testes proíbem writes e comparam snapshots exatos, inclusive CLI.

## Logs F025

Eventos user.avatar.updated/upload_failed, media.cleanup.pending/completed/blocked; IDs técnicos e failureCode allowlisted. Não há bytes, filename, publicId, URL assinada, segredos ou erro bruto do provider. Sentinelas privadas testadas. Allowlist de códigos CATEGORY_* no logger foi alinhada ao contrato F017 enquanto a de mídia foi incluída.

## Frontend

Register JSON/avatar padrão. UpdateProfile mantém File local e usa FormData; object URL revogada na troca/unmount; limite/formato explícitos, pendência e erros visíveis. Nenhum arquivo/base64 em Redux/localStorage. Sucesso aplica User confirmado; erro tenta refetch sem LOAD_USER_REQUEST para evitar desmontagem da rota protegida. E2E inclui preview, persistência/reload, spoof, oversized e perfil textual.

## Arquivos criados

- backend/middleware/avatarMultipart.js
- backend/models/mediaUploadIntentModel.js e mediaCleanupTaskModel.js
- backend/services/mediaProvider.js e avatarMediaService.js
- backend/utils/mediaContract.js, avatarContent.js e mediaAudit.js
- backend/scripts/auditMedia.js e reconcileMedia.js
- tests/avatarUploadSecurity.test.js, avatarMediaLifecycle.test.js, mediaReconciliation.test.js e mediaAudit.test.js
- tests/helpers/fakeMediaProvider.js, mediaHarness.js, avatarWorker.js e avatarLegacyProbe.js
- tests/e2e/avatar.spec.js
- docs/AVATAR_E_MIDIA.md e este relatório

Os caminhos backend/tests são relativos a ecommerce/.

## Arquivos alterados

ecommerce/backend/app.js; config/authRateLimits.js/runtimeConfig.js; controllers/userController.js; middleware/authRateLimit.js/erros.js; models/userModel.js; observability/logger.js; routes/userRoutes.js; utils/userLifecycle.js. utils/avatar.js removido. Frontend: actions/userAction.js e component/User/FormLayout.jsx/LoginSignUp.jsx/UpdateProfile.jsx. ecommerce/package.json/package-lock.json; tests/api.test.js/configSecurity.test.js/observability.test.js/e2e/server.js. Documentação listada abaixo. config.env e auditoria histórica intactos.

## Dependências adicionadas

sharp ^0.35.5 e lockfile correspondente, para decodificação integral real; quatro pacotes instalados na plataforma local. Entradas opcionais de outras plataformas aparecem no lockfile. Referência primária: [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/). Backend audit: zero vulnerabilidades.

## Testes adicionados

Quatro suítes focadas, worker de crash/processos, harness Mongo real isolado, provider fake, replay histórico e E2E. Comando focado:

```powershell
node --test ecommerce/tests/avatarUploadSecurity.test.js ecommerce/tests/avatarMediaLifecycle.test.js ecommerce/tests/mediaReconciliation.test.js ecommerce/tests/mediaAudit.test.js
```

## Focused upload security

34/34 aprovados: fontes URL/data URI, multipart inválido, ausência/múltiplos/extras, JPEG/PNG/WebP, spoof/SVG/GIF/PDF/texto/truncado, MIME divergente, limite exato e oversized, filename malicioso, respostas inválidas, stream adapter, config ausente, auth/CSRF/JWT/deactivation/rate limit, sem TTL/PII.

## Focused lifecycle

21/21 aprovados: ordem durável, default/legacy, falhas de upload/destroy/DB/task/attach, not found, CAS 2/10, conexões independentes, perfil textual, deactivation, revision inválida, ledger inacessível, crash antes/depois e duas APIs.

## Focused reconciliation

15/15 aprovados: stale por estado, referências ativas/inativas, graça, shared/current, legado bloqueado, dry-run exato, confirmação CLI, unique/sem TTL, fence e reabertura de task.

## Focused audit

9/9 aprovados: gerenciado/padrão, metadata/URL/legacy/shared/stale/task, redaction, snapshots read-only, perfis F036, fronteira arquitetural e CLI com apply fake isolado.

Total focado: **79/79**, zero skip, 18,616 s.

## API completa

npm.cmd test --prefix ecommerce: **1.177 testes, 1.162 aprovados, zero falhas, 15 skips**, 154,332 s. Reexecutada após os últimos ajustes de produção do backend. Ajuste posterior apenas de estado do frontend foi validado pelo build/E2E.

## F024 skips

Os mesmos quinze casos dependentes de ferramentas Mongo de backup/restore permanecem skips. Nenhuma ferramenta foi baixada e nenhum restore drill real foi executado. **F024 CONTINUA PARCIAL**.

## Build

npm.cmd run build --prefix ecommerce/frontend aprovado após o ajuste de exibição de erro, 756 ms. Comando no pacote backend não possui script build; foi corrigido para o pacote frontend.

## E2E

**34/34 aprovados**, zero falhas, 2,6 minutos, código de saída do runner 0 confirmado explicitamente. Primeira execução encontrou erro de UI no refetch após 415 (corrigido). Um caso posterior falhou durante troca dos assets em rebuild concorrente; passou na execução final com build estável, sem rebuild simultâneo. Avisos no stderr do PowerShell motivaram confirmação explícita do exit code. Testes fazem requests HTTP reais ao servidor temporário; provider fake e imagens externas interceptadas pelo browser, sem Cloudinary real.

## git diff --check

**Aprovado**, sem erros de whitespace. Espaços finais de documentação foram removidos. HEAD/config.env/auditoria histórica conferidos no diff final.

## npm audit

npm.cmd audit --prefix ecommerce --cache .local/npm-cache: **found 0 vulnerabilities**, exit 0. Nenhum pacote frontend foi adicionado.

## Probe remote URL

Antes: 200 e provider chamado. Depois: profile/dedicated 400, provider zero chamadas, inclusive http/https/ftp/localhost/data URI.

## Probe type spoof

Texto em fake.jpg com MIME image/jpeg retorna 415; nenhuma intent/upload criada. SVG/GIF/PDF/truncado e MIME divergente também recusados.

## Probe successful replacement

User aponta ao novo managed ID, revision incrementada, intent ATTACHED e task antiga commitada antes de destroy. Default preservado, sem destroy; legacy remoto não gerenciado BLOCKED.

## Probe destroy failure

Troca permanece concluída; task PENDING com attempts/failureCode, depois retry completa. Asset atual preservado.

## Probe DB failure

Falha de obrigação/attach aborta User/revision. Falha total depois do upload mantém PREPARED durável; reconciliação posterior limpa apenas novo asset sem referência. Provider ambíguo e commit desconhecido não autorizam remover avatar atual.

## Probe concurrent replacements

2/10 e dois processos API: um vencedor, conflitos 409, nenhum cleanup do vencedor, nenhum lost update textual. Crashes antes de attach/após commit recuperáveis.

## Probe stale intent

Após graça, sem referência: CLEANING → cleanup → CLEANED. Com referência: ATTACHED, sem destroy. Fresh permanece protegido.

## Probe shared asset

Outra conta, inclusive DEACTIVATED, referenciando publicId bloqueia destroy e preserva asset. Auditor reporta compartilhamento sem revelar publicId ou dados pessoais.

## Banco utilizado

Somente replica sets/databases temporários dos harnesses/runWithReplicaSet, com teardown. Não houve conexão operacional com banco real/comercial. Nenhuma migração real, restauração real ou limpeza produtiva.

## Provider real

**NÃO CHAMADO**. Upload/destroy usam fake injetado ou stub em memória; CLI apply tem fake explícito somente no teste. Sem chamadas Cloudinary reais, enumeração ou exclusão remota.

## Findings preservados

| Finding | Estado nesta entrega |
| --- | --- |
| F002 | CONTINUA CORRIGIDO |
| F003 | CONTINUA CORRIGIDO |
| F004 | CONTINUA CORRIGIDO |
| F005 | CONTINUA CORRIGIDO |
| F006 | CONTINUA CORRIGIDO |
| F007 | CONTINUA CORRIGIDO |
| F008 | CONTINUA CORRIGIDO |
| F009 | CONTINUA CORRIGIDO |
| F010 | CONTINUA CORRIGIDO |
| F011 | CONTINUA CORRIGIDO |
| F012 | CONTINUA CORRIGIDO |
| F013 | CONTINUA CORRIGIDO |
| F014 | CONTINUA CORRIGIDO |
| F015 | CONTINUA CORRIGIDO |
| F016 | CONTINUA CORRIGIDO |
| F017 | CONTINUA CORRIGIDO |
| F020 | CONTINUA CORRIGIDO |
| F021 | CONTINUA CORRIGIDO |
| F025 | CONTINUA CORRIGIDO |
| F036 | CONTINUA CORRIGIDO |
| F024 | CONTINUA PARCIAL |
| F029 | CONTINUA ABERTO: Cloudinary real não validado |

## Findings adiados

F001 — pagamento e F027 — frete: **NÃO INICIADOS**.

## Finding relacionado ainda aberto

F030 — privacy/retention/anonymization e mídia pessoal: **CONTINUA ABERTO**.

## Documentação atualizada

AVATAR_E_MIDIA.md, este relatório, ROTAS.md, AUTENTICACAO.md, LIFECYCLE_USUARIOS.md, OBSERVABILIDADE.md, CONFIGURACAO.md, ESTADO_ATUAL_PROJETO_FETECH.md e PLANO_MELHORIAS_FETECH.md.

## Auditoria histórica

**NÃO ALTERADA**. Atualizações de status constam apenas na documentação viva.

## Alterações fora de escopo

Nenhuma mudança funcional comercial fora de escopo. A allowlist de códigos CATEGORY_* no logger foi alinhada à correção F017 existente, junto à allowlist de mídia.

## Impacto de compatibilidade

Remote URL/base64/data URI deixam de ser aceitos. Frontend usa multipart binário; formatos JPEG/PNG/WebP e limite 5 MiB são obrigatórios. Clientes externos que enviavam string devem migrar. Metadata legada continua legível; assets não gerenciados nunca são apagados automaticamente. Cadastro não envia foto, usando padrão até upload autenticado.

## Riscos residuais

Assets históricos órfãos ainda podem existir fora do ledger; não houve inventário remoto. Cloudinary real exige F029. Cleanup produtivo exige agenda, monitoramento e revisão de bloqueios. Provider com resposta além da graça pode exigir novo ciclo de reconciliação. Privacidade/erasure continua F030; conta desativada preserva avatar. F024 precisa de restore drill. Pagamento/frete continuam adiados. Nenhuma garantia de atomicidade entre Mongo e Cloudinary é declarada: a recuperação depende do ledger e da operação do reconciler.

## Status da remediação

F018 **CORRIGIDO NO CÓDIGO**: entrada não confiável não chega ao provider e conteúdo real é validado antes de upload. F019 **CORRIGIDO NO CÓDIGO PARA NOVAS SUBSTITUIÇÕES**: obrigação durável, CAS, compensação e reconciliação protegem as novas operações; patrimônio histórico não gerenciado exige revisão e integração real continua aberta.

## Próxima task recomendada

**F031** — estado persistido do frontend tolerante a corrupção/migração de localStorage, com Error Boundary/fallback de recuperação. Não iniciada automaticamente. F001/F027 adiados; F024 parcial.
