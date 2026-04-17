# 📚 Cronograma de Matérias v2.6.8

Uma aplicação de página única (**SPA**) projetada para organização robusta, intuitiva e personalizável de rotinas de estudo. O projeto foi estruturado com foco educativo, contendo blocos de comentários detalhados sobre o funcionamento interno do HTML, CSS e JavaScript.

---

## 🎨 Interface e Design
* **Paleta de Cores:** Design profissional, utilizando tons de cinza, branco e azul primário para destaque.
* **Layout Responsivo:** Desenvolvido com **Bootstrap 5**, garantindo adaptação total para dispositivos móveis e desktop.
* **Modo Impressão:** Otimização via CSS `@media print` para formato A4 (paisagem), removendo botões de controle e ajustando o layout para papel ou PDF.

## 🚀 Funcionalidades Principais

### 🧠 Gestão Inteligente
* **SPA (Single Page Application):** Toda a navegação e gerenciamento de matérias ocorrem em uma única página, sem recarregamentos.
* **Edição Rica com CKEditor 5:** A coluna de observações utiliza o CKEditor para permitir formatação avançada (negrito, cores, listas e links).
* **Cálculo Automático de Próxima Data:** Sugestão inteligente de datas baseada em intervalos configuráveis (ex: 7 dias), automatizando o planejamento.

### ⚙️ Personalização e Controle
* **Cabeçalhos Dinâmicos:** Renomeie as colunas (Teoria, Exercícios, etc.) diretamente na tabela ou através do painel de preferências.
* **Visibilidade Seletiva:** Oculte colunas que você não utiliza para manter a interface limpa e focada no que importa.
* **Sistema de Modais:** Interações fluidas para criação de novas matérias, configurações de backup e informações do sistema.

### 💾 Segurança e Dados
* **Persistência Local:** Utiliza a **LocalStorage API**. Seus dados permanecem no seu navegador, garantindo privacidade total (os dados não saem do seu PC).
* **Backup em JSON:** Sistema de exportação e importação de banco de dados para evitar perda de informações e permitir portabilidade.
* **Importação Inteligente:** Opções para *Mesclar* dados novos, *Substituir* tudo ou *Selecionar* itens específicos manualmente do arquivo de backup.
* **Auto-Save & Prevenção:** Salvamento automático a cada 5 minutos e alertas visuais (botão piscante) para alterações pendentes.

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5, CSS3 (Custom Properties) e JavaScript (ES6+).
* **Framework CSS:** Bootstrap 5.3.2 + Bootstrap Icons.
* **Editor de Texto:** CKEditor 5 (Custom Module Build).
* **Persistência:** Web Storage API (LocalStorage).
* **Monitoramento:** Integração com contador de acessos via hits.sh.

## 📦 Como Executar

O projeto utiliza **Módulos JavaScript**, o que exige um ambiente de servidor local para o funcionamento pleno de todas as ferramentas.

1.  **Uso Local:** Não abra o arquivo `index.html` diretamente via duplo clique. Utilize uma extensão como o *Live Server* (VS Code) ou um servidor Python (`python -m http.server`).
2.  **Estrutura de Pastas:**
    ```text
    ├── index.html
    ├── ckeditor5/       # Bibliotecas e traduções do editor
    └── image/           # Logotipos e ícones SVG originais
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
