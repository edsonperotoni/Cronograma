# 📚 Cronograma de Matérias v2.8.4 — AI Edition 🚀

Uma aplicação **Full Stack** projetada para organização robusta e inteligente de rotinas de estudo. O projeto evoluiu de uma ferramenta estática para um ecossistema completo com processamento de documentos via IA e armazenamento resiliente.

---

## 🎨 Interface e Experiência do Usuário (UX)
* **Layout Responsivo:** Desenvolvido com **Bootstrap 5**, garantindo adaptação total para dispositivos móveis e desktop.
* **Modo Impressão:** Otimização via CSS `@media print` para formato A4 (paisagem), removendo botões de controle e ajustando o layout para papel ou PDF.
* **Bloqueio de Estado Inteligente:** A interface desabilita controles de edição automaticamente quando nenhuma matéria está selecionada, prevenindo erros de gravação.
* **Assistente Mobile:** Ícone animado que detecta a necessidade de rolagem lateral e sugere o modo paisagem em dispositivos móveis.
* **Cabeçalhos Dinâmicos:** Renomeie as colunas (Teoria, Exercícios, etc.) diretamente na tabela ou através do painel de preferências.
* **Visibilidade Seletiva:** Oculte colunas que você não utiliza para manter a interface limpa e focada no que importa.

## 🚀 Funcionalidades Principais

### 🤖 Inteligência Artificial & OCR
* **Importação Multi-formato:** Suporte nativo para extração de dados via IA de arquivos **PDF, Word (.docx), Excel (.xlsx, .xls), CSV ** e **Imagens (JPG/PNG)**.
* **Engine Gemini 2.0 Flash:** Processamento ultrarrápido de documentos para geração automática de cronogramas.
* **Edição Rica com CKEditor 5:** A coluna de observações utiliza o CKEditor para permitir formatação avançada (negrito, cores, listas e links).
* **Cálculo Automático de Próxima Data:** Sugestão inteligente de datas baseada em intervalos configuráveis (ex: 7 dias), automatizando o planejamento.
* **Backend Python (FastAPI):** Tradutor binário que converte planilhas complexas em Markdown para leitura precisa da IA.

### 🛡️ Resiliência e Segurança de Dados
* **Persistência Local:** Utiliza a **LocalStorage API**. Seus dados permanecem no seu navegador, garantindo privacidade total (os dados não saem do seu PC).
* **Backup em JSON:** Sistema de exportação e importação de banco de dados para evitar perda de informações e permitir portabilidade.

* **Snapshot de Emergência:** O sistema cria um ponto de restauração automático antes de qualquer importação de IA. Se algo der errado, o "Botão de Pânico" restaura tudo em um clique.
* **Merge Inteligente:** Capacidade de renomear e fundir matérias, unindo conteúdos de nomes duplicados sem perder dados.
* **Auto-Save & Proteção:** Salvamento automático a cada 5 minutos e alertas visuais para mudanças pendentes.

## 🛠️ Tecnologias Utilizadas

### Frontend
* **Core:** HTML5, CSS3 e JavaScript (ES6+).
* **Editor:** CKEditor 5 (Rich Text Edition).
* **UI Framework:** Bootstrap 5.3.2 + Bootstrap Icons.

### Backend (IA Service)
* **Linguagem:** Python 3.11+.
* **Framework:** FastAPI + Uvicorn.
* **Processamento:** Pandas (Excel/CSV), python-docx (Word), PyPDF2 (PDF).
* **Modelos:** Google GenAI SDK (Gemini 2.5 Flash).

## 📦 Estrutura do Projeto

```text
├── index.html          # Interface principal e lógica JS
├── main.py             # Backend Python (API de Processamento IA)
├── prompt_template.txt # O "Cérebro" da IA (Instruções do sistema)
├── contribuintes_db.json # Gestão de acesso e cotas de uso
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
