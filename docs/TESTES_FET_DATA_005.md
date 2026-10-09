# Testes FET-DATA-005

61 casos focados aprovados: 37 hierarchy, 14 concurrency, 10 audit.
Os três probes pré-fix estão em categoryHierarchyLegacyProbe.test.js.
O E2E existente de categorias foi ampliado para descendants, API cycle 409 e reparent.

1. HIER root, child, reparent, root->child e child->root
2. HIER parent bruto inválido: "invalid"
3. HIER parent bruto inválido: ""
4. HIER parent bruto inválido: []
5. HIER parent bruto inválido: {}
6. HIER parent bruto inválido: true
7. HIER parent bruto inválido: 12
8. HIER parent inexistente retorna 409 e aborta revision/audit
9. HIER self/direct/indirect/deep cycle: depth 1
10. HIER self/direct/indirect/deep cycle: depth 2
11. HIER self/direct/indirect/deep cycle: depth 3
12. HIER self/direct/indirect/deep cycle: depth 12
13. HIER self-parent de create é rejeitado pelo helper e ID cliente é ignorado
14. HIER delete leaf audita ObjectId permanente e requestId
15. HIER delete parent não cascadeia nem reparenta
16. HIER delete Category usada por Product é bloqueado
17. HIER referência legada Product.category também bloqueia delete
18. HIER Product category_id inválido: "invalid"
19. HIER Product category_id inválido: []
20. HIER Product category_id inválido: {}
21. HIER Product category_id inválido: true
22. HIER Product category_id inválido: 12
23. HIER Product category_id inválido: null
24. HIER Product create sem Category e ID inexistente não persistem
25. HIER Product create/update por ID e nome coordena, update sem categoria não incrementa
26. HIER F025 create/update metadata segura, allowlist e rename sincronizado
27. HIER audit insert failure aborta create
28. HIER audit insert failure aborta update
29. HIER audit insert failure aborta delete
30. HIER audit insert failure aborta product
31. HIER legacy self falha fechado sem repair e permanece legível
32. HIER legacy cycle falha fechado sem repair e permanece legível
33. HIER legacy missing falha fechado sem repair e permanece legível
34. HIER state é interno, permanente, revision sem controle cliente
35. HIER helper exige transação
36. HIER BSON parent malformado não desaparece no casting Mongoose
37. HIER bodies ausentes/arrays retornam 400
38. HIER-AUD roots null/ausente e árvore válida não geram falsos positivos
39. HIER-AUD missing parent e parent malformado são detectados sem texto arbitrário
40. HIER-AUD self-parent reporta self e componente cíclico uma vez
41. HIER-AUD múltiplos ciclos e nodes que entram no ciclo são canonicalizados
42. HIER-AUD Product ref órfã/obrigatória ausente, ID malformado e legado opcional
43. HIER-AUD read-only: snapshot completo permanece idêntico e output só IDs/códigos
44. HIER-AUD User desativado não interfere
45. HIER-AUD cadeia longa e ciclos não entram em loop
46. HIER-AUD config mínima não exige SMTP, Cloudinary ou servidor
47. HIER-AUD CLI em DB temporária é read-only e rejeita --apply
48. HIER concurrent first upserts criam apenas um state e completam mutations independentes
49. HIER A->B/B->A repetido 40 vezes nunca produz ciclo
50. HIER concurrent three-node cycle rejeita terceiro commit
51. HIER concurrent 1 child create/delete não cria órfão
52. HIER concurrent 20 child create/delete não cria órfão
53. HIER Product createId/Category delete nunca cria órfão
54. HIER Product createName/Category delete nunca cria órfão
55. HIER Product updateId/Category delete nunca cria órfão
56. HIER Product updateName/Category delete nunca cria órfão
57. HIER reparent/delete new parent mantém floresta
58. HIER reparent/delete old parent mantém floresta
59. HIER write conflict real força retry e audit persiste uma única vez
60. HIER duas conexões Mongo independentes coordenam o mesmo singleton
61. HIER dois processos API independentes impedem ciclo concorrente

62. PRE_FIX_WRITE_SKEW: snapshots independentes produzem A→B→A.
63. PRE_FIX_CHILD_DELETE: child/create e delete sem coordenação produzem órfão.
64. PRE_FIX_PRODUCT_DELETE: Product/create e delete sem coordenação produzem órfão.

CFG-42 foi atualizado para incluir o entrypoint auditCategories na mesma allowlist F036 das outras auditorias; 46/46 config tests passam.
