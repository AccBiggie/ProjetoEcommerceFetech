# Comandos para executar o projeto

Execute no PowerShell a partir da raiz do repositorio:

```powershell
cd C:\Users\Andre\Documents\GitHub\ProjetoEcommerceFetech
node --version
npm.cmd --version
```

## Endereços por usuário

O cadastro está em `/addresses`, acessível em **Meus endereços** no perfil
e no menu da conta. O backend prepara os índices da coleção `addresses`
antes de abrir a porta. Não há seed ou migração de `Order.shippingInfo`:
contas existentes começam sem endereços nesse cadastro independente.

Validação da funcionalidade, com MongoDB ativo e a partir da raiz:

```powershell
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
```

Os testes usam bancos temporários, verificam isolamento por proprietário,
favorito único e telas em 360/768/1440 px. Não apontar os testes para `fetech`.
Detalhes: [docs/ENDERECOS.md](docs/ENDERECOS.md).

## Cadastrar produtos de exemplo

Depois de criar o administrador com o bootstrap abaixo, na raiz do projeto:

```powershell
cd ecommerce
npm.cmd run seed:products
cd ..
```

O script cadastra um produto em cada uma das 11 categorias do menu, com
precos ficticios, estoque de 10 unidades e imagens locais. Pode ser
executado novamente: exemplos existentes sao preservados, sem duplicacao.
So permite o banco local `fetech` na porta 27017. Nesta sessao, os 11
produtos, seus detalhes, imagens e filtros de categoria da API foram
verificados pelo proxy do frontend.

## Primeiro administrador — bootstrap seguro

Após configurar o banco e iniciar MongoDB, execute em terminal interativo:

```powershell
npm.cmd run admin:bootstrap --prefix ecommerce
```

Somente quando não existe administrador. O comando exibe host, database e
ambiente sem credenciais; digite exatamente o nome do banco para confirmar.
Informe nome, e-mail novo, senha e confirmação com entrada oculta. Não fornece
senha padrão, não aceita argumentos e não grava credenciais em arquivos.
E-mail já existente ou admin existente causa recusa; não promove conta comum.
Exit code 0: sucesso; 1: cancelamento, recusa, validação ou erro operacional.
Após criar, use `/login` normalmente. Provisionamento não interativo não é
suportado. Leia [docs/ADMINISTRACAO.md](docs/ADMINISTRACAO.md).

```powershell
node --test ecommerce/tests/adminSafety.test.js
```

Essa suíte usa exclusivamente bancos temporários com teardown; não executa
bootstrap no banco real. O seed local aceita qualquer admin já criado, sem
exigir e-mail fixo. Reinicie todas as instâncias da API para carregar as regras.

## Dependencias atualizadas

Use Node 24.19 ou superior na linha 24 LTS e npm 11. Instalacao com os
lockfiles atualizados, sem ignorar conflitos de dependencias:

```powershell
cd ecommerce
npm.cmd ci --no-fund --cache .npm-cache
cd frontend
npm.cmd ci --no-fund --cache ../.npm-cache
cd ../..
```

A migracao para Vite, React 19, Material UI 9, Express 5 e Mongoose 9
esta documentada em [DEPENDENCIAS.md](DEPENDENCIAS.md).

## Configuracao (executado)

O comando cria o arquivo somente se ele ainda nao existir:

```powershell
cd ecommerce
node -e "const fs=require('fs'),crypto=require('crypto');const file='backend/config/config.env';if(!fs.existsSync(file))fs.writeFileSync(file,fs.readFileSync(file+'.example','utf8').replace('substitua-por-uma-chave-aleatoria',crypto.randomBytes(32).toString('hex')));"
cd ..
```

## MongoDB local (download e extracao executados)

O binario ja foi preparado em `.local/mongod.exe`. Para reproduzir em
outra copia do projeto, baixe o ZIP oficial e extraia somente o servidor:

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
node -e "const https=require('https'),fs=require('fs');https.get('https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.26.zip',res=>{if(res.statusCode!==200){console.error(res.statusCode);process.exit(1)}const out=fs.createWriteStream('.local/mongodb.zip');res.pipe(out);out.on('finish',()=>console.log('MongoDB ZIP baixado'));}).on('error',e=>{console.error(e.message);process.exit(1)});"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Join-Path (Get-Location) '.local/mongodb.zip'))
try {
    $entry = $archive.Entries | Where-Object FullName -like '*/bin/mongod.exe' | Select-Object -First 1
    if (!$entry) { throw 'mongod.exe ausente no ZIP' }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path (Get-Location) '.local/mongod.exe'), $true)
} finally { $archive.Dispose() }
New-Item -ItemType Directory -Force .local/mongo-data | Out-Null
& ".\.local\mongod.exe" --version
```

Referencia: [instalacao oficial do MongoDB por ZIP no Windows](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows-zip/).

## Iniciar novamente em tres terminais

Se os processos desta sessao ainda estiverem ativos, use a loja diretamente.
Para reiniciar, encerre primeiro os processos existentes, evitando duplicar
as portas. Os comandos abaixo identificam a pasta do projeto explicitamente;
cada terminal pode começar em uma pasta diferente.

Terminal 1: MongoDB (dados persistidos em `.local/mongo-data`). No PowerShell,
use o operador `&` para executar o binário e caminhos absolutos para o
executável e o banco. O comando anterior com `.local/...` dependia de estar
na raiz; não localizava esses arquivos a partir de `ecommerce` ou `frontend`.

```powershell
$projectRoot = 'C:\Users\Andre\Documents\GitHub\ProjetoEcommerceFetech'
$mongoExecutable = Join-Path $projectRoot '.local\mongod.exe'
$mongoDataPath = Join-Path $projectRoot '.local\mongo-data'
if (-not (Test-Path -LiteralPath $mongoExecutable -PathType Leaf)) {
    throw "MongoDB não encontrado em $mongoExecutable. Prepare o binário conforme a seção de instalação."
}
New-Item -ItemType Directory -Force -Path $mongoDataPath | Out-Null
& $mongoExecutable --dbpath $mongoDataPath --bind_ip 127.0.0.1 --port 27017
```

Terminal 2: API.

```powershell
Set-Location 'C:\Users\Andre\Documents\GitHub\ProjetoEcommerceFetech\ecommerce'
npm.cmd start
```

Terminal 3: React (comando usado na sessao).

```powershell
Set-Location 'C:\Users\Andre\Documents\GitHub\ProjetoEcommerceFetech\ecommerce\frontend'
npm.cmd start
```

Acesse http://localhost:3000. Para encerrar processos iniciados nesses
terminais, use Ctrl+C em cada um.

Para iniciar MongoDB e API em segundo plano e guardar os processos:

```powershell
$projectRoot = 'C:\Users\Andre\Documents\GitHub\ProjetoEcommerceFetech'
$mongoExecutable = Join-Path $projectRoot '.local\mongod.exe'
$mongoDataPath = Join-Path $projectRoot '.local\mongo-data'
if (-not (Test-Path -LiteralPath $mongoExecutable -PathType Leaf)) {
    throw "MongoDB não encontrado em $mongoExecutable. Prepare o binário conforme a seção de instalação."
}
New-Item -ItemType Directory -Force -Path $mongoDataPath | Out-Null
$mongoProcess = Start-Process -FilePath $mongoExecutable -ArgumentList @('--dbpath', ('"' + $mongoDataPath + '"'), '--bind_ip', '127.0.0.1', '--port', '27017', '--logpath', ('"' + (Join-Path $projectRoot '.local\mongo-start.log') + '"'), '--logappend') -WindowStyle Hidden -PassThru
$apiProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'backend/server.js' -WorkingDirectory (Join-Path $projectRoot 'ecommerce') -RedirectStandardOutput (Join-Path $projectRoot '.local\api-start.log') -RedirectStandardError (Join-Path $projectRoot '.local\api-start-error.log') -WindowStyle Hidden -PassThru
```

Os comandos `Start-Process ... -PassThru` guardam os processos nas variaveis.
Use essas variaveis para encerrar o MongoDB e a API antes de reiniciar.
O React iniciado no terminal pode ser encerrado com Ctrl+C. Os PIDs mudam
a cada inicializacao; execute no mesmo terminal que criou as variaveis:

```powershell
Stop-Process -Id $mongoProcess.Id,$apiProcess.Id
```

## Verificacao (executados)

```powershell
cd ecommerce
node --check backend/server.js
node --check backend/controllers/userController.js
cd frontend
npm.cmd run build
cd ../..
node -e "require('http').get('http://127.0.0.1:4000/api/v1/products',r=>{console.log('HTTP',r.statusCode);r.pipe(process.stdout)}).on('error',e=>{console.error(e.message);process.exit(1)})"
```

Tambem foram inspecionados arquivos com `rg`, `Get-Content`, `Get-ChildItem`
e o estado do repositorio com `git status --short` e `git diff`. `docker info`
indicou que o daemon nao estava disponivel. `wsl --list --verbose` recebeu
acesso negado no ambiente. O download com `curl.exe` falhou na camada TLS;
o download via Node acima funcionou. A verificacao HTTP usa Node porque
`Invoke-RestMethod` nao conseguiu acessar a API neste ambiente.

Foram executados scripts temporarios via `@' ... '@ | node` para validar
hash de senha, login incorreto (401), login correto (200), cookie com
expiracao, consulta autenticada do perfil (200), token de reset invalido
(400), confirmacao de senha diferente (400) e reset valido (200). Os
usuarios temporarios foram excluidos ao final de cada verificacao.

Na configuracao inicial, build e proxy `/api/v1/products` foram validados.
A validacao das dependencias atualizadas esta em DEPENDENCIAS.md.

## Cookie e proxy por ambiente — FET-SEC-005

Desenvolvimento: mantenha `NODE_ENV=development`, `COOKIE_EXPIRE=7` e
`TRUST_PROXY_HOPS` ausente ou 0. Testes isolam `NODE_ENV=test` e proxy 0.
Produção: configure exatamente `NODE_ENV=production`; Secure é obrigatório e
exige HTTPS real. Cookie não cria TLS/certificados/proxy automaticamente.
Não existe override COOKIE_SECURE. Não houve alteração do config.env real.

`TRUST_PROXY_HOPS=1..5` somente após validar topologia conhecida, impedir bypass
direto do proxy e sanear headers encaminhados. Valores fora de 0..5 impedem
startup; ausente mantém false. Nunca habilite trust proxy=true genericamente.
COOKIE_EXPIRE ausente/inválido também impede startup. Reinicie todas as APIs
após aplicar alterações. Política: [docs/AUTENTICACAO.md](docs/AUTENTICACAO.md).

```powershell
node --test ecommerce/tests/authCookieSecurity.test.js
node --test ecommerce/tests/privateResponseSecurity.test.js
node --test ecommerce/tests/httpSecurity.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
```

Na revisao posterior das rotas, a compilacao passou sem avisos de lint.
Foram executados `npm.cmd test` (API) e `npm.cmd run test:e2e`
(navegador) na pasta `ecommerce`, com bancos temporarios separados.
Veja [ROTAS.md](ROTAS.md) para o mapa e os comandos completos dessa revisao.

## Hardening HTTP — FET-SEC-007

API mutável exige X-Fetech-CSRF: 1. Frontend envia por interceptor Axios;
clientes CLI também devem enviar. Logout agora POST; GET retorna 405 sem mutar.
Desenvolvimento permite localhost/127.0.0.1:3000 e origin da FRONTEND_URL;
production exige FRONTEND_URL explícita HTTPS válida, sem credenciais/wildcard.
Config.env real preservado. Reiniciar API/frontend após aplicar mudanças.

Helmet instalado somente no backend. Audit desta task:

```powershell
npm.cmd audit --prefix ecommerce --cache .local/npm-cache
```

Cache local evita escrita no cache global restrito do ambiente. CSP do build
validada no host E2E; não é deployment produtivo. HTTP/TLS/HSTS reais pertencem
à F023. Política completa: [docs/SEGURANCA_HTTP.md](docs/SEGURANCA_HTTP.md).

## Startup e validação de ambiente (FET-SEC-008)

Antes de `npm.cmd start --prefix ecommerce`, configure as variáveis conforme [CONFIGURACAO.md](docs/CONFIGURACAO.md). Configuração inválida impede conexão Mongo e abertura da porta, com exit 1. Nenhum secret default é fornecido. Grupos SMTP/Cloudinary parciais agora são erros; deixe o grupo SMTP inteiro vazio no desenvolvimento sem transporte. Production exige SMTP completo e FRONTEND_URL HTTPS. O arquivo real config.env não é alterado automaticamente.

Teste isolado, sem credenciais reais ou banco externo:

```powershell
node --test ecommerce/tests/configSecurity.test.js
```

Bootstrap administrativo usa perfil Mongo próprio; seed preserva sua restrição ao banco local. Não execute esses comandos contra o banco real para verificar configuração.

## Migração monetária manual — FET-DATA-001

`npm.cmd run migrate:money --prefix ecommerce` é dry-run por padrão. Não foi executado no banco real nesta task. Apply exige `--apply --confirm-db NOME_EXATO`; production exige autorização adicional `--allow-production` e backup/restore validado. F024 permanece aberto: não recomendamos migração em dados comerciais. Sequência completa: [MIGRACAO_DINHEIRO_CENTAVOS.md](docs/MIGRACAO_DINHEIRO_CENTAVOS.md).

```powershell
node --test ecommerce/tests/money.test.js
node --test ecommerce/tests/moneyApi.test.js
node --test ecommerce/tests/moneyMigration.test.js
```

## Checkout e auditoria de entrega — FET-DATA-002

```powershell
node --test ecommerce/tests/checkoutValidation.test.js
node --test ecommerce/tests/shippingSnapshotAudit.test.js
# Somente leitura; confira NODE_ENV e DB_URI do ambiente antes de executar:
npm.cmd run audit:shipping --prefix ecommerce
```

Nesta tarefa o audit foi executado somente em bancos temporários de testes.
O perfil `shipping-audit` exige somente configuração operacional NODE_ENV/DB_URI.
Não há --apply, migração ou reconstrução de zeros históricos. F024 continua
pendente antes de futuras ações sobre o histórico real.
Veja [docs/VALIDACAO_CHECKOUT.md](docs/VALIDACAO_CHECKOUT.md).
