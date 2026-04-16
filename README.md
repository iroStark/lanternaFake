# Lanterna Educacional

Aplicativo educacional demonstrando o uso combinado de lanterna (flash da câmera) e gravação de áudio, de forma totalmente transparente para o usuário.

---

## Estrutura do Projeto

```
Lanterna/
├── flutter_app/          # App Flutter (iOS & Android)
├── backend/              # API Node.js + Express + PostgreSQL
├── admin/                # Painel admin React (Vite)
├── docker-compose.yml    # Orquestração local
└── README.md
```

---

## 1. Desenvolvimento Local com Docker Compose

### Pré-requisitos
- Docker Desktop instalado e em execução
- Porta 3000, 3001 e 5432 disponíveis

### Subir todos os serviços

```bash
cd /caminho/para/Lanterna

# Construir e subir
docker-compose up --build

# Ou em background
docker-compose up --build -d
```

Serviços disponíveis:
| Serviço    | URL                        |
|------------|----------------------------|
| Admin UI   | http://localhost:3000       |
| Backend API| http://localhost:3001       |
| PostgreSQL | localhost:5432              |
| Health     | http://localhost:3001/health|

### Parar os serviços

```bash
docker-compose down

# Remover também os volumes (banco de dados)
docker-compose down -v
```

### Verificar logs

```bash
docker-compose logs -f backend
docker-compose logs -f admin
docker-compose logs -f postgres
```

---

## 2. Flutter App

### Pré-requisitos
- Flutter SDK 3.x instalado
- Android Studio ou Xcode configurado
- Dispositivo físico (para usar a lanterna e microfone)

### Configurar e executar

```bash
cd flutter_app

# Instalar dependências
flutter pub get

# Verificar ambiente
flutter doctor

# Executar em dispositivo conectado
flutter run

# Build para Android
flutter build apk --release

# Build para iOS (requer Mac + Xcode)
flutter build ios --release
```

### Configurar endpoint do backend

No arquivo `lib/main.dart`, altere a constante:

```dart
static const String _backendUrl = 'http://SEU_IP_LOCAL:3001/api/recordings';
```

Para desenvolvimento local, use o IP da sua máquina na rede (ex: `192.168.1.x`).
Para produção, use a URL do Railway (ex: `https://seu-backend.railway.app/api/recordings`).

### Permissões necessárias

**Android** (`AndroidManifest.xml`):
- `CAMERA` — para acessar a lanterna
- `RECORD_AUDIO` — para gravar áudio
- `INTERNET` — para enviar ao backend
- `FLASHLIGHT` — controle direto da lanterna

**iOS** (`Info.plist`):
- `NSMicrophoneUsageDescription`
- `NSCameraUsageDescription`

---

## 3. Deploy no Railway

### Pré-requisitos
- Conta em [railway.app](https://railway.app)
- Railway CLI: `npm install -g @railway/cli` (opcional)

### Passo a passo

#### 3.1 — Criar projeto no Railway

1. Acesse [railway.app/new](https://railway.app/new)
2. Clique em **New Project**

#### 3.2 — Adicionar PostgreSQL

1. No projeto criado, clique em **+ New Service**
2. Selecione **Database → PostgreSQL**
3. Aguarde o banco ser provisionado
4. Copie a variável `DATABASE_URL` gerada (disponível em *Variables* do serviço Postgres)

#### 3.3 — Deploy do Backend

1. Clique em **+ New Service → GitHub Repo** (ou **Deploy from local** via CLI)
2. Selecione o repositório e a pasta **`backend/`** como root
3. O Railway detectará o `Dockerfile` automaticamente
4. Em **Variables**, adicione:
   ```
   DATABASE_URL=<URL copiada do passo 3.2>
   PORT=3001
   ```
5. Em **Settings → Networking**, gere um domínio público
6. Aguarde o deploy — verifique `/health` no domínio gerado

#### 3.4 — Deploy do Admin

1. Clique em **+ New Service → GitHub Repo**
2. Selecione o repositório e a pasta **`admin/`** como root
3. O Railway detectará o `Dockerfile` com nginx
4. Antes do build, edite `admin/nginx.conf` substituindo `http://backend:3001` pela URL pública do backend Railway:
   ```nginx
   location /api {
       proxy_pass https://seu-backend.railway.app;
   }
   ```
5. Em **Settings → Networking**, gere um domínio público para o admin

#### 3.5 — Configurar o Flutter App para produção

Edite `flutter_app/lib/main.dart`:
```dart
static const String _backendUrl = 'https://seu-backend.railway.app/api/recordings';
```

Faça o build e distribua o APK.

---

## API Reference

### POST /api/recordings
Envia uma gravação (multipart/form-data).

| Campo        | Tipo   | Descrição                    |
|-------------|--------|------------------------------|
| `audio`     | File   | Arquivo de áudio (.m4a, etc) |
| `duration`  | Number | Duração em segundos          |
| `filename`  | String | Nome original do arquivo     |
| `recorded_at`| String | ISO 8601 timestamp           |

### GET /api/recordings
Lista gravações com paginação.

Query params: `page` (default: 1), `limit` (default: 10, max: 100)

### GET /api/recordings/:id
Retorna metadados de uma gravação.

### GET /api/recordings/:id/audio
Faz streaming do arquivo de áudio (suporta Range requests).

### DELETE /api/recordings/:id
Remove a gravação do banco e do disco.

### GET /health
Health check do servidor.

---

## Tecnologias

| Camada    | Tecnologia                              |
|----------|-----------------------------------------|
| Mobile   | Flutter, torch_light, record, http      |
| Backend  | Node.js, Express, PostgreSQL, Multer    |
| Admin    | React, Vite, Axios, CSS puro            |
| Infra    | Docker, nginx, Railway, PostgreSQL 16   |
