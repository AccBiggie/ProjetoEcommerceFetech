# Testes individuais — FET-PERF-001

164 casos novos de API/unit/integration e seis E2E novos. Fixtures isoladas; nenhum banco comercial. Arquivos: apiPagination (21), querySafety (110), queryPerformanceIndexes (15), indexMigration (16), frontendPaginationStale (2).

1. /products: default e metadados
2. /products: páginas estáveis, limite, vazio e última página
3. /products: número de consultas constante entre 5 e 50
4. /admin/products: default e metadados
5. /admin/products: páginas estáveis, limite, vazio e última página
6. /admin/products: número de consultas constante entre 5 e 50
7. /admin/users: default e metadados
8. /admin/users: páginas estáveis, limite, vazio e última página
9. /admin/users: número de consultas constante entre 5 e 50
10. /admin/orders: default e metadados
11. /admin/orders: páginas estáveis, limite, vazio e última página
12. /admin/orders: número de consultas constante entre 5 e 50
13. /orders/me: default e metadados
14. /orders/me: páginas estáveis, limite, vazio e última página
15. /orders/me: número de consultas constante entre 5 e 50
16. projeções removem arrays e segredos; detalhes preservam descrição e snapshot
17. filtros de lifecycle e isolamento do cliente preservados
18. reviews: slice limitado no Mongo, metadados e detalhe intacto
19. categories: árvore integral abaixo do teto e overflow explícito
20. addresses: somente proprietário, favorito primeiro e overflow explícito
21. parser rejeita page "0"
22. parser rejeita limit "0"
23. parser rejeita page "-1"
24. parser rejeita limit "-1"
25. parser rejeita page "1.2"
26. parser rejeita limit "1.2"
27. parser rejeita page "NaN"
28. parser rejeita limit "NaN"
29. parser rejeita page "Infinity"
30. parser rejeita limit "Infinity"
31. parser rejeita page "abc"
32. parser rejeita limit "abc"
33. parser rejeita page "1e3"
34. parser rejeita limit "1e3"
35. parser rejeita page " 1"
36. parser rejeita limit " 1"
37. parser rejeita page "+1"
38. parser rejeita limit "+1"
39. parser rejeita page "01"
40. parser rejeita limit "01"
41. parser rejeita page "9007199254740992"
42. parser rejeita limit "9007199254740992"
43. parser rejeita page []
44. parser rejeita limit []
45. parser rejeita page {}
46. parser rejeita limit {}
47. parser rejeita page 1
48. parser rejeita limit 1
49. skip máximo exato e overflow seguro
50. /products rejeita page=0
51. /products rejeita limit=101
52. /products rejeita page=1&page=2
53. /products rejeita limit=1&limit=2
54. /products rejeita page[]=1
55. /products rejeita limit[$gt]=1
56. /products rejeita sort[$ne]=1
57. /products rejeita sort=name
58. /products rejeita unknown=1
59. /products rejeita page=Infinity
60. /admin/products rejeita page=0
61. /admin/products rejeita limit=101
62. /admin/products rejeita page=1&page=2
63. /admin/products rejeita limit=1&limit=2
64. /admin/products rejeita page[]=1
65. /admin/products rejeita limit[$gt]=1
66. /admin/products rejeita sort[$ne]=1
67. /admin/products rejeita sort=name
68. /admin/products rejeita unknown=1
69. /admin/products rejeita page=Infinity
70. /admin/users rejeita page=0
71. /admin/users rejeita limit=101
72. /admin/users rejeita page=1&page=2
73. /admin/users rejeita limit=1&limit=2
74. /admin/users rejeita page[]=1
75. /admin/users rejeita limit[$gt]=1
76. /admin/users rejeita sort[$ne]=1
77. /admin/users rejeita sort=name
78. /admin/users rejeita unknown=1
79. /admin/users rejeita page=Infinity
80. /orders/me rejeita page=0
81. /orders/me rejeita limit=101
82. /orders/me rejeita page=1&page=2
83. /orders/me rejeita limit=1&limit=2
84. /orders/me rejeita page[]=1
85. /orders/me rejeita limit[$gt]=1
86. /orders/me rejeita sort[$ne]=1
87. /orders/me rejeita sort=name
88. /orders/me rejeita unknown=1
89. /orders/me rejeita page=Infinity
90. /admin/orders rejeita page=0
91. /admin/orders rejeita limit=101
92. /admin/orders rejeita page=1&page=2
93. /admin/orders rejeita limit=1&limit=2
94. /admin/orders rejeita page[]=1
95. /admin/orders rejeita limit[$gt]=1
96. /admin/orders rejeita sort[$ne]=1
97. /admin/orders rejeita sort=name
98. /admin/orders rejeita unknown=1
99. /admin/orders rejeita page=Infinity
100. /admin/audit-events rejeita page=0
101. /admin/audit-events rejeita limit=101
102. /admin/audit-events rejeita page=1&page=2
103. /admin/audit-events rejeita limit=1&limit=2
104. /admin/audit-events rejeita page[]=1
105. /admin/audit-events rejeita limit[$gt]=1
106. /admin/audit-events rejeita sort[$ne]=1
107. /admin/audit-events rejeita sort=name
108. /admin/audit-events rejeita unknown=1
109. /admin/audit-events rejeita page=Infinity
110. catalog query keyword[$regex]=.*
111. catalog query keyword=a&keyword=b
112. catalog query keyword=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
113. catalog query category[$ne]=x
114. catalog query price[$gt]=1
115. catalog query price[gte][]=1
116. catalog query price[gte]=1&price[gte]=2
117. catalog query price[gte]=1.001
118. catalog query ratings[gte]=Infinity
119. catalog query ratings[gte]=6
120. /admin/users filter status=invalid
121. /admin/users filter status[]=active
122. /admin/orders filter archived=invalid
123. /admin/orders filter archived=active&archived=all
124. /admin/orders filter status=PAID
125. /orders/me filter status=invalid
126. /categories filter parent_id[]=null
127. /categories filter parent_id=invalid
128. /addresses filter page=1
129. /reviews filter productId=invalid
130. substring literal escapado e espaços normalizados sem regex do cliente
131. totalAmount global rejeita centavos inválidos fora da página
132. migration dry-run default []
133. migration dry-run default ["--dry-run"]
134. migration recusa ["--apply"]
135. migration recusa ["--apply","--confirm-db","other"]
136. migration recusa ["--repair"]
137. migration recusa ["--apply","--confirm-db","temporary","extra"]
138. migration recusa ["--confirm-db","temporary"]
139. apply exige confirmação literal exata
140. audit recusa qualquer flag de mutation
141. dry-run não cria índice; apply aditivo e segunda execução no-op
142. índice divergente impede apply inteiro e não é substituído
143. auditoria é somente leitura, não importa models e não expõe dados/URI
144. F037 índice antigo fica pendente, sem drop automático e reservas continuam únicas
145. perfil mínimo de audit:indexes aceita apenas DB sem segredos
146. CLI audit:indexes e migrate:indexes dry-run executam somente no banco temporário
147. products latest explain: IXSCAN sem SORT e custo de página
148. products category explain: IXSCAN sem SORT e custo de página
149. products legacy category explain: IXSCAN sem SORT e custo de página
150. orders customer explain: IXSCAN sem SORT e custo de página
151. orders admin active explain: IXSCAN sem SORT e custo de página
152. orders all explain: IXSCAN sem SORT e custo de página
153. users active explain: IXSCAN sem SORT e custo de página
154. users all explain: IXSCAN sem SORT e custo de página
155. users legacy active explain: IXSCAN sem SORT e custo de página
156. offset examina no máximo skip + limit; sem sort em memória
157. substring literal preserva semântica; residual scan fica registrado
158. projeção torna payload proporcional à página mesmo com descrição grande
159. categories: índice de árvore e prefixo por pai
160. addresses: índice completo suporta favorito e desempate
161. audit: requestId usa índice composto e projeção F025
162. startup readonly recusa unique ausente e aceita ledger legado protegido
163. catálogo ignora sucesso antigo mesmo quando transporte ignora abort
164. catálogo ignora erro antigo mesmo quando transporte ignora abort

## E2E novos

1. Catálogo página 1/2/voltar e filtro reseta página
2. Admin Products consome página solicitada
3. Admin Users pagina e filtro reseta página
4. Admin Orders pagina e filtro reseta página
5. Cliente navega histórico resumido paginado
6. Resposta antiga do catálogo não substitui resposta atual
