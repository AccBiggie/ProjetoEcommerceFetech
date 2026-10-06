# Comandos para executar o projeto

Execute no PowerShell a partir da raiz do repositorio:

```powershell
cd C:\Users\Andre\Documents\GitHub\ProjetoEcommerceFetech
node --version
npm.cmd --version
```

## Cadastrar produtos de exemplo

Depois de criar o administrador `admin@fetech.local`, na raiz do projeto:

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
& .local/mongod.exe --version
```

Referencia: [instalacao oficial do MongoDB por ZIP no Windows](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows-zip/).

## Iniciar novamente em tres terminais

Se os processos desta sessao ainda estiverem ativos, use a loja diretamente.
Para reiniciar, encerre primeiro os processos existentes, evitando duplicar
as portas. Em cada terminal, comece na raiz do repositorio.

Terminal 1: MongoDB (dados persistidos em `.local/mongo-data`).

```powershell
& .local/mongod.exe --dbpath .local/mongo-data --bind_ip 127.0.0.1 --port 27017
```

Terminal 2: API.

```powershell
cd ecommerce
npm.cmd start
```

Terminal 3: React (comando usado na sessao).

```powershell
cd ecommerce/frontend
npm.cmd start
```

Acesse http://localhost:3000. Para encerrar processos iniciados nesses
terminais, use Ctrl+C em cada um.

Para iniciar MongoDB e API em segundo plano e guardar os processos:

```powershell
$projectRoot = (Get-Location).Path
$mongoProcess = Start-Process -FilePath (Join-Path $projectRoot '.local/mongod.exe') -ArgumentList @('--dbpath', ('"' + (Join-Path $projectRoot '.local/mongo-data') + '"'), '--bind_ip', '127.0.0.1', '--port', '27017', '--logpath', ('"' + (Join-Path $projectRoot '.local/mongod.log') + '"')) -WindowStyle Hidden -PassThru
$apiProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'backend/server.js' -WorkingDirectory (Join-Path $projectRoot 'ecommerce') -RedirectStandardOutput (Join-Path $projectRoot '.local/backend.log') -RedirectStandardError (Join-Path $projectRoot '.local/backend-error.log') -WindowStyle Hidden -PassThru
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

Na revisao posterior das rotas, a compilacao passou sem avisos de lint.
Foram executados `npm.cmd test` (API) e `npm.cmd run test:e2e`
(navegador) na pasta `ecommerce`, com bancos temporarios separados.
Veja [ROTAS.md](ROTAS.md) para o mapa e os comandos completos dessa revisao.
