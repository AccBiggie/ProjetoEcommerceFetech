# Endereços por usuário

Implementação de 07/10/2026 no ProjetoEcommerceFetech.

## Gestão na conta

O usuário autenticado acessa **Meus endereços** nas ações do perfil (`/account`)
ou no menu **Minha conta** do cabeçalho. A página `/addresses` lista somente
os seus endereços, com favorito primeiro e demais por criação decrescente.

**Adicionar endereço** e **Editar** abrem um painel lateral Material UI.
Cada cartão permite editar, excluir com confirmação ou tornar favorito.
O favorito tem chip e borda destacados com as cores do tema. A edição permite
desmarcar o favorito. Excluir o favorito pode deixar a conta sem favorito.
Não há limite de quantidade de endereços nesta implementação.

A página segue os temas claro/escuro, campos rotulados, foco e navegação por
teclado. O formulário tem conteúdo rolável e ações no rodapé. A apresentação
é verificada em 360, 768 e 1440 px.

## Persistência

`backend/models/addressModel.js` define o model `Address`, na coleção própria
`addresses`. Endereços não são embutidos no documento `User`.

| Campo | Tipo e validação |
| --- | --- |
| `user` | ObjectId obrigatório, referência a `User`, derivado da sessão |
| `label` | Texto obrigatório; identificação, até 80 caracteres |
| `recipientName` | Texto obrigatório; destinatário, até 120 caracteres |
| `address` | Texto obrigatório; rua/logradouro, até 200 caracteres |
| `number` | Texto obrigatório, até 30 caracteres; aceita valores como 20A ou S/N |
| `complement` | Texto opcional, até 120 caracteres |
| `neighborhood` | Texto obrigatório, até 120 caracteres |
| `city` | Texto obrigatório, até 120 caracteres |
| `state` | Texto obrigatório, até 80 caracteres |
| `country` | Texto obrigatório; padrão Brasil, até 80 caracteres |
| `pinCode` | String obrigatória com 8 dígitos |
| `phoneNo` | String obrigatória com 10 a 15 dígitos, incluindo DDD |
| `favorite` | Boolean, padrão false |
| `createdAt`, `updatedAt` | Timestamps do Mongoose |

Campos de texto são aparados. CEP aceita dígitos, espaços e hífen na entrada;
telefone aceita pontuação telefônica usual. A API remove a formatação e
persiste somente dígitos, preservando zeros iniciais. Valores numéricos para
esses campos são rejeitados, impedindo perda de zeros por conversão. O formato
atual de CEP é brasileiro; validação internacional fica para evolução futura.

Não foi adicionada biblioteca de máscaras nem nova dependência.

## API autenticada

Prefixo: `/api/v1`. Todas as rotas usam o middleware existente e o cookie
`token`. Não há exceção de leitura de terceiros para administradores.

| Método | Caminho | Resultado |
| --- | --- | --- |
| GET | `/addresses` | 200: `{ success, addresses }`, somente da sessão |
| POST | `/address/new` | 201: `{ success, address }` |
| GET | `/address/:id` | 200: `{ success, address }` |
| PUT | `/address/:id` | 200: `{ success, address }`, atualização parcial |
| DELETE | `/address/:id` | 200: `{ success, message }` |
| PUT | `/address/:id/favorite` | 200: `{ success, address }` |

Exemplo de criação:

```json
{
  "label": "Casa",
  "recipientName": "Cliente Exemplo",
  "address": "Rua das Flores",
  "number": "100",
  "complement": "Apartamento 2",
  "neighborhood": "Centro",
  "city": "São Paulo",
  "state": "SP",
  "country": "Brasil",
  "pinCode": "01234-567",
  "phoneNo": "(11) 99999-9999",
  "favorite": true
}
```

`user`, `userId`, `role` e outros campos fora da lista permitida são ignorados.
A propriedade é sempre `req.user._id`. Consulta, edição, exclusão e favorito
filtram simultaneamente pelo ID do endereço e pelo usuário. Endereço de outra
conta ou inexistente retorna 404, sem revelar dados. IDs inválidos e entradas
inválidas retornam 400; ausência de sessão, 401. Erros seguem
`{ success: false, message }`.

## Favorito único

Cada conta pode ter zero ou um favorito. Criar/editar com `favorite: true` ou
usar o endpoint dedicado desmarca o anterior da mesma conta antes de salvar
o novo. Nenhuma operação altera o favorito de outro usuário.

O MongoDB possui um índice único parcial em `user`, aplicado somente aos
documentos com `favorite: true`. O índice impede dois favoritos para a mesma
conta, inclusive em escritas concorrentes por outros processos. O servidor
aguarda a criação do índice antes de abrir a porta.

As escritas da mesma conta são serializadas no processo da API. Os dados são
validados antes de desmarcar o favorito anterior; entrada inválida não muda
o favorito. Em falha de gravação, a implementação tenta restaurar o favorito
anterior se nenhum outro tiver sido definido. Conflito de unicidade retorna
409 para o cliente atualizar e tentar novamente.

Não há transação envolvendo todos os documentos: o MongoDB local funciona
sem replica set. Entre desmarcar e salvar pode haver momentaneamente zero
favoritos, o que respeita a regra do domínio. Em múltiplas instâncias, o índice
mantém a unicidade, mas uma disputa pode retornar 409 em vez de todos os
pedidos concorrentes terem sucesso.

## Checkout e pedidos

O cadastro novo não lê nem sobrescreve `localStorage.shippingInfo` e não altera
`Order.shippingInfo`. Na etapa `/shipping`, os endereços cadastrados aparecem
em cards com seleção única e favorito destacado. Os campos atuais de endereço,
cidade, estado, país, CEP e telefone continuam disponíveis para edição.

Inicialmente o checkout mantém os valores anteriores de `shippingInfo`, sem
selecionar o favorito automaticamente. Escolher um card copia os seus dados
para o formulário. Rua, número, complemento e bairro são reunidos no campo
Endereço; os demais campos são copiados individualmente. Ao editar qualquer
campo, a seleção muda para **Preencher ou ajustar manualmente**, sem perder
os dados preenchidos. Escolher um endereço não altera o favorito da conta.

O link **Gerenciar endereços** abre o cadastro da conta. Sem endereços ou em
falha da consulta, o formulário manual continua disponível; falhas permitem
tentar novamente. Os cards são carregados pelo endpoint privado da conta.

Não há referência obrigatória de `Order` para `Address`. Editar ou excluir
um endereço cadastrado não afeta pedidos. Nesta integração, o formulário envia
os dados finais ao endpoint atual de pedido: não envia uma referência de
`Address` e não muda o contrato de `Order.shippingInfo`. CEP e telefone continuam
strings no cadastro `Address`, mas o snapshot de pedido mantém os tipos
numéricos históricos. Uma futura seleção resolvida diretamente por ID no
servidor exigirá validação de propriedade e adaptação explícita do contrato.

Ficam fora desta implementação: transportadora, frete, rastreamento e vínculo
opcional de referência no pedido.
Não houve migração de usuários, endereços de checkout ou pedidos antigos.

## Organização e verificação

Backend: `addressModel.js`, `addressController.js`, `addressRoute.js`,
`addressInput.js` e `addressWrite.js`. Frontend: `Addresses.jsx`, `AddressForm.jsx`
e `utils/addressApi.js`, com estado local e chamadas Axios centralizadas,
seguindo o padrão de telas como pedidos e dashboard.

Os testes da API cobrem CRUD, isolamento, autorização, injeção de proprietário,
normalização, validação, favorito nas três formas de alteração, concorrência,
índice único e snapshot de pedidos. Playwright cobre login, navegação pelo
perfil/menu, estado vazio, criação, edição, dois endereços, favorito único,
persistência após recarga, cancelamento/exclusão e responsividade nas três
larguras. O fluxo em 360 px também usa modo escuro.

```powershell
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
```

Os testes mantêm bancos temporários isolados de `fetech` e os removem ao final.

Resultado em 07/10/2026: **13/13 testes da API**, **build aprovado** e
**15/15 testes E2E** na entrega inicial do cadastro. O model e o controller de
pedidos permanecem sem alteração. A integração posterior dos cards na tela
de entrega adicionou testes de seleção/editabilidade em 360, 768 e 1440 px,
snapshot independente e preenchimento manual mesmo com falha de consulta.
Após essa integração, a validação completa passou: **13/13 testes da API**,
**build aprovado** e **19/19 testes E2E**.
