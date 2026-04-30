# 📚 Cronograma de Matérias v3.5.0 🚀

Uma aplicação full-stack de alta performance para organização de rotinas de estudo, integrando Inteligência Artificial e sincronização em nuvem.

---

## 🎨 Interface e Experiência do Usuário (UX)
* **Layout Responsivo:** Desenvolvido com **Bootstrap 5**, garantindo adaptação total para dispositivos móveis e desktop.
* **Modo Impressão:** Otimização via CSS `@media print` para formato A4 (paisagem), removendo controles de interface para um documento limpo e profissional.
* **Assistente Mobile:** Detector inteligente de orientação que sugere o modo paisagem para melhor visualização da tabela em telas pequenas.
* **Edição Rica:** Integração com **CKEditor 5** para anotações detalhadas com formatação avançada, links e listas.

## 🚀 Funcionalidades Principais

### 🤖 Inteligência Artificial & OCR
* **Engine Gemini 2.0 Flash:** Processamento de documentos via **Google GenAI SDK** para geração automática de cronogramas.
* **Processamento Multimodal:** Suporte para extração de dados de **PDF (limite de 5 páginas), Word, Excel, CSV** e **Imagens (OCR nativo da IA)**.
* **Tradutor de Formatos:** Backend especializado que converte arquivos binários em Markdown para garantir precisão cirúrgica na interpretação da IA.

### 🛡️ Resiliência e Segurança de Dados (Cloud Hybrid)
* **Persistência Local:** Prioridade para **LocalStorage API**, mantendo a velocidade de acesso e privacidade offline.
* **Sincronização Firestore:** Backup automático do estado da aplicação no **Google Firebase**, permitindo restaurar o progresso em múltiplos dispositivos de forma transparente.
* **Backup no Google Drive:** Integração oficial com a API do Google Drive para exportação e importação de arquivos JSON de backup.
* **Validação de Identidade Cruzada:** Sistema de segurança robusto que vincula a **Chave de Contribuinte** ao e-mail autenticado do Google, impedindo acessos não autorizados aos dados na nuvem.
* **Snapshot de Emergência:** Ponto de restauração automático gerado antes de cada importação de IA (o "Botão de Pânico").

## 🛠️ Tecnologias Utilizadas

### Frontend
* **Core:** HTML5, CSS3, JavaScript (ES6+).
* **Framework:** Bootstrap 5.3 + Bootstrap Icons.
* **Integração:** Google Identity Services (OAuth2).

### Backend (Cloud Native)
* **Linguagem:** Python 3.11+.
* **Framework:** FastAPI + Uvicorn (Arquitetura assíncrona).
* **Banco de Dados:** Google Firestore (NoSQL).
* **Hospedagem:** Google Cloud Run (Serverless).
* **Bibliotecas:** Pandas, BeautifulSoup4, PyPDF2, python-docx, Google GenAI.

## 📦 Estrutura do Projeto

```text
├── index.html          # Interface principal e lógica JS
├── main.py             # Backend Python (API de Processamento IA)
├── prompt_template.txt # O "Cérebro" da IA (Instruções do sistema)
├── ckeditor5/          # Editor de texto rico
└── image/              # Ativos visuais (Logotipos e SVGs)
```
## 📜 Licença e Direitos

* **Copyright (c) 2026, Edson Perotoni.**
* **Copyright (c) 2026, Raquel Subtil Perotoni.**

Este projeto é destinado a uso pessoal e educacional.
* **Atribuição:** Os créditos ao autor original devem ser obrigatoriamente mantidos.
* **Uso Não Comercial:** Proibida a comercialização ou integração em produtos pagos sem autorização.
* **Compartilhamento:** Obras derivadas devem ser distribuídas sob a mesma licença.

---
*Criado para otimizar a produtividade e organização acadêmica.*

**Criado com a ajuda do Google Gemini*
