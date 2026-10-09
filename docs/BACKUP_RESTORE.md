# Backup e recuperação do MongoDB — FET-OPS-001

Status em 08/10/2026: **F024 / FET-P0-012 PARCIAL — VALIDAÇÃO REAL BLOQUEADA**. Os scripts e testes estão implementados. `mongodump` e `mongorestore` não estão disponíveis neste ambiente; o usuário escolheu não baixar as ferramentas. Não existe evidência de backup recuperável nem RTO medido nesta entrega. Não aplicar migrações comerciais com base somente nesta implementação.

## Pré-requisitos

- Node/npm nas versões do projeto e dependências instaladas.
- MongoDB replica set, database explícita da aplicação e credencial operacional de menor privilégio.
- MongoDB Database Tools oficiais 100.x compatíveis com a versão do servidor. O recurso `--config` exige versão 100.3 ou posterior; utilize versão atual compatível, não 100.0–100.2. Nenhum script instala ferramentas.
- Para captura: leitura de todas as collections, metadados/índices e `local.oplog.rs`. Para restore: leitura/verificação e criação de collections, documentos e índices apenas no destino autorizado; remoção do marcador de operação após sucesso.
- Espaço para archive, destino e índices; janela sem escritas na origem; diretório privado em armazenamento criptografado. Permissões POSIX solicitadas pelo código não configuram ACL NTFS. Validar ACL Windows/conta de serviço externamente.

O perfil central `database-operations` exige somente `NODE_ENV` e `DB_URI` válidos; dispensa JWT/SMTP/Cloudinary. O `config.env` existente é apenas lido, nunca sobrescrito. Variáveis já fornecidas pelo processo prevalecem. URI e credenciais não devem ser copiadas para chats, comandos versionados ou relatórios.

## Contrato e consistência

O backup chama `mongodump --archive --gzip`: o conteúdo é BSON produzido pela ferramenta oficial, não uma exportação JSON. Restore usa `mongorestore`, remapeando exclusivamente `origem.*` para `destino.*`. Esses recursos e os metadados de índices são descritos na [documentação de mongodump](https://www.mongodb.com/docs/database-tools/mongodump/) e na [documentação de mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/).

Nesta estratégia de database única, não usamos `--oplog`: ele exige dump completo do replica set. `--oplogReplay` também exige restore completo e é incompatível com os filtros/remapeamentos de namespace utilizados aqui. Consulte as restrições oficiais de [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/) e [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/). Portanto, esta implementação **não oferece snapshot online de uma origem em escrita contínua nem recuperação point-in-time**.

O operador deve preparar uma janela sem escritas: tráfego que altera dados, jobs, TTL e outras integrações. O script não interrompe a API nem altera configuração do servidor/TTL. Antes e depois da captura calcula contagens e hashes; verifica cobertura do oplog e rejeita escrita na origem durante a janela, incluindo applyOps transacionais. Commit transacional no intervalo é rejeitado conservadoramente. Ausência de permissão, perda da janela do oplog ou qualquer divergência impede publicar um backup completo. Com TTL ativo expirando documentos pode ser necessário outra estratégia de backup na infraestrutura; nunca ignorar a guarda para obter sucesso.

## Capturar

Executar na raiz do repositório, com ambiente operacional configurado pelo mecanismo seguro da infraestrutura:

```powershell
mongodump --version
mongorestore --version
npm.cmd run backup:db --prefix ecommerce -- --output "C:\FetechBackups" --tools-dir "C:\MongoDBTools\bin"
```

`--tools-dir` é opcional quando ambas as ferramentas estão no PATH. O diretório de binários informado deve ser confiável. Sem tools, a operação termina com erro claro antes de acessar o banco ou criar a saída. O caminho é exemplo; o script não baixa nem instala nada.

Cada execução cria pasta exclusiva `database-data-UUID`, sem sobrescrever a anterior. Enquanto captura, existe `database.archive.gz.partial`. Somente após sucesso da ferramenta, verificação de consistência e checksum, são publicados:

| Arquivo | Função |
| --- | --- |
| `database.archive.gz` | Archive BSON comprimido oficial; contém todos os dados sensíveis da aplicação |
| `backup-manifest.json` | Versão 1, database, horário UTC, versões tools, tamanho, duração, contagens e hashes técnicos |
| `backup-manifest.sha256` | SHA-256 dos bytes do manifesto |

O manifesto registra hash SHA-256 do archive, hashes de dados BSON canônicos por collection, contagens, quantidade/hash de índices com todas as opções e hash de opções das collections. A ordem dos campos de índices compostos é preservada. Tipos BSON numéricos são preservados na leitura do hash; strings com zeros iniciais não são convertidas. Não registra documentos, PII, e-mails, senhas, JWT, URI ou secrets. Hashes não substituem proteção de acesso: o archive contém PII, hashes de senha e outros dados restritos. A soma de verificação detecta corrupção, não autentica a origem contra um invasor que possa reescrever archive, manifesto e sidecar.

Não copiar pastas incompletas como backups recuperáveis. Interrupção/falha pode deixar evidências parciais; não há publicação válida sem todos os arquivos e hashes correspondentes. `SIGINT`/`SIGTERM` cancela o child e retorna erro. Um encerramento forçado do processo/SO pode deixar o arquivo temporário de conexão: inspecionar e remover com procedimento operacional seguro.

## Restaurar em database nova

Definir os caminhos reais da captura e um nome novo exclusivo. O ambiente de conexão deve apontar para o cluster isolado de recuperação; não usar o cluster comercial para drills rotineiros.

```powershell
npm.cmd run restore:db --prefix ecommerce -- --backup "C:\FetechBackups\PASTA_DA_CAPTURA" --target-db fetech_restore_drill_20261008 --confirm-target fetech_restore_drill_20261008 --tools-dir "C:\MongoDBTools\bin"
npm.cmd run verify:backup --prefix ecommerce -- --backup "C:\FetechBackups\PASTA_DA_CAPTURA" --target-db fetech_restore_drill_20261008 --confirm-target fetech_restore_drill_20261008
```

O destino deve seguir `fetech_restore_*`, ser diferente da origem e da database configurada em `DB_URI`, não conter `prod`, `commercial` ou `live` e ter confirmação exata. São recusados `admin`, `local`, `config`, `test`, caracteres de shell e nomes de caminhos. Qualquer collection existente, mesmo vazia, bloqueia restore. Não há `--drop`, `--replace`, overwrite ou rollback automático. As guardas independem de `NODE_ENV`.

Antes de qualquer conexão/escrita, restore exige manifesto válido/suportado e checksums do manifesto e archive. Usa nomes de arquivo fixos; metadata não escolhe caminhos. Arquivos vazios, links simbólicos e manifesto incompleto são rejeitados. A collection `fetech_restore_guard` reserva atomicamente o destino contra outra execução destes scripts; não é lock contra clientes externos. Manter o destino sem escritores externos durante toda a operação.

Após importar, compara todas as collections, dados BSON canônicos, contagens, índices/opções e relações críticas com o manifesto. O marcador é removido somente após verificação bem-sucedida; falha deixa destino parcial para inspeção, sem deletar database. Uma tentativa posterior deve usar outro destino novo. `verify:backup` é somente leitura e não necessita Database Tools.

Verificações abrangem centavos, snapshot de entrega, Stock, pedidos/usuários, reservas/movimentos, claims COMPLETED, PAID/paidAt, arquivamento, tokenVersion e hashes de senha por preservação de conteúdo. Anomalias históricas da origem são contadas sem PII e devem permanecer iguais: backup não corrige órfãos ou históricos inválidos. `RESTORE_VERIFIED` significa equivalência da captura, não certificação de todos os dados comerciais. Collections/views fora do formato suportado são recusadas, sem omissão silenciosa.

## Drill e promoção comercial

```powershell
node --test ecommerce/tests/backupRestore.test.js
node --test ecommerce/tests/backupArtifactSafety.test.js
```

O primeiro teste detecta tools no PATH, em `.local/mongodb-tools/bin` ou no diretório indicado por `FETECH_TEST_MONGO_TOOLS`. Quando disponíveis, inicia replica set temporário se necessário, cria fixtures sintéticas `example.test`, captura uma database e restaura em outra, compara dados/índices/relações e realiza leitura funcional com models sem criar índices. Somente essas bases temporárias são removidas no teardown. Sem tools os 15 casos de integração são explicitamente skipped; isso **não é aprovação do drill**. O segundo arquivo valida contratos de integridade com bytes sintéticos; não cria um backup BSON nem comprova recuperação.

Antes de migração comercial: obter captura recente consistente da própria origem, comprovar restore em ambiente isolado com ferramentas compatíveis, revisar equivalência e documentar operador, tamanho/durações/resultados. Drills sintéticos aprovados não substituem prova sobre a captura comercial. Não executar `migrate:money --apply` enquanto essa evidência não existir.

Para desastre real: abrir change procedure, preservar origem/evidências, escolher captura íntegra e destino novo autorizado, executar restore/verificação, validar leitura funcional e integrações sem efetuar cobranças/expedições, revisar estado comercial e segurança. Restore pode recuperar tokenVersion anterior: avaliar revogação de sessões/rotação de secrets antes da promoção. Revalidar claims/ledger para evitar replay; não apagar claims para destravar pedidos. Promover a database mediante mudança de conexão e controles da infraestrutura, com rollback documentado. Os scripts não promovem conexão, reiniciam serviços ou restauram automaticamente a produção.

## Política operacional proposta

- Meta RPO: até 24 h, condicionada a agendamento e janela consistente efetivamente operacionais; atualmente não garantida.
- RTO: **não medido**. Medir tempo desde início da recuperação até serviço comercial utilizável, incluindo verificação, índices e promoção. Duração do import isolado não é RTO produtivo.
- Retenção sugerida: 7 diárias, 4 semanais, 6 mensais, sujeita a política de privacidade/retenção. Não há scheduler nem expurgo implementado.
- Manter cópia off-site criptografada, ACL restrita, gestão de chaves e credenciais e cópia protegida dos checksums. Nada disso foi provisionado nesta tarefa.
- Monitorar ausência de backup recente, falha, espaço e drill periódico; registrar apenas dados técnicos. Repetir drill após mudança de tools, MongoDB ou schema.

Logs próprios contêm apenas operação, database/host sem credenciais, caminho de saída, contagens, tamanho e duração. Saída bruta das tools é suprimida para evitar vazamento. A conexão é passada por arquivo YAML temporário fora do bundle, removido em `finally`; credenciais não entram nos argumentos do processo. Garantir proteção do diretório temporário e armazenamento fora do alcance de outros usuários.

Artefatos não são versionados: `.local/`, `backups/`, `*.archive.gz`, manifesto e sidecar estão no `.gitignore`. Isso não impede anexação manual a serviços externos: tratar todo bundle como dado comercial sensível.

## CI F039

F024 continua **PARCIAL**. O CI instala somente MongoDB Server, sem Database
Tools, e admite exclusivamente os quinze bloqueios atuais com arquivo/nome/
motivo exatos. Nao executa drill comercial, backup real ou migration de indice
no fetech. Gate verde com essa excecao nao comprova restore.
[Politica](CI_E_GATES_COMERCIAIS.md).
