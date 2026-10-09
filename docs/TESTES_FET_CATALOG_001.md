# Testes individuais — FET-CATALOG-001

98 casos de catálogo aprovados, além das regressões existentes e de um novo E2E.
Nomes obtidos da execução real do runner; não representam 98 mocks de implementação.
Os testes HTTP/concorrência/audit usam Mongo temporário em replica set.

1. CAT audit sees all incoherent historical states without writing or leaking PII
2. CAT legacy ledger without complete baseline is reported as legacy, not a false mismatch
3. CAT raw legacy decimals remain readable without a read-side write
4. CAT malformed and orphan movements detected using raw data
5. CAT audit CLI uses minimum config, no provider/server/SMTP, no writes
6. CAT audit rejects every repair/apply argument without writes
7. CAT audit snapshot is coherent when adjustment commits between collection reads
8. CAT existing inventory/order/backup verification accepts administrative ledger
9. CAT stock index upgrade preserves reserves and permits multiple admin adjustments
10. CAT money rejects precision without partial commit
11. CAT money rejects negative without partial commit
12. CAT money rejects NaN without partial commit
13. CAT money rejects Infinity without partial commit
14. CAT money rejects boolean without partial commit
15. CAT money rejects array without partial commit
16. CAT money rejects object without partial commit
17. CAT money rejects overflow without partial commit
18. CAT money rejects whitespace without partial commit
19. CAT money rejects scientific without partial commit
20. CAT zero commercial price and safe integer limit remain supported
21. CAT old price, rounding, equal price, removing reference and updates
22. CAT exact BigInt percentage matches half-up policy at boundaries
23. CAT immutable field _id rejects create/update
24. CAT immutable field __v rejects create/update
25. CAT immutable field createdAt rejects create/update
26. CAT immutable field updatedAt rejects create/update
27. CAT immutable field user rejects create/update
28. CAT immutable field priceCents rejects create/update
29. CAT immutable field oldPriceCents rejects create/update
30. CAT immutable field installmmentPrice rejects create/update
31. CAT immutable field installmmentPriceCents rejects create/update
32. CAT immutable field off rejects create/update
33. CAT immutable field reviews rejects create/update
34. CAT immutable field ratings rejects create/update
35. CAT immutable field numOfReviews rejects create/update
36. CAT immutable field stockLedgerVersion rejects create/update
37. CAT immutable field requestId rejects create/update
38. CAT immutable field parent_id rejects create/update
39. CAT immutable field $set rejects create/update
40. CAT immutable field unknown rejects create/update
41. CAT invalid stock -1 is rejected
42. CAT invalid stock 1.5 is rejected
43. CAT invalid stock "5" is rejected
44. CAT invalid stock true is rejected
45. CAT invalid stock null is rejected
46. CAT invalid stock 9007199254740992 is rejected
47. CAT stock initial, zero, adjustments, unchanged stock and technical actor
48. CAT rollback on movement-create
49. CAT rollback on movement-update
50. CAT rollback on audit-create
51. CAT rollback on audit-update
52. CAT transaction retry rolls back first attempt, one movement and audit survive
53. CAT category name/ID coherent, mismatch and missing category rejected
54. CAT invalid text name ""
55. CAT invalid text name "   "
56. CAT invalid text name []
57. CAT invalid text name {}
58. CAT invalid text name true
59. CAT invalid text name 123
60. CAT invalid text description ""
61. CAT invalid text description "   "
62. CAT invalid text description []
63. CAT invalid text description {}
64. CAT invalid text description true
65. CAT invalid text description 123
66. CAT invalid text countDown ""
67. CAT invalid text countDown "   "
68. CAT invalid text countDown []
69. CAT invalid text countDown {}
70. CAT invalid text countDown true
71. CAT invalid text countDown 123
72. CAT Unicode trimmed; duplicate names and no images remain supported
73. CAT invalid image metadata null
74. CAT invalid image metadata {}
75. CAT invalid image metadata ["bad"]
76. CAT invalid image metadata [{"public_id":"","url":"https://example.com/a","banner":"https://example.com/a"}]
77. CAT invalid image metadata [{"public_id":"id","url":"http://example.com/a","banner":"https://example.com/a"}]
78. CAT invalid image metadata [{"public_id":"id","url":"data:image/png;base64,a","banner":"/Profile.png"}]
79. CAT invalid image metadata [{"public_id":"id","url":"javascript:alert(1)","banner":"/Profile.png"}]
80. CAT invalid image metadata [{"public_id":"id","url":"//evil.example/a","banner":"/Profile.png"}]
81. CAT invalid image metadata [{"public_id":"id","url":"https://<credenciais>@example.com/a","banner":"/Profile.png"}]
82. CAT invalid image metadata [{"public_id":"id","url":"/demo-products/../x.png","banner":"/Profile.png"}]
83. CAT invalid image metadata [{"public_id":"id","url":"/Profile.png","banner":"/Profile.png","private":"sentinel"}]
84. CAT duplicate image IDs rejected; HTTPS metadata accepted without provider
85. CAT delete preserves stock ledger and order history; unreferenced zero stock may be deleted
86. CAT routes preserve CSRF, authentication and authorization
87. CAT old ledger index fails closed without changing product/movement/audit
88. CAT admin absolute stock target vs reserve, repeated real transactions
89. CAT ten simultaneous reserves/adjustments never lose committed deltas
90. CAT price update vs reserve preserves both and a valid historical price
91. CAT price/name update vs twenty reviews preserves all reviews and aggregates
92. CAT category rename races create without denormalization mismatch
93. CAT category rename races category-update without denormalization mismatch
94. CAT category rename races name-update without denormalization mismatch
95. CAT failing category denormalization aborts category, revision and audit
96. CAT product delete vs reserve has no orphan
97. CAT combined mutation vs category delete obeys hierarchy revision
98. CAT two independent API processes serialize targets and reservations

99. E2E catálogo: criação, reload, edição de preço/Stock/categoria, reviews preservadas, relação inválida recusada e exclusão protegida.

## Cobertura dos 116 cenários da task

| Cenários | Evidência |
| --- | --- |
| 01–06 | Validação HTTP F014: precisão, negativos, NaN/Infinity/tipos, whitespace/scientific e overflow; regressões money |
| 07–10 | Relação oldPrice, igualdade off=0, null e rejeições sem persistência |
| 11–15 | Derivação de off, bloqueio de spoof, alterações de ambos os preços e remoção da referência |
| 16–20 | splitInstallments existente em 12 partes, cents exatos, soma/remainder e serializer histórico |
| 21–27 | Stock zero/positivo, negativas, frações, string, boolean/null e unsafe integer |
| 28–34 | INITIAL_STOCK, deltas +5/-9, no-op, commit conjunto e falhas de Movement/Audit |
| 35–39 | Reserve/admin repetidos, dez operações concorrentes, dois processos, write conflicts e retry sem duplicação |
| 40–46 | Resolução por ID/nome, inexistência, mismatch e alteração coerente |
| 47–50 | Rename vs create/category/name; falha de sync reverte Category/Product/state/audit |
| 51–52 | Suíte F017, corrida legítima de ID corrigida no fixture, revisão e ausência de órfãos |
| 53–58 | Campos de reviews bloqueados; preço vs 20 reviews; pipeline/agregados F015 e regressões existentes |
| 59–63 | _id/__v/timestamps/user/cents/internos/operator/unknown rejeitados em create/update |
| 64–70 | Metadata HTTPS/local, arrays/estruturas/tipos/duplicatas inválidos, sem provider; fallback vazio preservado |
| 71–76 | Nome/descrição string/trim/Unicode; sem limite novo ou unicidade inventada |
| 77–80 | Order snapshot intacto após preço/nome; DTO/cart F014/F031 e E2E money/storage |
| 81–94 | Todas as categorias mínimas do audit, raw fixtures, snapshot entre coleções, perfil mínimo, zero writes/PII/provider |
| 95–96 | DELETE com ledger/Order, zero sem referência, race delete/reserve, proteção de índices de reserva |
| 97–116 | Suíte completa 1.320 pass + 15 skips F024: state machine, estoque, idempotência, auth/cookie/limiter/forgot/admin/history/checkout/money/reviews/lifecycle/hierarquia/avatar/CSRF/JWT/audit/storage/config |

Testes de backup/restore com ferramentas reais permanecem exclusivamente skipped por mongodump/mongorestore ausentes; os testes sintéticos de verificação compatível com o ledger administrativo foram executados.
