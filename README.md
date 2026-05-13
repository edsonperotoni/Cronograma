# 📚 Cronograma de Matérias v4.0.1 🚀

Uma aplicação full-stack de alta performance para organização de rotinas de estudo, integrando **Inteligência Artificial de última geração** e **sincronização híbrida em nuvem**.

---

## 🎨 Interface e Experiência do Usuário (UX)
* **Arquitetura Modular:** Separação estrita de preocupações com arquivos independentes para HTML, CSS e Lógica JS, otimizando o carregamento e manutenção.
* **Layout Responsivo:** Desenvolvido com **Bootstrap 5**, garantindo adaptação total para dispositivos móveis e desktop.
* **Modo Impressão:** Otimização via CSS `@media print` para formato A4 (paisagem), removendo controles de interface para um documento limpo e profissional.
* **Assistente Mobile:** Detector inteligente de orientação que sugere o modo paisagem para melhor visualização da tabela em telas pequenas.
* **Edição Rica:** Integração com **CKEditor 5** para anotações detalhadas com formatação avançada, links e listas de tarefas.

## 🚀 Funcionalidades Principais

### 🤖 Inteligência Artificial & OCR
* **Engine Gemini 2.5 Flash:** Processamento ultra-rápido de documentos via **Google GenAI SDK** para geração automática de cronogramas.
* **Processamento Multimodal:** Suporte para extração de dados de **PDF (limite de 5 páginas), Word, Excel, CSV** e **Imagens (OCR nativo da IA)**.
* **Mapeamento por UID:** Sistema de identidade única para cada tópico de estudo, permitindo mesclagens inteligentes e evitando duplicatas durante importações.

### 🛡️ Sincronização Híbrida (Real-Time Cloud)
* **Monitoramento em Background:** Mecanismo de *polling* leve que detecta alterações feitas em outros dispositivos em tempo real, alertando o usuário sem necessidade de recarregar a página.
* **Integridade por Hash (SHA-1):** Verificação de consistência baseada no conteúdo real dos dados, garantindo que a sincronia ocorra apenas quando houver mudanças efetivas.
* **Sincronização Firestore:** Backup atômico do estado da aplicação no **Google Firebase (Região: São Paulo)**.
* **Google Drive Integration:** Exportação e importação oficial de arquivos JSON via API OAuth2 para segurança extra.
* **Snapshot de Emergência:** Ponto de restauração automático (Botão de Pânico) gerado antes de qualquer operação crítica.

## 🛠️ Tecnologias Utilizadas

### Frontend
* **Core:** HTML5, CSS3, JavaScript (Módulos ES6+).
* **Framework:** Bootstrap 5.3 + Bootstrap Icons.
* **Rich Text:** CKEditor 5 (Custom Build).

### Backend (Cloud Native)
* **Linguagem:** Python 3.11+.
* **Framework:** FastAPI + Uvicorn (Arquitetura assíncrona).
* **Banco de Dados:** Google Firestore.
* **Hospedagem:** Google Cloud Run (Serverless) para backend e GitHub Pages para frontend.

## 📦 Estrutura do Projeto
```text
├── index.html          # Estrutura e interface principal
├── script.js           # Lógica de negócio e comunicação Cloud (v4.0.0)
├── style.css           # Estilização e regras de impressão
├── main.py             # Backend Python (API de Processamento e Sync)
├── prompt_template.txt # Instruções de sistema para a IA
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

**Desenvolvido em parceria com Gemini AI*
