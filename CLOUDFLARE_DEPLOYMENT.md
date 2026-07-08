# 🛠️ Guia de Deploy Completo na Cloudflare

Este guia contém as instruções passo a passo para realizar o deploy deste portal de Controle de Qualidade (CQ) na plataforma **Cloudflare Pages & Workers**. 

Este projeto foi totalmente adaptado para a arquitetura nativa da Cloudflare, usufruindo de desempenho extremo através de processamento na Edge (Workers), armazenamento estruturado de baixa latência (D1), armazenamento de objetos (R2), cache de borda rápido (KV & Cache API), sincronização em tempo real via websockets (Durable Objects) e inteligência artificial nativa (Workers AI).

---

## 📋 Pré-requisitos

1. **Cloudflare Account**: Ter uma conta ativa na Cloudflare.
2. **Node.js**: Node.js instalado (v18 ou posterior).
3. **Wrangler CLI**: A CLI oficial da Cloudflare instalada globalmente ou via `npx`:
   ```bash
   npm install -g wrangler
   ```
4. **Autenticação**: Faça login na sua conta Cloudflare pelo terminal:
   ```bash
   wrangler login
   ```

---

## 🚀 1. Criando e Configurando os Recursos (Bancos, Buckets e KV)

Execute os comandos a seguir para provisionar os recursos necessários para o projeto:

### 🗄️ A. Banco de Dados Cloudflare D1
Crie a instância do D1 para armazenamento de avaliações, checklists, técnicos e logs:
```bash
wrangler d1 create claro-cq-d1
```
> **Importante**: O comando acima exibirá informações contendo o `database_id` (um UUID). **Copie este ID** e cole no seu arquivo `wrangler.toml` no campo `database_id` da diretiva `[[d1_databases]]`.

### 🪣 B. Armazenamento de Objetos R2 (Evidências)
Crie o bucket R2 para armazenar as fotos e mídias de evidências anexadas pelos técnicos:
```bash
wrangler r2 bucket create claro-cq-evidencias
```

### 🔑 C. Namespace Key-Value (KV Cache)
Crie o namespace KV para gerenciar cache de APIs de alto desempenho, sessões ativas e limites diários de IA:
```bash
wrangler kv:namespace create CLARO_KV
```
> **Importante**: O comando acima exibirá informações contendo o `id` do namespace criado. **Copie este ID** e cole no seu arquivo `wrangler.toml` no campo `id` da diretiva `[[kv_namespaces]]`.

---

## ⚡ 2. Revisando o arquivo `wrangler.toml`

Certifique-se de que o arquivo `wrangler.toml` na raiz do projeto está preenchido com os IDs correspondentes gerados nos passos anteriores:

```toml
# Cloudflare Wrangler Configuration File for Claro CQ Portal
name = "claro-cq-portal"
pages_build_output_dir = "dist"
compatibility_date = "2026-07-08"

[vars]
MAX_ANALISES_IA_DIA = "100"
MAX_ANALISES_IA_MES = "3000"
ia_modo_automatico_gratis = "true"
ia_exigir_confirmacao_quando_pago = "true"
ia_limite_gratuito_diario = "50"
ia_limite_gratuito_mensal = "1500"
LGPD_HASH_SALT = "claro_cq_lgpd_salt_2026_prod"

# Cloudflare D1 Database Binding
[[d1_databases]]
binding = "DB"
database_name = "claro-cq-d1"
database_id = "COLE_O_DATABASE_ID_GERADO_AQUI"
migrations_dir = "migrations"

# Cloudflare R2 Storage Binding for Evidence Uploads
[[r2_buckets]]
binding = "EVIDENCIAS_BUCKET"
bucket_name = "claro-cq-evidencias"

# Cloudflare KV Namespace Binding for cache, audit logs and rate-limiting
[[kv_namespaces]]
binding = "CLARO_KV"
id = "COLE_O_KV_ID_GERADO_AQUI"

# Cloudflare Durable Objects Binding for real-time WebSocket communication
[[durable_objects.bindings]]
name = "RealtimeHub"
class_name = "RealtimeHub"

# Durable Objects Migrations (necessary for registering the DO class)
[[migrations]]
tag = "v1"
new_classes = ["RealtimeHub"]

# Cloudflare Workers AI Binding
[ai]
binding = "AI"
```

---

## 💾 3. Aplicando as Migrações do Banco de Dados D1

Antes de enviar a aplicação para produção, é necessário inicializar as tabelas e dados iniciais (seeding) no banco de dados D1.

### Para desenvolvimento local (teste de sandbox):
```bash
wrangler d1 migrations apply claro-cq-d1 --local
```

### Para o banco de dados de produção da Cloudflare:
```bash
wrangler d1 migrations apply claro-cq-d1 --remote
```

---

## 🛡️ 4. Configurando Variáveis de Ambiente e Secrets com Segurança

Para garantir a total conformidade com as diretivas de segurança e com a LGPD, os segredos de produção nunca ficam expostos no repositório.

Configure o SALT utilizado na anonimização hash da LGPD na sua conta Cloudflare:
```bash
wrangler pages secret put LGPD_HASH_SALT
```
> Digite o valor seguro da chave quando solicitado pelo terminal (ex: `claro_cq_lgpd_salt_2026_prod_key_complexa`).

Se você preferir gerenciar essas chaves diretamente no painel da Cloudflare:
1. Acesse o **Cloudflare Dashboard** > **Workers & Pages** > Selecione o projeto `claro-cq-portal`.
2. Vá em **Settings** > **Environment variables**.
3. Adicione as variáveis e segredos sob a aba **Production** (e opcionalmente **Preview**).

---

## 🚀 5. Compilação e Deploy da Aplicação

Para gerar os arquivos estáticos e subir as Pages Functions contendo toda a API de retaguarda:

### A. Executar o Build de Produção do Frontend:
```bash
npm run build
```

### B. Publicar na Cloudflare Pages:
```bash
wrangler pages deploy dist --project-name claro-cq-portal
```

---

## 🔍 Resumo dos Recursos Utilizados na Cloudflare

### 📦 Bindings de Retaguarda Requeridos:
1. **`DB`**: Vinculado à instância de banco de dados **Cloudflare D1** (`claro-cq-d1`).
2. **`EVIDENCIAS_BUCKET`**: Vinculado ao bucket **Cloudflare R2** (`claro-cq-evidencias`).
3. **`CLARO_KV`**: Vinculado ao namespace **Cloudflare KV** de alta performance.
4. **`RealtimeHub`**: Namespace de **Durable Objects** configurado para comunicação e broadcast em tempo real via WebSockets.
5. **`AI`**: Binding do **Cloudflare Workers AI** integrado para suportar análises automáticas locais se desejado.

### 🧩 Cache inteligente integrado:
- **Cloudflare Cache API**: Integrado nativamente no endpoint `/api/certificacoes`. Respostas de listagem de certificações são cacheadas diretamente nas bordas da Cloudflare com bypass automático em atualizações.
- **L2 KV Cache**: Fallback secundário e rápido para evitar consultas recorrentes ao banco D1 sob tráfego massivo.
