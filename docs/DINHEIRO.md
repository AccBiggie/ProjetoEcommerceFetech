# Dinheiro — FET-DATA-001

Todo dinheiro novo persistido e todo cálculo financeiro usa **centavos BRL inteiros não negativos**, limitados a Number.MAX_SAFE_INTEGER. R$ 12,34 = 1234 centavos. O finding F014 está corrigido no código; o banco real ainda não foi migrado.

## Inventário e representação

| Campo anterior | Model/local | Tipo anterior | Canônico novo | Uso |
|---|---|---|---|---|
| price | Product | String decimal arbitrária | priceCents: inteiro | Preço do servidor |
| oldPrice | Product | String decimal arbitrária | oldPriceCents: inteiro | Exibição/comparação |
| installmmentPrice | Product | String decimal arbitrária | installmmentPriceCents: inteiro | Parcela ilustrativa |
| orderItems[].price | Order | Number decimal | orderItems[].priceCents: inteiro | Snapshot unitário |
| itemsPrice | Order | Number decimal | itemsPriceCents: inteiro | Soma de linhas |
| taxPrice | Order | Number decimal | taxPriceCents: inteiro | Zero atual |
| shippingPrice | Order | Number decimal | shippingPriceCents: inteiro | Zero atual |
| totalPrice | Order | Number decimal | totalPriceCents: inteiro | Total do servidor |
| totalAmount | Resposta admin/orders | Soma Number decimal | totalAmountCents: inteiro | Agregado seguro |
| price/subtotal/total | Carrinho/localStorage/checkout | Conversões e somas decimais | priceCents e soma de centavos | Prévia local |
| off | Product/admin/seed | Number percentual | Permanece percentual | Não é dinheiro; F037 aberto |

Não há lineTotal persistido nem desconto monetário no modelo atual. A linha é calculada com multiplyCents. Ratings, estoque, quantidades e percentuais não viraram dinheiro.

## Utilitário e limites

Implementação única compartilhada: ecommerce/shared/money.mjs. Backend importa pelo adaptador utils/money.js; frontend importa o mesmo módulo. Node 24 suporta require do módulo ESM síncrono. Sem nova dependência.

Funções: parseMoneyToCents, assertCents, formatCentsToDecimal, formatBRLFromCents, addCents, multiplyCents, sumCents, readCents e splitInstallments. Normalizadores Product/Order verificam invariantes e produzem campos de compatibilidade.

Parsing usa dígitos e BigInt transitório, sem multiplicação de float; o resultado persistido/JSON continua Number safe integer. Entrada aceita decimal técnico com ponto e até duas casas. Zero permanece permitido na API, como antes; coerência comercial pertence a F037. Espaços, negativos, vírgula, NaN, Infinity, notação científica textual e três casas são recusados, sem arredondamento. Exemplo 0.105 → HTTP 400. Valores monetários de tokens JSON são preservados pelo reviver Node antes de perder casas/centavos na conversão Number; 1e3 também é recusado nessa fronteira. Número já construído em memória segue sua representação String, conforme contrato de normalização JSON. Quantidade do cálculo exige inteiro positivo, sem booleano, fração ou overflow.

Soma e multiplicação verificam cada resultado. Formatter decimal usa divisão/resto inteiros. BRL usa Intl somente na apresentação, com BigInt e substituição da fração, preservando inclusive o centavo no limite safe integer. Não se parseia texto formatado para fazer cálculo.

Proibidos no domínio financeiro: price * quantity, parseFloat(price), Number(total.toFixed(2)), Math.round(total * 100) / 100. Math.round de percentual off permanece cálculo não monetário; nenhuma política comercial nova foi criada.

## API e persistência

Admin create/update continua recebendo price, oldPrice e installmmentPrice humanos, por exemplo "199.90". O servidor converte e persiste somente os equivalentes Cents. Campos canônicos enviados pelo cliente são ignorados pelo whitelist; conflito price="199.90", priceCents=1 resulta em 19990. Update parcial mantém o dinheiro atual. Editar legado válido converte para canônico e remove campos decimais persistidos. Precisão ambígua precisa de preço explícito revisado pelo operador.

Resposta expõe Cents e campos históricos como strings derivadas, por exemplo priceCents=19990 e price="199.90". Order também retorna totalPrice como string exata, junto de totalPriceCents. Consumidores externos que esperavam Number nos totais devem adotar Cents ou tratar a string como apresentação. A grafia installmmentPrice foi preservada. Nunca usar campos históricos para calcular se o canônico existir.

Leitura legada é estrita, sem escrita automática: documento exato é convertido em memória, com moneyLegacy=true. Mais de duas casas, overflow ou pedido inconsistente produz erro controlado, sem dinheiro inventado. Campos canônicos inválidos não caem no legado. Se Cents estiver válido, vence qualquer campo antigo remanescente. A migração identifica e remove esses remanescentes.

Filtro existente price[gt/gte/lt/lte] converte boundaries humanos estritamente. Documentos canônicos usam priceCents; fallback do filtro legado usa regex, concatenação de dígitos e inteiro Mongo long, sem double/round. Precisão inválida é excluída pelo filtro. A ordenação existente era createdAt/_id; sort=price não era suportado e não foi inventado.

## Pedido e frontend

Cliente manda IDs/quantidades. Backend consulta Product, lê centavos do servidor e ignora preços, subtotal, frete, imposto e total adulterados. Snapshot unitário persiste priceCents. itemsPriceCents = soma(priceCents × quantity); totalPriceCents = itemsPriceCents + taxPriceCents + shippingPriceCents. Tax/frete continuam zero, pagamento Pending. Schema valida essas invariantes antes de save; nenhum gateway, frete, reserva, atomicidade ou idempotência foi implementado.

Carrinho novo grava priceCents e compatibilidade decimal derivada. Ao carregar localStorage, Cents válido vence; preço antigo exato é convertido; item inválido fica marcado, visível/removível, bloqueando checkout e totalização. Overflow agregado bloqueia avanço; Shipping também redireciona carrinho inválido. Formatação em catálogo, detalhes, carrinho, checkout, pedidos e admin recebe centavos.

Admin preserva o texto digitado e rejeita três casas com mensagem compreensível. Não arredonda antes de enviar. Parcelas são **ilustrativas**, sem promessa de 12 cobranças iguais. splitInstallments distribui resto inteiro deterministicamente (10000/3 → 3334,3333,3333); admin/seed armazenam a primeira parcela ilustrativa. Não há cobrança, juros ou política do gateway nesta tarefa; F001/F037 permanecem abertos.

## Compatibilidade e operação

Aplicação e frontend devem ser atualizados juntos, com plano operacional de deploy/cutover. Dados legados precisam de dry-run e revisão antes de remover compatibilidade futura. Nenhuma migração roda no startup. Veja [MIGRACAO_DINHEIRO_CENTAVOS.md](MIGRACAO_DINHEIRO_CENTAVOS.md).

Banco real não alterado. F024 backup/restore precisa estar validado antes de qualquer apply em dados comerciais. Históricos ambíguos exigem revisão humana. F001, F003/F004/F005, F012/F013, F027/F028 e F037 continuam fora do escopo.
