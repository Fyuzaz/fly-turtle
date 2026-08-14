# 🐢 WebDoc — The Midnight Bat-Tortoise

<p align="center">
  <img src="assets/logo.jpg" alt="The Midnight Bat-Tortoise Mascot" width="180" style="border-radius: 8px; border: 3px solid #D95D39; box-shadow: 4px 4px 0px #111111;" />
</p>

<p align="center">
  <strong>Editor Web de Documentos Profissional & Web Service de Exportação</strong><br>
  <em>Estética 1970s Underground Comix & Vintage Pulp • Multi-Formatos • Biblioteca de Mídia • Exportação de Alta Fidelidade</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20JS-D95D39?style=for-the-badge&logo=javascript" alt="Frontend" />
  <img src="https://img.shields.io/badge/Editor-CKEditor%205%20Superbuild-6B3E75?style=for-the-badge" alt="CKEditor 5" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%26%20Express-3F5E4D?style=for-the-badge&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/Export-PDF%20%7C%20DOCX%20%7C%20PNG-111111?style=for-the-badge" alt="Export Formats" />
</p>

---

## 📖 Sobre o Projeto

O **WebDoc — The Midnight Bat-Tortoise** é uma plataforma completa e moderna para composição visual e edição profissional de documentos diretamente no navegador (estilo *Canva Docs* / *Microsoft Word*), integrada a um ecossistema de microsserviços para manipulação de mídias e exportação em múltiplos formatos técnicos com fidelidade milimétrica.

Inspirado na estética clássica das publicações *Underground Comix* dos anos 70 (*Heavy Metal*, *Creepy*, Robert Crumb e Bernie Wrightson), o projeto une identidade visual de alto contraste e acabamento de papel envelhecido a recursos avançados de edição web.

---

## ⚡ Principais Funcionalidades

### 📄 Editor de Documentos & Formatos
- **Múltiplos Formatos de Folha Pré-definidos**: A3, A4, A5, A6, B4, B5, Letter, Legal, Tabloid e Ofício.
- **Tamanhos Personalizados Sob Demanda**: Crie e salve formatos personalizados com suporte a unidades em **mm**, **cm**, **in** e **px**, persistidos no armazenamento local.
- **Orientação com 1 Clique**: Alterne instantaneamente entre modo **Retrato** (*Portrait*) e **Paisagem** (*Landscape*).
- **Barra de Ferramentas Completa**: Títulos estilizados, tipografia nobre (*Merriweather*, *Bangers*, *Special Elite*), cores, alinhamentos, listas, marcadores, tabelas e citações.
- **Auto-Save & Estatísticas**: Salvamento automático no `localStorage` a cada alteração e contagem em tempo real de palavras e caracteres.

### 🖼️ Manipulação Avançada de Mídias
- **Confinamento Inteligente na Folha (*Boundary Clamp*)**: Todas as imagens respeitam estritamente as margens do documento, sem nunca transbordar para fora da folha.
- **Redimensionamento Interativo com Mouse (*Drag & Scale*)**: Clique em qualquer imagem para revelar alças nos 4 cantos e arrastar para redimensionar no tamanho exato desejado.
- **Ferramenta de Movimentação (*Move Tool*)**:
  - **📍 Modo Livre (*Canvas / Absolute*)**: Arraste a imagem livremente para qualquer coordenada X/Y da folha.
  - **📄 Modo No Fluxo do Texto (*In-Flow*)**: Arraste para reposicionar a imagem entre parágrafos com linha guia indicadora em tempo real.
  - **▲ Subir / ▼ Descer**: Mova blocos rapidamente pelo documento.
  - **⤉ Frente / ⤈ Trás (*Z-Index Layering*)**: Ajuste a profundidade das camadas sobrepostas.
  - **Alinhamentos Rápidos**: Esquerda com texto fluindo ao lado, Centralizado, Direita, 50% e 100% da largura.

### 🗂️ Biblioteca de Mídia Integrada (Gaveta Lateral)
- Gerenciamento completo de **pastas locais no servidor** (Criar, Renomear, Excluir).
- **Upload Inteligente** por clique, botão dedicado ou **arrastar e soltar (*Drag & Drop*)**.
- Grid responsivo de miniaturas com busca em tempo real.
- Inserção direta de imagens e vídeos no documento com 1 clique.

### 📤 Motor de Exportação Técnica de Alta Fidelidade
| Formato | Motor | Características |
|---|---|---|
| **📄 PDF** | Node.js + Puppeteer (Chromium Headless) | Renderização com dimensões exatas de página, tipografia e estilo gráfico preservados |
| **📝 DOCX** | Python (FastAPI + Pandoc) & Fallback Office | Arquivo editável compatível com Microsoft Word e LibreOffice |
| **🖼️ PNG** | Node.js + Puppeteer | Captura em alta resolução (Retina Scale) do documento completo |

---

## 🎨 Identidade Visual — "The Midnight Bat-Tortoise"

| Elemento | Especificação | Cor Hex |
|---|---|---|
| **Ink Black** | Contornos grossos estilo nanquim, hachuras e sombras | `#111111` |
| **Aged Paper** | Fundo de papel envelhecido e folha com textura sutil | `#F3E9D2` / `#FFFDF5` |
| **Burnt Orange** | Destaques em couro, botões principais e alças interativas | `#D95D39` |
| **Deep Moss Green** | Detalhes orgânicos e botão de exportação PNG | `#3F5E4D` |
| **Psychedelic Purple** | Membranas e botão de exportação DOCX | `#6B3E75` |

---

## 🏗️ Estrutura do Projeto

```
websitemodel/
├── assets/                     # Identidade visual e mascote
│   └── logo.jpg
├── css/                        # Estilos modulares
│   ├── theme.css               # Design System, tokens e paleta 1970s Comix
│   ├── editor.css              # Layout da folha, workspace e alças interativas
│   └── media-library.css       # Gaveta lateral de mídia
├── js/                         # Lógica do Frontend
│   ├── page-formats.js         # Sistema de formatos de página e conversões
│   ├── media-library.js        # Gerenciador da gaveta e uploads
│   ├── upload-adapter.js       # Adaptador de upload customizado para CKEditor
│   ├── image-resizer.js        # Motor de Drag & Scale, Move Tool e Camadas
│   ├── export.js               # Gerenciador de downloads e exportações
│   └── editor.js               # Inicialização e auto-save do CKEditor 5
├── media-library/              # Pastas físicas de mídia no servidor
│   ├── Imagens/
│   ├── Vídeos/
│   └── Logos/
├── backend/
│   ├── node-service/           # Serviço Node.js (Frontend, PDF, PNG e Mídia)
│   │   ├── package.json
│   │   └── server.js
│   └── python-service/         # Serviço Python (DOCX via Pandoc)
│       ├── requirements.txt
│       └── main.py
├── index.html                  # Interface principal do aplicativo
├── .gitignore                  # Proteção de credenciais, uploads e dependências
└── README.md                   # Documentação do projeto
```

---

## 🚀 Como Executar Localmente

### 📋 Pré-requisitos
- **[Node.js](https://nodejs.org)** (v18 ou superior)
- **[Python](https://python.org)** (v3.10 ou superior — opcional para DOCX via Pandoc)
- **[Pandoc](https://pandoc.org)** (opcional para compilação DOCX avançada)

---

### 1. Iniciar o Servidor Principal (Node.js)

O servidor Node.js centraliza o **Frontend**, o **Serviço de Exportação PDF/PNG** e a **Biblioteca de Mídia**:

```bash
# 1. Acesse a pasta do serviço Node
cd backend/node-service

# 2. Instale as dependências (baixa o Chromium headless automaticamente)
npm install

# 3. Inicie o servidor
node server.js
```

> 🌐 **Acesse no seu navegador:** **[http://localhost:3000](http://localhost:3000)**

---

### 2. Iniciar o Serviço DOCX (Python — Opcional)

Caso queira utilizar o compilador avançado de DOCX via Pandoc:

```bash
# 1. Acesse a pasta do serviço Python
cd backend/python-service

# 2. Instale as dependências
pip install -r requirements.txt

# 3. Inicie o microserviço
uvicorn main:app --port 8000 --reload
```

> 💡 *Nota:* Se o serviço Python não estiver ativo, o WebDoc utiliza automaticamente o gerador nativo integrado de documentos Word sem interromper sua exportação.

---

## 🛠️ Endpoints da API Local

### 🟢 Node.js (`http://localhost:3000`)
- `GET  /` ➔ Interface Web do Editor
- `GET  /api/media/folders` ➔ Lista pastas da biblioteca
- `POST /api/media/folder` ➔ Cria nova pasta
- `PATCH /api/media/folder` ➔ Renomeia pasta existente
- `DELETE /api/media/folder` ➔ Exclui pasta
- `GET  /api/media/files?folder=Nome` ➔ Lista arquivos de uma pasta
- `POST /api/media/upload` ➔ Upload multipart de arquivos
- `DELETE /api/media/file` ➔ Exclui arquivo do servidor
- `POST /api/export/pdf` ➔ Renderiza e compila PDF via Puppeteer
- `POST /api/export/img` ➔ Renderiza e captura PNG em alta resolução

### 🔵 Python (`http://localhost:8000`)
- `POST /api/export/docx` ➔ Converte HTML para DOCX via Pandoc
- `GET  /health` ➔ Status do serviço e versão do Pandoc
- `GET  /docs` ➔ Documentação interativa Swagger UI

---

## 🔒 Segurança e Privacidade

- O arquivo [`.gitignore`](.gitignore) está configurado para **bloquear** o envio de mídias pessoais (`media-library/`), variáveis de ambiente (`.env`), cache de navegadores e dependências pesadas (`node_modules/`, `venv/`).
- Sanitização rigorosa de entradas HTML com **DOMPurify** contra vulnerabilidades XSS.

---

## 📜 Licença

Desenvolvido para fins educacionais e profissionais. Sinta-se livre para clonar, modificar e expandir!
