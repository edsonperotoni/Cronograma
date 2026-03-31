# 📚 Cronograma de Estudos

Sistema web leve e funcional para organização de estudos, com suporte a múltiplas matérias, edição de texto rico (Rich Text) e armazenamento local.

## 🚀 Funcionalidades

- **Múltiplas Matérias:** Crie e gerencie cronogramas separados para cada disciplina.
- **Edição Rica:** Coluna de observações com CKEditor 5 (Negrito, Listas, Links).
- **Atalho de Produtividade:** `Ctrl + S` para salvar rapidamente sem tirar as mãos do teclado.
- **Backup Inteligente:** Exporte seus dados em JSON e importe em qualquer outro navegador.
- **Modo Impressão:** Layout otimizado para gerar PDFs ou imprimir seu cronograma.
- **Privacidade:** Todos os dados são salvos localmente no seu navegador (`LocalStorage`).

## 🛠️ Tecnologias Utilizadas

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
