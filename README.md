# 📚 Cronograma de Estudos

Sistema web leve e funcional para organização de estudos, com suporte a múltiplas matérias, edição de texto rico (Rich Text), armazenamento local e personalizações.

## 🚀 Funcionalidades

### 📚 Gestão de Matérias
* **Múltiplas Matérias:** Crie, renomeie e gerencie cronogramas independentes para diferentes disciplinas em uma única interface.
* **Alternância Rápida:** Troque de matéria instantaneamente através do menu de seleção; o sistema lembra qual foi a última matéria acessada.

### ✍️ Edição e Personalização
* **Edição Rica (CKEditor 5):** Coluna de observações com suporte a negrito, itálico, sublinhado, cores de texto, listas numeradas/marcadores e links.
* **Colunas Personalizáveis:** Renomeie os cabeçalhos das colunas diretamente na tabela (ex: mude "Teoria" para "Vídeo" ou "Revisão").
* **Visibilidade Seletiva:** Oculte colunas que você não utiliza através do painel de preferências para manter a interface limpa e focada.

### 🤖 Automação e Produtividade
* **Cálculo Inteligente de Datas:** Ao adicionar um novo conteúdo, o sistema sugere automaticamente a próxima data com base no intervalo de dias configurado (ex: a cada 7 dias a partir do último conteúdo).
* **Atalhos de Teclado:** Use `Ctrl + S` para salvar todas as alterações instantaneamente sem tirar as mãos do teclado.
* **Auto-Save de Segurança:** Sistema de salvamento automático a cada 5 minutos caso haja alterações pendentes.
* **Prevenção de Perda:** Alerta visual (botão piscante) e aviso nativo do navegador caso você tente fechar a página sem salvar.

### 💾 Dados e Portabilidade
* **Privacidade Total (LocalStorage):** Seus dados nunca saem do seu computador. Tudo é salvo localmente no seu navegador.
* **Backup e Restauração:** Exporte todo o seu progresso em um arquivo `.json` e restaure-o em qualquer outro navegador ou computador.
* **Mesclagem Inteligente:** Ao importar um backup, escolha entre *Substituir tudo* ou *Mesclar* apenas os dados novos aos existentes.

### 📄 Saída e Layout
* **Modo Impressão Otimizado:** Layout inteligente que oculta botões de controle e ajusta a tabela perfeitamente para papel A4 (paisagem) ou geração de PDF.
* **Design Moderno:** Interface limpa baseada em **Bootstrap 5**, otimizada para legibilidade e organização visual.

## 🛠️ ![Tecnologias](https://img.shields.io/badge/Tecnologias-JS_ES6_%7C_Bootstrap_5_%7C_CKEditor_5-0d6efd)

- **HTML5 / CSS3** (Custom Properties & Flexbox)
- **Bootstrap 5** (Layout Responsivo)
- **Bootstrap Icons** (Interface Visual)
- **CKEditor 5** (Edição de Observações)
- **JavaScript Vanilla** (Lógica e Persistência)

## 📦 Como usar

Para garantir o funcionamento pleno de todas as ferramentas (especialmente o editor de texto rico), siga as orientações abaixo:

1.  **Hospedagem (Web):**
    * Ao publicar no **GitHub Pages**, **Vercel** ou **Netlify**, certifique-se de enviar a pasta completa do projeto. 
    * **Importante:** O arquivo `index.html` depende da pasta `ckeditor5/` e da pasta `image/` no mesmo diretório para carregar os scripts e ícones.

2.  **Uso Local (Computador):**
    * Devido às políticas de segurança dos navegadores para módulos JavaScript (`ES Modules`), este projeto **não funciona** sendo aberto diretamente pelo arquivo (duplo clique no `index.html`).
    * **Recomendação:** Utilize uma extensão de servidor local, como o **Live Server** do VS Code, para rodar o projeto em um endereço `http://localhost`.

3.  **Persistência e Backup:**
    * **Armazenamento:** Seus dados são salvos automaticamente no seu navegador através da tecnologia `LocalStorage`.
    * **Segurança:** Limpezas de cache do navegador podem apagar seus dados. Por isso, utilize o ícone de **Ferramentas (engrenagem)** para exportar um backup em arquivo `.json` periodicamente.
---

## ⚖️ Copyright e Licença

**Copyright (c) 2026, Edson Perotoni.**

Este projeto é de uso pessoal e educacional. A redistribuição do código é permitida desde que os créditos ao autor original sejam mantidos. O uso comercial é proibido sem autorização prévia.

*Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.*

**Criado com a ajuda do Google Gemini*
