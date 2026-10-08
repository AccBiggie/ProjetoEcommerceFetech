# Migração monetária para centavos

Script: ecommerce/backend/scripts/migrateMoneyToCents.js. Usa loadEnvironment/loadConfig com perfil migration de F036 (NODE_ENV e DB_URI, sem exigir HTTP/SMTP/Cloudinary). Sem migração automática no servidor.

## Comandos e proteção

```powershell
# Padrão somente leitura, não altera Product/Order.
npm.cmd run migrate:money --prefix ecommerce

# Exemplo SOMENTE para banco temporário previamente escolhido no ambiente.
npm.cmd run migrate:money --prefix ecommerce -- --apply --confirm-db fetech_money_EXEMPLO
```

Apply exige flag e confirmação exata do database, verificada antes de conectar e novamente na ferramenta. Production exige também --allow-production e autorização operacional com backup/restore validado. Esse parâmetro não demonstra existência de backup. **Não recomendamos apply em produção comercial enquanto F024 estiver aberto.**

A tarefa executou dry-run/apply somente em databases temporários. **MIGRAÇÃO REAL NÃO EXECUTADA. BANCO REAL NÃO ALTERADO.** O config.env real não foi sobrescrito.

## Scan e aplicação

Scan lê coleções raw products/orders para não esconder dados inválidos por cast do schema. Classifica migrável, já migrado ou bloqueado. Motivos incluem missing, invalid, precision, overflow e inconsistent. Relatório mostra somente database, host sem credenciais, contagens, ObjectId, grupo de campos e motivo; não imprime documentos, endereço, telefone, e-mail, pagamento ou JWT.

O scan completo e as contagens precedem a primeira escrita. Apply converte documentos exatos elegíveis e mantém bloqueados intactos. Campos Cents existentes válidos vencem o legado; nunca são multiplicados novamente por 100. Novos campos são gravados e os antigos removidos com update atômico por documento. Não há transação global.

Cada update compara o snapshot dos campos financeiros e dos itens do pedido. Mudança concorrente é reportada e não sobrescrita; campos não financeiros do documento não são substituídos. Escritas comerciais devem ficar em manutenção no cutover operacional, pois CAS por documento não substitui uma janela controlada.

0.105 não vira 10 nem 11. Pedido com soma de linhas diferente de subtotal, ou subtotal+tax+frete diferente de total, fica bloqueado. Nenhuma intenção comercial é adivinhada.

Segunda aplicação em documentos válidos migrados produz zero alterações. Repita dry-run ao final para validar já migrados, bloqueados e mudanças concorrentes.

## Sequência futura segura

1. Validar backup **e restore**, resolvendo F024.
2. Definir plano de deploy/cutover e manutenção de escrita.
3. Executar dry-run no alvo autorizado.
4. Revisar documentos bloqueados com o responsável pelos dados.
5. Repetir dry-run e confirmar zero ambiguidades.
6. Autorizar apply com confirmação explícita do database.
7. Executar novo dry-run e conferir invariantes/contagens.
8. Validar aplicação/consumidores e liberar escrita.

Essa sequência não foi executada no banco real nesta tarefa. Validação da sintaxe de DB_URI não comprova conectividade ou backup.

## Testes

```powershell
node --test ecommerce/tests/money.test.js
node --test ecommerce/tests/moneyApi.test.js
node --test ecommerce/tests/moneyMigration.test.js
```

MoneyMigration usa apenas fetech_money_PID_TIMESTAMP, com teardown, e testa dry-run sem escrita, apply, precisão/inconsistência bloqueadas, idempotência, confirmação, sanitização e mudanças concorrentes.
