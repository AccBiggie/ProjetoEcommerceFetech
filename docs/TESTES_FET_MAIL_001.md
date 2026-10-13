# Testes FET-MAIL-001 / F040

## emailOutbox.test.js (26)

1. `MAIL pre-fix: persisted Order must have one durable ORDER_CREATED event`
2. `MAIL schema rejects forbidden textual field to`
3. `MAIL schema rejects forbidden textual field recipientEmail`
4. `MAIL schema rejects forbidden textual field name`
5. `MAIL schema rejects forbidden textual field subject`
6. `MAIL schema rejects forbidden textual field text`
7. `MAIL schema rejects forbidden textual field html`
8. `MAIL schema rejects forbidden textual field payload`
9. `MAIL schema rejects forbidden textual field password`
10. `MAIL schema rejects forbidden textual field resetToken`
11. `MAIL schema rejects forbidden textual field resetUrl`
12. `MAIL schema rejects forbidden textual field secret`
13. `MAIL schema rejects forbidden textual field stack`
14. `MAIL schema indexes unique dedupe, due ordering and lease; no TTL`
15. `MAIL unique dedupe forbids duplicate durable event`
16. `MAIL enqueue rejects absent session and unknown event`
17. `MAIL two connections concurrent transactional enqueue share unique event`
18. `MAIL Order event has request correlation and no direct PII`
19. `MAIL F005 replay and concurrent intent create one Order and one event`
20. `MAIL enqueue failure rolls back Order, Stock, ledger and completion`
21. `MAIL real registration commits User and one account event without provider`
22. `MAIL registration failure rolls back User`
23. `MAIL deactivate/reactivate real changes unique by lifecycle version, repeated change no duplicate`
24. `MAIL privacy duplicate request has one event and no privacy completed mail`
25. `MAIL F009 reset succeeds directly and never persists secret in outbox`
26. `MAIL F009 provider failure remains uniform and clears reset; nonexistent no provider`

## emailWorker.test.js (36)

1. `MAIL worker claims PENDING and valid lease cannot be stolen`
2. `MAIL expired lease is recovered with a new owner and old owner cannot send`
3. `MAIL independent Mongo connections have only one concurrent claim`
4. `MAIL two worker processes normally send once`
5. `MAIL normal send produces SENT, one attempt, sanitized message ID and technical header`
6. `MAIL SENT cannot be reclaimed or counted as another attempt`
7. `MAIL transient failure persists RETRY, backoff, preserves domain User`
8. `MAIL RETRY before due cannot be claimed, at due can be claimed`
9. `MAIL full retry schedule ends at DEAD and never retries automatically`
10. `MAIL permanent SMTP rejection becomes DEAD immediately`
11. `MAIL missing provider config attempts no transport/network and RETRY`
12. `MAIL template failure is DEAD without provider`
13. `MAIL missing recipient is SUPPRESSED without provider`
14. `MAIL invalid legacy email suppressed without value in event: "invalid"`
15. `MAIL invalid legacy email suppressed without value in event: ["PERSON_EMAIL_SENTINEL@example.test"]`
16. `MAIL invalid legacy email suppressed without value in event: "anon-123@privacy.invalid"`
17. `MAIL deactivated recipient remains eligible for domain notification`
18. `MAIL anonymized recipient suppressed without recovering email from historical Order`
19. `MAIL changed email before send is resolved from current User, never persisted`
20. `MAIL missing Order is SUPPRESSED, no endless retry`
21. `MAIL crash before provider recovers after lease`
22. `MAIL success then Mongo failure leaves ambiguous PROCESSING; recovery can duplicate`
23. `MAIL provider accepted then timeout is ambiguous and retryable`
24. `MAIL crashes exhaust attempts and final expired lease becomes DEAD`
25. `MAIL logs correlate origin, exclude email/body/password/raw response and do not create admin audits`
26. `MAIL long/PII provider message ID cannot leak into outbox`
27. `MAIL provider call never executes within domain transaction`
28. `MAIL batch is bounded and sequential with no unlimited fan-out`
29. `MAIL worker shutdown stops further claims and releases timers after current send`
30. `MAIL startup does not poll/network for test/server/true`
31. `MAIL startup does not poll/network for development/server/false`
32. `MAIL startup does not poll/network for production/email-outbox/true`
33. `MAIL classifier sanitized EMAIL_PROVIDER_UNAVAILABLE/{"responseCode":450}`
34. `MAIL classifier sanitized EMAIL_PROVIDER_REJECTED/{"responseCode":550}`
35. `MAIL classifier sanitized EMAIL_PROVIDER_UNAVAILABLE/{"code":"ECONNECTION"}`
36. `MAIL classifier sanitized EMAIL_PROVIDER_ERROR/{"message":"PRIVATE_SMTP_SENTINEL"}`

## emailTemplates.test.js (25)

1. `MAIL template ACCOUNT_REGISTERED pt-BR text/html only server links without PII/tracking`
2. `MAIL template ORDER_CREATED pt-BR text/html only server links without PII/tracking`
3. `MAIL template ACCOUNT_DEACTIVATED pt-BR text/html only server links without PII/tracking`
4. `MAIL template ACCOUNT_REACTIVATED pt-BR text/html only server links without PII/tracking`
5. `MAIL template PRIVACY_REQUEST_CREATED pt-BR text/html only server links without PII/tracking`
6. `MAIL Order text states receipt without claiming payment or shipping`
7. `MAIL money uses historical integer cents over legacy/current price`
8. `MAIL money handles 50 cents exactly`
9. `MAIL HTML escapes domain value "<script>alert(1)</script>"`
10. `MAIL HTML escapes domain value "<img onerror=\"alert(1)\">"`
11. `MAIL HTML escapes domain value "&"`
12. `MAIL HTML escapes domain value "\""`
13. `MAIL HTML escapes domain value "'"`
14. `MAIL unavailable or client-controlled event is rejected PAYMENT_CONFIRMED`
15. `MAIL unavailable or client-controlled event is rejected ORDER_SHIPPED`
16. `MAIL unavailable or client-controlled event is rejected TRACKING_AVAILABLE`
17. `MAIL unavailable or client-controlled event is rejected ORDER_REFUNDED`
18. `MAIL unavailable or client-controlled event is rejected ../template`
19. `MAIL unsafe frontend URL rejected https://user:password@example.test`
20. `MAIL unsafe frontend URL rejected javascript:alert(1)`
21. `MAIL unsafe frontend URL rejected //evil.test`
22. `MAIL unsafe frontend URL rejected https://shop.example.test/path`
23. `MAIL request Host/Origin cannot change fixed template URL`
24. `MAIL wrong owner/order and invalid money fail template`
25. `MAIL nodemailer/sendMail restricted to adapter; runtime never imports fake`

## emailOutboxAudit.test.js (20)

1. `MAIL audit detects stale processing`
2. `MAIL audit detects overdue retry`
3. `MAIL audit detects dead letter`
4. `MAIL audit detects unknown state`
5. `MAIL audit detects missing sentAt`
6. `MAIL audit detects missing User`
7. `MAIL audit detects PII fields`
8. `MAIL audit pending anonymized recipient is operational finding`
9. `MAIL audit valid SENT and pending rows have no integrity findings`
10. `MAIL audit rejects malformed nextAttemptAt`
11. `MAIL audit rejects malformed leaseToken`
12. `MAIL audit rejects malformed suppressedAt`
13. `MAIL audit rejects malformed query operator reference`
14. `MAIL audit preserves documents/indexes and makes zero provider calls`
15. `MAIL audit CLI is readonly in temporary database`
16. `MAIL audit CLI rejects apply`
17. `MAIL worker CLI defaults to dry-run without SMTP or writes`
18. `MAIL CLI refuses incomplete/wrong confirmation 1`
19. `MAIL CLI refuses incomplete/wrong confirmation 3`
20. `MAIL CLI applies only in fixture using injected fake provider`

## E2E adicionado

1. Cadastro pelo browser gera ACCOUNT_REGISTERED; checkout gera ORDER_CREATED; replay retorna mesmo Order/evento; provider fake envia uma mensagem por evento normal, sem reenvio de SENT; privacy request e lifecycle geram eventos e revogam acesso corretamente. A cota compartilhada de registro da base temporaria e restaurada; o worker drena batches limitados.

## Cobertura de aceite

Casos 01-68: outbox/worker/templates acima, incluindo concorrencia, rollback, F009, privacy e janelas de crash. Casos 69-81: audit e CLI acima; cases 82-88: falta de provider, profiles/startup/shutdown, batch e sequenciamento. Casos 89-109: suites permanentes completas do commercial gate (F002..F039) sem skip fora dos 15 conhecidos F024. Nenhuma alteracao de testes para aceitar regressao ou expected failure.
