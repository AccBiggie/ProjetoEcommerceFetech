# Testes FET-DATA-004

## Concurrency (72)

1. REV criação responde com snapshot consistente e ID BSON
2. REV body ausente ou array retorna 400 sem erro interno
3. REV rejeita rating "5"
4. REV rejeita rating true
5. REV rejeita rating null
6. REV rejeita rating 4.5
7. REV rejeita rating 0
8. REV rejeita rating 6
9. REV rejeita rating -1
10. REV rejeita rating {}
11. REV rejeita rating []
12. REV serviço rejeita rating NaN
13. REV serviço rejeita rating Infinity
14. REV serviço rejeita rating -Infinity
15. REV serviço rejeita rating undefined
16. REV rejeita comentário object/tipo
17. REV rejeita comentário boolean/tipo
18. REV rejeita comentário number/tipo
19. REV rejeita comentário object/tipo
20. REV rejeita comentário object/tipo
21. REV rejeita comentário string/0
22. REV rejeita comentário string/4
23. REV rejeita comentário string/2001
24. REV trim e expressão Mongo permanecem texto literal
25. REV aceita comentário no limite de 2000
26. REV rejeita productId "invalid"
27. REV rejeita productId ""
28. REV rejeita productId "aaaaaaaaaaaaaaaaaaaaaaa"
29. REV rejeita productId {"$ne":null}
30. REV rejeita productId []
31. REV produto inexistente retorna 404
32. REV consulta pública valida ID e preserva alias
33. REV ignora autoria, identidade e agregados do cliente
34. REV atualização preserva identidade, posição, count e demais campos
35. REV 2 usuários concorrentes preservam todas as avaliações
36. REV 5 usuários concorrentes preservam todas as avaliações
37. REV 20 usuários concorrentes preservam todas as avaliações
38. REV mesmo usuário concorrente cria uma única avaliação
39. REV mesmo usuário concorrente atualiza uma única avaliação
40. REV concorrência mista de create e update preserva A B C
41. REV carga de 100 operações mantém unicidade e todos os snapshots
42. REV duas conexões independentes compartilham garantia atômica
43. REV duas APIs em processos distintos preservam avaliações e não duplicam usuário
44. REV remoção de última avaliação retorna agregado vazio
45. REV remoção preserva ownership e 404 inexistente
46. REV create concorrente com delete mantém agregado final
47. REV deleções concorrentes de usuários diferentes esvaziam agregado
48. REV remoção parcial recalcula a média dos sobreviventes
49. REV HTTP aceita nota limite 1
50. REV HTTP aceita nota limite 5
51. REV create genérico admin ignora avaliações e agregados
52. REV update concorrente com delete da mesma avaliação mantém consistência
53. REV admin remove avaliação e cria audit sem comentário
54. REV falha no audit administrativo reverte remoção e agregado
55. REV cliente não produz auditoria administrativa
56. REV logs, correlação e no-store preservam privacidade
57. REV auth e CSRF continuam obrigatórios
58. REV usuário desativado mantém histórico, perde acesso e reativação preserva ID
59. REV endpoint genérico admin ignora reviews e agregados
60. REV histórico count é bloqueado sem reparo
61. REV histórico average é bloqueado sem reparo
62. REV histórico nanAverage é bloqueado sem reparo
63. REV histórico infiniteAverage é bloqueado sem reparo
64. REV histórico duplicate é bloqueado sem reparo
65. REV histórico invalidRating é bloqueado sem reparo
66. REV histórico invalidUser é bloqueado sem reparo
67. REV histórico nullArray é bloqueado sem reparo
68. REV histórico badRow é bloqueado sem reparo
69. REV deleção também bloqueia agregados históricos incorretos
70. REV campos históricos ausentes equivalem a agregado vazio
71. REV média não recebe arredondamento
72. REV filtro de rating consulta agregado atualizado

## Audit (29)

1. REVAUD produto consistente não gera finding
2. REVAUD detecta count mismatch
3. REVAUD detecta rating mismatch
4. REVAUD detecta usuário duplicado
5. REVAUD rating inválido 5
6. REVAUD rating inválido true
7. REVAUD rating inválido null
8. REVAUD rating inválido 4.5
9. REVAUD rating inválido 0
10. REVAUD rating inválido 6
11. REVAUD rating inválido NaN
12. REVAUD rating inválido Infinity
13. REVAUD detecta referência órfã com IDs seguros
14. REVAUD referência malformada não imprime valor
15. REVAUD usuário desativado não é órfão
16. REVAUD média aplica tolerância de 1e-12
17. REVAUD array vazio exige média e contagem zero
18. REVAUD legado sem campos é vazio válido
19. REVAUD estrutura inválida object
20. REVAUD estrutura inválida object
21. REVAUD estrutura inválida string
22. REVAUD estrutura inválida linha
23. REVAUD ID de avaliação duplicado é sinalizado
24. REVAUD não imprime comentário nome email ou descrição
25. REVAUD somente leitura preserva documentos e indexes byte a byte
26. REVAUD perfil central não exige secrets de servidor
27. REVAUD CLI executa somente no banco temporário sem mutações
28. REVAUD CLI rejeita apply e argumentos sem conectar ou reparar
29. REVAUD histórico duplicado permanece intacto após análise

## E2E adicionado

1. reviews: cria review, atualiza preservando ID/count; segundo usuário mostra
   count/média autoritativos e ambos os comentários do backend.

## Mapeamento do aceite

Casos 01-28 e 30-54 do anexo: testes focados acima; caso 29: deletes simultâneos
de usuários diferentes. Casos 31/32: invariantes em cada snapshot e estado final.
Casos 33-35: 100 writes, duas conexões e duas APIs/processos reais. Casos 36-46:
mass assignment, lifecycle, CSRF, request ID, logs, no-store e audit administrativo.
Casos 47-54: fixtures e CLI readonly. Casos 55-70: suítes permanentes de
orderStateMachine, inventoryTransaction, orderIdempotency, auth,
adminSafety, rateLimit, passwordRecoverySecurity, authCookieSecurity,
privateResponseSecurity, httpSecurity, configSecurity, userLifecycle, dinheiro,
checkout e E2E completos, sem skips fora de F024.
