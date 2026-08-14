# WebDoc — Editor de Documentos

Plataforma web para composição profissional de documentos com exportação em múltiplos formatos.

## Estrutura do Projeto

```
websitemodel/
├── index.html                  ← Abrir no navegador
├── css/
│   ├── theme.css               ← Design system (tokens, dark mode)
│   ├── editor.css              ← Layout do editor e folha de página
│   └── media-library.css       ← Gaveta de mídia
├── js/
│   ├── page-formats.js         ← Sistema de formatos de página
│   ├── media-library.js        ← Biblioteca de mídia (gaveta lateral)
│   ├── upload-adapter.js       ← Upload adapter do CKEditor
│   ├── export.js               ← Motor de exportação
│   └── editor.js               ← Configuração do CKEditor 5
├── media-library/              ← Biblioteca de mídia local (criada automaticamente)
│   ├── Imagens/
│   ├── Vídeos/
│   └── Logos/
└── backend/
    ├── node-service/           ← Exportação PDF/PNG + API da biblioteca
    │   ├── package.json
    │   └── server.js
    └── python-service/         ← Exportação DOCX
        ├── requirements.txt
        └── main.py
```

---

## Pré-requisitos

| Software | Versão mínima | Download |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.10+ | https://python.org |
| Pandoc | 3.0+ | https://pandoc.org/installing.html |

---

## Como iniciar

### 1. Frontend (sem servidor)

Abra `index.html` diretamente no navegador. O editor funciona sem backend, usando armazenamento local (auto-save no `localStorage`). A exportação e a biblioteca de mídia requerem os serviços abaixo.

### 2. Serviço Node.js (PDF + PNG + Biblioteca de Mídia)

```powershell
cd backend/node-service
npm install        # Instala dependências (baixa Chromium ~300MB na 1ª vez)
node server.js     # Inicia na porta 3000
```

> Acesse: http://localhost:3000

### 3. Serviço Python (DOCX)

```powershell
cd backend/python-service
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

> Acesse: http://localhost:8000
> Documentação da API: http://localhost:8000/docs

---

## Funcionalidades

### Editor
- ✅ CKEditor 5 (Decoupled Document Editor — estilo Word/Google Docs)
- ✅ Toolbar completa: headings, fontes, cores, alinhamento, listas, tabelas, imagens, links
- ✅ Auto-save automático no `localStorage` (a cada 2 segundos sem digitação)
- ✅ Contagem de palavras e caracteres em tempo real

### Formatos de Página
- ✅ A3, A4, A5, A6, B4, B5, Letter, Legal, Tabloid, Ofício
- ✅ Orientação Retrato / Paisagem com um clique
- ✅ Tamanho personalizado com seletor de unidade (mm / cm / in / px)
- ✅ Salvar formatos personalizados com nome (persistidos no `localStorage`)

### Exportação
| Formato | Serviço | Porta |
|---|---|---|
| PDF | Node.js + Puppeteer (Chromium headless) | 3000 |
| DOCX | Python + FastAPI + Pandoc | 8000 |
| PNG | Node.js + Puppeteer (screenshot) | 3000 |

### Biblioteca de Mídia (Gaveta)
- ✅ Criar, renomear e excluir pastas
- ✅ Upload por clique ou drag & drop
- ✅ Grid de thumbnails com preview
- ✅ Busca por nome em tempo real
- ✅ Inserir imagem/vídeo diretamente no documento
- ✅ Pastas padrão: Imagens, Vídeos, Logos

---

## Portas e Endpoints

### Node.js (porta 3000)

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/export/pdf` | Gera PDF |
| POST | `/api/export/img` | Gera PNG |
| GET  | `/api/media/folders` | Lista pastas |
| POST | `/api/media/folder` | Cria pasta |
| PATCH | `/api/media/folder` | Renomeia pasta |
| DELETE | `/api/media/folder` | Exclui pasta |
| GET  | `/api/media/files?folder=X` | Lista arquivos |
| POST | `/api/media/upload` | Upload de arquivo |
| DELETE | `/api/media/file` | Exclui arquivo |

### Python (porta 8000)

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/export/docx` | Gera DOCX |
| GET  | `/health` | Status do serviço |
| GET  | `/docs` | Swagger UI |

---

## Payload de Exportação

```json
{
  "html": "<p>Conteúdo do documento...</p>",
  "pageWidth": 210,
  "pageHeight": 297,
  "landscape": false,
  "formatName": "A4",
  "docName": "Meu Documento"
}
```
