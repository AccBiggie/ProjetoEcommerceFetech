# Avatar e ciclo de vida de mídia

FET-MEDIA-001, 09/10/2026: F018 corrigido no código; F019 corrigido para novas substituições. Cloudinary real não foi validado (F029). Retenção e apagamento de dados pessoais continuam na F030.

## Contrato HTTP

`PUT /api/v1/me/avatar` exige sessão ativa, JWT vigente e as proteções CSRF/Origin existentes. O limite distribuído é de dez tentativas por conta por hora, além das políticas HTTP existentes. Autenticação e rate limit precedem o parser multipart; CSRF precede os parsers globais.

Enviar `multipart/form-data` com exatamente um campo `avatar`, contendo arquivo binário JPEG, PNG ou WebP. Nenhum campo textual é permitido. Nome original e extensão não determinam formato nem identificador. Não definir manualmente o boundary no navegador.

O arquivo pode ter até **5 MiB (5.242.880 bytes)**. O parser usa sentinela de um byte para aceitar exatamente o limite e rejeitar qualquer byte adicional com 413. A memória fica limitada pelo tamanho e pelo número de partes; não há arquivo temporário em disco. Ausência de arquivo, partes duplicadas e campos extras retornam 400. Formato inválido, MIME divergente ou conteúdo que não decodifica retorna 415. JWT inválido/revogado ou conta desativada retorna 401; CSRF inválido retorna 403; rate limit retorna 429; conflito de substituição retorna 409; provider ausente retorna 503; falha de upload retorna 502. As respostas usam códigos AVATAR_* ou MEDIA_* seguros.

Sharp verifica assinatura, formato real, dimensões e decodificação integral, com limite de 16.777.216 pixels. Imagens animadas/multipágina são recusadas. SVG, GIF, PDF, texto, conteúdo truncado e MIME spoof são recusados antes do provider. O resultado decodificado é redimensionado para até 512×512 e reencodado como PNG. Isso reduz superfícies do conteúdo original; não constitui uma política completa de privacidade ou erasure.

`POST /api/v1/register` e `PUT /api/v1/me/update` recebem JSON. Cadastro usa avatar padrão. Perfil textual aceita somente os campos textuais já autorizados; campos de mídia/revision retornam 400. URL remota, data URI e base64 deixam de ser entradas aceitas. Clientes externos precisam migrar para a rota binária autenticada.

## Provider e identidade

`mediaProvider.js` encapsula Cloudinary e permite injeção de fake somente nos testes. Upload usa `upload_stream` com Buffer, `resource_type: image`, `overwrite: false`, timeout de 30 segundos e identificador criado no servidor:

`fetech/users/<ObjectId>/avatar/<UUID-v4>`

O provider deve devolver o mesmo public_id e uma secure_url HTTPS sem credenciais. Resposta inválida não altera o User. Nunca há fetch de URL informada pelo cliente. Destroy exige o mesmo namespace e ownership técnico. A API não expõe ledger, revision ou tarefas de cleanup.

## Persistência e concorrência

`MediaUploadIntent` existe em PREPARED **antes** do efeito externo e guarda user, kind, provider, publicId, expectedAvatarRevision, status, timestamps e failureCode técnico. UPLOADED precede attach; ATTACHED marca commit; CLEANING impede attach durante limpeza; CLEANED marca remoção concluída. FAILED também é reconciliável. Não guarda arquivo, URL, nome, email, credenciais ou resposta bruta do provider. Não usa TTL.

`User.avatarRevision` é um inteiro seguro não negativo controlado pelo servidor. Ausência em documento legado equivale a zero no CAS; não há migração automática. A transação revalida conta ativa, tokenVersion e revision. Avatar, incremento de revision, intent ATTACHED e obrigação de cleanup do anterior commitam juntos. Duas ou dez substituições concorrentes sobre a mesma revision têm um vencedor; perdedores recebem 409 e seus uploads ficam sujeitos à compensação durável. Perfil textual não escreve avatar, portanto não perde a foto nem é perdido por ela.

`MediaCleanupTask` guarda user, kind, provider, publicId, reason, status PENDING/COMPLETED/BLOCKED, attempts, lastAttemptAt, timestamps e failureCode. Índice único provider/publicId evita obrigações duplicadas. Não usa TTL. Falha de destroy após commit não desfaz a foto nem retorna erro na substituição: conserva PENDING para retry. `not found` conclui idempotentemente.

Upload e destroy sempre ficam fora da transação. Antes de destroy, uma transação verifica todas as referências de User, inclusive contas desativadas, e instala CLEANING no intent para impedir attach concorrente. Outra leitura ocorre imediatamente antes do efeito externo. Uploads em andamento dentro da graça não são removidos. Tasks bloqueadas podem ser reavaliadas, mas assets referenciados permanecem protegidos. Workers concorrentes podem repetir destroy idempotente.

Se o upload criou o asset e o banco falhou, PREPARED preserva o identificador para reconciliação. Se o commit teve resultado desconhecido, a compensação consulta referências antes de remover. Crash antes do attach e crash após o commit são cobertos por processos filhos reais nos testes. Resposta muito tardia do provider pode recriar asset já limpo: o intent é protegido contra attach e a tarefa pode ser reaberta para remover esse asset.

## Legados e desativação

`default-avatar` e `/Profile.png` nunca são enviados a destroy. Metadata legada continua legível. Public IDs antigos na pasta `avatars` não comprovam ownership por usuário; não há allowlist presumida. Ao substituir um avatar remoto não gerenciado, cria-se obrigação BLOCKED com LEGACY_UNMANAGED_AVATAR para revisão humana. Não há exclusão automática nem enumeração remota de assets históricos.

F016 continua preservando avatar ao desativar conta. Usuário desativado não faz upload; referências de contas desativadas impedem cleanup. Apagamento pessoal, retenção e anonimização continuam F030.

## Operação

Com configuração de conexão autorizada, o operador pode executar:

```powershell
npm.cmd run audit:media --prefix ecommerce
npm.cmd run reconcile:media --prefix ecommerce
npm.cmd run reconcile:media --prefix ecommerce -- --apply --confirm-db NOME_EXATO
```

Audit é somente leitura, sem provider, índices ou mutações. Reporta metadata incompleta, URL insegura, namespace legado, publicId compartilhado, intent stale, ATTACHED sem referência e tarefas pendentes/bloqueadas. Saída contém contagens, códigos e IDs técnicos, sem publicId, URL, dados pessoais ou segredos.

Reconciliação é **dry-run por padrão**, sem provider nem escrita. Apply exige confirmação exata da database antes de conectar, Mongo transacional e provider configurado. A graça é de **15 minutos**. Reconsulta estado e referências no processamento; nunca varre/deleta todos os assets do provider. Nenhum desses comandos foi executado contra banco real nesta tarefa. Produção exige agenda externa, monitoramento de backlog/falhas e revisão dos bloqueios; não há scheduler embutido.

Perfis `media-audit` e `media-reconcile` aceitam configuração mínima de banco. Apply exige Cloudinary completo; configuração parcial continua falhando conforme F036. config.env real não foi alterado.

## Frontend e observabilidade

Cadastro envia JSON e usa padrão. Perfil mantém File apenas em estado local, envia FormData com o arquivo e usa object URL para preview, revogando na troca e no unmount. Botão de foto tem estado de envio; erros descartam a seleção e recarregam o User confirmado. Nenhum arquivo/base64 entra em Redux ou localStorage.

Eventos seguros: user.avatar.updated, user.avatar.upload_failed, media.cleanup.pending, media.cleanup.completed e media.cleanup.blocked. Logs usam IDs técnicos e failureCode, sem bytes, filename, publicId, URL assinada ou resposta bruta. Monitorar PENDING antigo, BLOCKED, intent stale e tentativas sem conclusão; falhas externas permanecem sanitarizadas.

Testes e evidências: [RELATORIO_FET_MEDIA_001.md](RELATORIO_FET_MEDIA_001.md). Assets históricos órfãos ainda podem existir; integração real continua F029, restore drill F024 permanece parcial, pagamento F001 e frete F027 permanecem adiados.
# Integração de anonimização F030

ACCOUNT_ANONYMIZATION cria MediaCleanupTask atomicamente com User, Address,
reviews, PrivacyRequest e AuditEvent. Avatar passa ao padrão antes do destroy,
executado fora da transação. Falha mantém PENDING; legado sem ownership ou
referência compartilhada fica BLOCKED. Nenhum provider real foi chamado nesta
task. [Contrato](PRIVACIDADE_E_RETENCAO.md).
