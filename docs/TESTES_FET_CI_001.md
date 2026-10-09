# Testes — FET-CI-001

As suites ciCommercialGate/ciRepositorySafety cobrem: lista F024 completa,
Tools sem skips, arquivo/nome/motivo adulterados, bloqueio parcial/duplicado,
todo/falha backend, relatório vazio/arquivo omitido, E2E skipped/failed/timedOut/
interrupted/expected failure/retry, aggregate success/failure/cancelled/skipped/
missing, executável aggregate, timeout real e falhas reais de subprocessos API,
build e E2E interrompendo a sequência comercial.

Segurança: DB_NAME=fetech em subprocesso aborta antes de qualquer conexão;
URI externa, identidade ausente, host externo/database comercial/porta 27017,
estado/diretório/origin E2E fora do contexto. Config isolada usa dotenv que lança
erro se chamado, demonstrando ausência de leitura do config.env. Fixtures de AST
com .only, computed only, describe.only, opção only/skip, todo, skip, fixme,
aliases, comentários e strings. Arquivos env/backup/manifests/partials/chaves/
artefatos Mongo/state privados rejeitados. Example seguro aceito e secret
simulado em example rejeitado. Índice Git fake com config.env tracked bloqueado.
Diff de commits fixture com trailing spaces reprova; patch limpo aprova;
merge-base PR e hash inválido são verificados.

Workflow é validado estruturalmente: gatilhos, permissões, seis dependências,
always, Node fixo, npm ci/locks, SHA dos actions, timeouts, cancelamento só PR,
artefatos curtos sem env/DB/state, ausência de deploy/secrets/Tools/audit fix/
migrations comerciais. ciIsolation inicia dois replica sets em paralelo,
transaciona de verdade em nomes distintos e comprova cleanup independente.

Backend architecture preserva quatro assertions existentes e acrescenta provas
de JWT cookie/JSON e Product domain sem mass assignment. Frontend architecture
mantém as quatro assertions existentes. API/E2E completos são gates obrigatórios.
F024 continua parcial com quinze bloqueios explícitos. Resultados finais e
comandos executados: [relatório](RELATORIO_FET_CI_001.md).
