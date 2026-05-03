// --- 📂 VARIÁVEIS GLOBAIS ---
let app_version = "4.0.0";
let activeEditors = {};
let currentMateria = "";
let tempImportData = null;
let hasUnsavedChanges = false;

let tokenClient;
let accessToken = null;

let rowToDelete = null;
let isDeletingFullMateria = false;

let overlayStartTime = 0;
const MIN_OVERLAY_TIME_DEFAULT = 2800; // 2.8 segundos
let MIN_OVERLAY_TIME = MIN_OVERLAY_TIME_DEFAULT;

// Variável global para controlar o resolve da troca
let resolveTrocaUsuario;
let resolveErroSync;
let resolveChaveInvalida;
let resolveRestoreForcado;
let resolveConsentimento;
let promessaConflito = null;

// Substitua a variável let cloudSyncPending por estas funções:
const CloudSync = {
    get isPending() {
        return localStorage.getItem("config_vBorda_cloud_pending") === "true";
    },
    set pending(status) {
        localStorage.setItem("config_vBorda_cloud_pending", status);
    }
};

const PREFIX = "study_vBorda_";
const LIST_KEY = "materias_list_vBorda";
const CONFIG_PREFIX = "config_vBorda_";

const BASE_URL_SYNC = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:8000"
    : "https://cronograma-ia-749297806019.southamerica-east1.run.app";

// Se não estiver no localhost, desativa todos os logs
if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    console.log = function () { };
    console.warn = function () { };
}

// ==========================================
// 🚀 INÍCIO (Ao carregar a página)
// ==========================================
window.onload = () => {
    // --- 🛠️ LÓGICA DE MIGRAÇÃO DE BANCO DE DADOS ---
    const lastVersion = localStorage.getItem("app_version_installed");

    // Se a versão instalada for diferente da atual (ou não existir)
    if (lastVersion !== app_version) {
        console.log(`Migrando banco de dados para a versão ${app_version}...`);

        const list = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
        list.forEach(m => {
            const raw = localStorage.getItem(PREFIX + m);
            if (raw) {
                try {
                    let data = JSON.parse(raw);
                    // Força a geração de UID para cada item que não possui
                    const updated = data.map(item => {
                        item.uid = item.uid || gerarUID(item);
                        return item;
                    });
                    localStorage.setItem(PREFIX + m, JSON.stringify(updated));
                } catch (e) {
                    console.error(`Erro ao migrar matéria ${m}:`, e);
                }
            }
        });

        // Marca que esta versão já foi processada
        localStorage.setItem("app_version_installed", app_version);
        console.log("Migração concluída com sucesso.");
    }
    // ----------------------------------------------

    const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
    if (chave && chave.includes("_key_")) {
        const savedToken = sessionStorage.getItem('google_access_token');
        if (savedToken) {
            accessToken = savedToken;
        }
    }
    verificarBotaoPanico();

    const chaveSalva = localStorage.getItem("config_vBorda_chave_contribuinte") || "";
    document.getElementById('inputChaveAcesso').value = chaveSalva;
    renderizarEmailChave();

    updateSelect();
    const last = localStorage.getItem('last_active');
    if (last) {
        switchMateria(last);
    }
    else {
        const tableBody = document.getElementById('tableBody');
        tableBody.innerHTML = setInitialTableContent();
        currentMateria = "";
    }
    checkInterfaceState();

    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        const urlContador = "https://hits.sh/edsonperotoni.github.io/Cronograma.svg?color=0d6efd&label=acessos";
        const htmlContador = `<img src="${urlContador}" alt="Contador de Acessos" />`;
        const containers = document.querySelectorAll('#contador-container');
        containers.forEach(div => div.innerHTML = htmlContador);
    }


    //firestore (nuvem)
    inicializarSincronia();

    // INICIAR MONITORAMENTO EM BACKGROUND de alterações dos dados na nuvem por outro dispositivo
    iniciarMonitoramentoRemoto();

    const label_app_version = document.getElementById("app-version");
    label_app_version.innerText = app_version;

    if (localStorage.getItem("config_vBorda_chave_contribuinte")) {
        if (CloudSync.isPending) {
            console.log("⚠️ Detectada pendência de sincronia de uma sessão anterior.");
            setUnsavedChanges(true); // Já deixa o botão de salvar em alerta
        }
    }
};

const btnSalvar = document.getElementById('btnSalvarTudo');
if (btnSalvar) {
    btnSalvar.addEventListener('click', async () => {
        // O safeWrapper evita cliques duplos durante o processamento
        await safeWrapper(async () => {
            await executarFluxoSalvamentoCompleto();
        });
    });
}

async function confirmarRestauracaoForcadaNuvem() {
    // Só permite se houver uma chave
    const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
    if (!chave || !chave.includes("_key_")) {
        exibirAlerta("Você precisa ter uma chave de contribuinte válida para restaurar da nuvem.", "warning");
        return;
    }

    document.getElementById('modalConfirmarRestoreNuvem').style.display = 'flex';
    return new Promise((resolve) => {
        resolveRestoreForcado = resolve;
    }).then(async (confirmado) => {
        if (confirmado) {
            await criarSnapshotEmergencial();
            await executarDownloadForcadoFirestore();
        }
    });
}

function fecharModalRestoreForcado(confirmado) {
    document.getElementById('modalConfirmarRestoreNuvem').style.display = 'none';
    if (resolveRestoreForcado) resolveRestoreForcado(confirmado);
}

async function executarDownloadForcadoFirestore() {
    const chave = localStorage.getItem("config_vBorda_chave_contribuinte");

    closeModals(); // Fecha o modal de config
    mostrarOverlay("Buscando sua última versão na nuvem...");

    try {
        const response = await fetch(`${BASE_URL_SYNC}/nuvem/restore`, {
            headers: { "authorization": chave }
        });

        if (!response.ok) throw new Error("Não foi possível conectar ao servidor.");

        const res = await response.json();

        if (res.status === "success" && res.data) {
            // A função processarRestauracaoTotal já injeta os dados e dá o Reload
            processarRestauracaoTotal(res.data);
        } else {
            exibirAlerta("Nenhum dado encontrado na nuvem para esta conta.", "warning");
            esconderOverlay();
        }
    } catch (e) {
        console.error(e);
        exibirAlerta("Erro ao restaurar: " + e.message, "danger");
        esconderOverlay();
    }
}

async function confirmarChaveInvalidaModal() {
    document.getElementById('modalChaveInvalida').style.display = 'flex';
    return new Promise((resolve) => {
        resolveChaveInvalida = resolve;
    });
}

function fecharModalChaveInvalida(confirmado) {
    document.getElementById('modalChaveInvalida').style.display = 'none';

    // Se o usuário clicou em "Sair e Modo Local" (confirmado === true)
    if (confirmado) {
        const input = document.getElementById('inputChaveAcesso');
        if (input) {
            input.value = ""; // Limpa o campo visualmente
            input.classList.remove('is-invalid', 'is-valid'); // Limpa os estados de erro/sucesso do Bootstrap
        }
    }

    // Resolve a promessa para que o fluxo do saveChaveContribuinte continue
    if (resolveChaveInvalida) resolveChaveInvalida(confirmado);
}

async function confirmarErroSyncModal() {
    document.getElementById('modalErroSyncSair').style.display = 'flex';
    return new Promise((resolve) => {
        resolveErroSync = resolve;
    });
}

function fecharModalErroSync(confirmado) {
    document.getElementById('modalErroSyncSair').style.display = 'none';
    if (resolveErroSync) resolveErroSync(confirmado);
}

async function confirmarTrocaModal(nomeUsuario, temPendencia, tipo = 'troca') {
    const modal = document.getElementById('modalTrocaUsuario');
    const titulo = document.getElementById('tituloModalTroca');
    const msg = document.getElementById('msgPrincipalTroca');
    const textoAviso = document.getElementById('textoAvisoTroca');
    const avisoPendencia = document.getElementById('avisoSincroniaPendente');
    const footerSimples = document.getElementById('footerTrocaSimples');
    const footerConflito = document.getElementById('footerConflitoInicial');

    document.getElementById('nomeNovoUsuario').innerText = nomeUsuario;
    avisoPendencia.style.display = temPendencia ? 'block' : 'none';

    if (tipo === 'conflito_inicial') {
        titulo.innerHTML = '<i class="bi bi-cloud-arrow-down-fill me-2"></i>Dados Encontrados na Nuvem';
        msg.innerHTML = `Olá <strong>${nomeUsuario}</strong>, identificamos que você já possui dados salvos na nuvem.`;
        textoAviso.innerText = "Você deseja manter os dados que estão neste computador ou baixar o que está salvo na sua conta?";
        footerSimples.classList.add('d-none');
        footerConflito.classList.remove('d-none');
    } else {
        titulo.innerHTML = '<i class="bi bi-person-exclamation me-2"></i>Troca de Contribuinte';
        msg.innerHTML = `Você está prestes a alternar para a conta de: <br><strong class="fs-5">${nomeUsuario}</strong>`;
        textoAviso.innerText = "Isso removerá as matérias locais atuais para carregar o progresso da nova conta.";
        footerSimples.classList.remove('d-none');
        footerConflito.classList.add('d-none');
    }

    modal.style.display = 'flex';

    return new Promise((resolve) => {
        resolveTrocaUsuario = resolve;
    });
}

function fecharModalTroca(confirmado) {
    document.getElementById('modalTrocaUsuario').style.display = 'none';
    if (resolveTrocaUsuario) resolveTrocaUsuario(confirmado);
}

// Orquestra o salvamento local e a subida para a nuvem
async function executarFluxoSalvamentoCompleto() {
    try {
        // 1. O saveAllRows já cuida de destruir editores e gravar no LocalStorage
        await saveAllRows();

        // 2. Só tentamos a nuvem se houver algo para salvar e a chave estiver lá
        const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
        if (chave && chave.includes("_key_")) {
            await persistirSnapshotTotal();
        }
    } catch (err) {
        console.error("❌ Falha no fluxo de salvamento:", err);
        exibirAlerta("Erro ao salvar dados.", "danger");
    }
}

function resolverConflitoNuvem(opcao) {
    document.getElementById('modalConflitoSincronia').style.display = 'none';
    if (promessaConflito) promessaConflito(opcao);
}

async function processarSincroniaDivergente(data) {
    const metada = data.metadata;
    // Exibe o modal que criamos no passo anterior
    document.getElementById('dataConflitoNuvem').innerText = new Date(metada.ultima_sinc).toLocaleString();
    document.getElementById('modalConflitoSincronia').style.display = 'flex';

    // Aguarda a promessa de escolha do usuário (merge ou replace)
    const escolha = await new Promise(resolve => { promessaConflito = resolve; });
    tempImportData = data.payload;
    if (escolha === 'pick') {
        // Reaproveita sua função de escolha manual!
        prepararEscolhaImport();

        // IMPORTANTE: Para alinhar o timestamp após a escolha manual,
        // precisaremos injetar uma lógica no final do seu processo de importação manual.
        window.sincroniaPendenteAposEscolha = metada.ultima_sinc;
    } else {
        // Executa o processo automático (Merge ou Replace)
        await confirmImport(escolha, true);
        localStorage.setItem("last_local_save_time", metada.ultima_sinc);
        dispararAlertaReload("Sincronização concluída!", 1);
    }
}

// Monitora o checkbox para liberar o botão
document.addEventListener('change', (e) => {
    if (e.target.id === 'checkAceitoTermos') {
        document.getElementById('btnConfirmarConsentimento').disabled = !e.target.checked;
    }
});

// Listener para disparar a troca ao apertar ENTER no campo de chave
document.getElementById('inputChaveAcesso').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); // Impede o comportamento padrão do navegador
        await saveChaveContribuinte();
    }
});

async function confirmarConsentimentoModal() {
    const modal = document.getElementById('modalConsentimentoNuvem');
    const checkbox = document.getElementById('checkAceitoTermos');
    const btn = document.getElementById('btnConfirmarConsentimento');

    // Reseta o estado inicial
    checkbox.checked = false;
    btn.disabled = true;
    modal.style.display = 'flex';

    return new Promise((resolve) => {
        resolveConsentimento = resolve;
    });
}

function fecharModalConsentimento(aceito) {
    document.getElementById('modalConsentimentoNuvem').style.display = 'none';
    if (resolveConsentimento) resolveConsentimento(aceito);
}

document.querySelector('#tableBody').addEventListener('click', function (e) {
    // 1. Filtro de alvo: checkbox dentro da coluna de observações
    if (e.target.type === 'checkbox' && e.target.closest('.col-data-obs')) {
        const tr = e.target.closest('tr');
        const rowId = tr.id;
        const li = e.target.closest('li');
        const indexInDom = li ? li.getAttribute('data-list-item-id') : null;

        if (!indexInDom || isProcessingUI) {
            // Se estiver processando (ex: salvando), impede a interação
            if (isProcessingUI) e.preventDefault();
            return;
        }

        // 2. Localiza o registro no LocalStorage
        const dadosLocais = JSON.parse(localStorage.getItem(PREFIX + currentMateria) || "[]");
        // Remove 'row_' para comparar com o uid puro do JSON
        const cleanId = rowId.replace('row_', '');
        const itemIdx = dadosLocais.findIndex(item => item.uid === cleanId || item.uid === rowId);

        if (itemIdx !== -1) {
            const estaMarcado = e.target.checked;
            const vObs = tr.querySelector('.view-obs');
            let htmlAtual = vObs.innerHTML;

            // 3. Atualiza a string HTML via Regex (Injeta ou remove o checked="checked")
            const regexCheck = new RegExp(`(<li[^>]*data-list-item-id="${indexInDom}"[^>]*>.*?<input[^>]*?)(/?>)`, 's');
            let novoHtml = estaMarcado
                ? htmlAtual.replace(regexCheck, (m, p1, p2) => p1.includes('checked') ? m : p1 + ' checked="checked"' + p2)
                : htmlAtual.replace(new RegExp(`(<li[^>]*data-list-item-id="${indexInDom}"[^>]*>.*?<input[^>]*?)checked="checked"`, 's'), '$1');

            // 4. SINCRONIA TOTAL DO DOM
            // Atualiza a div de visualização (o que o saveData() lê se o editor estiver fechado)
            vObs.innerHTML = novoHtml;

            // Se o CKEditor estiver instanciado para esta linha, precisamos atualizar o dado interno dele
            if (activeEditors[rowId]) {
                activeEditors[rowId].setData(novoHtml);
            } else {
                // Se o editor não estiver ativo, atualizamos apenas a div oculta de backup
                const editorDiv = tr.querySelector('.val-obs-editor');
                if (editorDiv) editorDiv.innerHTML = novoHtml;
            }

            // 5. PERSISTÊNCIA NO STORAGE
            dadosLocais[itemIdx].obs = novoHtml;
            localStorage.setItem(PREFIX + currentMateria, JSON.stringify(dadosLocais));

            // 6. NOTIFICAÇÃO DE ALTERAÇÃO
            setUnsavedChanges(true);
        }
    }
});

let isProcessingUI = false; // Semáforo global

// Adicione esta chamada no seu fluxo de inicialização
async function inicializarSincronia() {
    const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
    const list = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");

    if (!chave || !chave.includes("_key_")) return;

    try {
        const response = await fetch(`${BASE_URL_SYNC}/nuvem/restore`, {
            headers: { "authorization": chave }
        });

        if (!response.ok) return;
        const res = await response.json();

        if (res.status === "success" && res.data) {
            const remoteMetadata = res.data.metadata;
            const remoteDate = new Date(remoteMetadata.ultima_sinc).getTime();
            const localSaveTime = localStorage.getItem("last_local_save_time");

            // --- CENÁRIO 1: NAVEGADOR VAZIO (AUTO-RESTORE) ---
            if (!localSaveTime || list.length === 0) {
                mostrarOverlay("Restaurando backup da nuvem...");
                tempImportData = res.data.payload;
                await confirmImport('replace', true); // Usa sua lógica de importação silenciosa
                localStorage.setItem("last_local_save_time", remoteMetadata.ultima_sinc);
                esconderOverlay();
                dispararAlertaReload("Dados recuperados com sucesso!", 1);
                return;
            }

            // --- CENÁRIO 2: VERIFICAÇÃO DE DIVERGÊNCIA (HASH + DATA) ---
            const hashLocal = await gerarHashLocal();
            const hashNuvem = remoteMetadata.hash; // O Backend deve passar a enviar o hash

            // Se o conteúdo for idêntico, ignoramos datas (evita falsos conflitos)
            if (hashNuvem && hashLocal === hashNuvem) {
                console.log("✅ Conteúdo idêntico. Sincronia ok.");
                localStorage.setItem("last_local_save_time", remoteMetadata.ultima_sinc);
                return;
            }

            const localDate = new Date(localSaveTime).getTime();

            // Se a nuvem for visivelmente mais nova (> 5s) e o conteúdo divergir
            if (remoteDate > (localDate + 5000)) {
                console.log("☁️ Divergência detectada: Nuvem é mais recente ou diferente.");

                // Em vez de processarRestauracaoTotal, usamos o novo fluxo via Import
                processarSincroniaDivergente(res.data);
            }
        }
    } catch (e) {
        console.warn("💥 Falha na sincronia:", e);
    }
}

async function gerarHashLocal() {
    const backup = {
        list: JSON.parse(localStorage.getItem(LIST_KEY) || "[]"),
        allData: {},
        configs: {}
    };
    backup.list.forEach(m => {
        backup.allData[m] = JSON.parse(localStorage.getItem(PREFIX + m) || "[]");
        backup.configs[m] = JSON.parse(localStorage.getItem(CONFIG_PREFIX + m) || "{}");
    });
    const msgUint8 = new TextEncoder().encode(JSON.stringify(backup));
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function safeWrapper(fn) {
    if (isProcessingUI) return; // Se já estiver fazendo algo, ignora o novo clique
    isProcessingUI = true;
    try {
        document.getElementById('btnSalvarTudo').classList.add('opacity-50');
        await fn();
    } finally {
        document.getElementById('btnSalvarTudo').classList.remove('opacity-50');
        isProcessingUI = false;
    }
}

function exibirModalConflito(remoteData) {
    const remoteDateStr = new Date(remoteData.metadata.ultima_sinc).toLocaleString('pt-BR');

    // Atualiza os textos dentro do Modal
    document.getElementById('remoteDate').innerText = remoteDateStr;
    document.getElementById('remoteVersion').innerText = remoteData.metadata.versao_app || "N/A";

    // Inicializa o modal do Bootstrap
    const myModal = new bootstrap.Modal(document.getElementById('modalConflito'));
    myModal.show();

    // Configura o evento do botão de confirmação
    const btnConfirmar = document.getElementById('btnConfirmarRestauracao');

    // Removemos ouvintes antigos para evitar execuções duplicadas
    const novoBtn = btnConfirmar.cloneNode(true);
    btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);

    novoBtn.addEventListener('click', () => {
        myModal.hide();
        mostrarOverlay("Baixando dados da nuvem...");

        // Pequeno delay para o modal fechar suavemente antes do overlay aparecer
        setTimeout(() => {
            processarRestauracaoTotal(remoteData);
        }, 300);
    });
}

function setButtonsState(loading) {
    const ids = ['btnSalvarTudo', 'btnEditarTudo', 'btnExcluirMateria', 'materiaSelect'];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = loading;
            // Opcional: Adiciona uma classe visual de "carregando"
            loading ? el.classList.add('opacity-50') : el.classList.remove('opacity-50');
        }
    });

    // Também desabilita o botão de Adicionar Linha se ele existir
    const btnAdd = document.querySelector('button[onclick="addEmptyRow()"]');
    if (btnAdd) btnAdd.disabled = loading;
}

function mostrarOverlay(mensagem = "Processando...") {
    const frasesEstudante = [
        // 🧠 Categoria: Ciência e Processamento Mental
        "Organizando seus neurônios para o próximo semestre...",
        "Indexando novos conceitos no seu córtex cerebral...",
        "Desfragmentando a memória pós-estudo...",
        "Fazendo upload de sabedoria para seu cérebro...",
        "Sincronizando seus flashcards mentais...",
        "Otimizando o espaço para fórmulas de última hora...",
        "Ativando o modo de foco profundo...",
        "Traduzindo hieróglifos do professor...",
        "Buscando a resposta no fundo do oceano da memória...",
        "Limpando o cache de distrações...",
        "Ajustando o brilho da sua inteligência...",
        "Validando a lógica do seu raciocínio...",
        "Gerando insights aleatórios...",
        "Fortalecendo as conexões neurais...",
        "Script de aprovação em execução...",

        // ☕ Categoria: Vida de Estudante & Café
        "Transformando café em aprovação...",
        "Café carregado. Cérebro pronto. Dados salvando...",
        "Estilizando seus sonhos com CSS (Café, Suor e Sono)...",
        "Recarregando a barra de energia mental...",
        "Fazendo o deploy do seu sucesso...",
        "Programado para passar...",
        "Preparando o terreno para o seu diploma...",
        "Upgrade de intelecto em progresso...",
        "Calibrando a motivação para a próxima hora...",
        "Preparando o checklist da vitória...",
        "Expulsando a procrastinação da sua mente...",
        "Modulando a ansiedade para nível 'Sob Controle'...",
        "Craftando seu futuro, um tópico por vez...",
        "Minerando conhecimento bruto...",

        // 🏆 Categoria: Motivação e Foco
        "A paciência é a chave para o 10...",
        "Devagar se vai ao longe (e se passa em Cálculo)...",
        "Construindo seu castelo, tijolo por tijolo...",
        "Seu esforço de hoje é o seu sucesso de amanhã...",
        "Quase lá! Não desista agora...",
        "O caminho é longo, mas a vista do topo é incrível...",
        "Plantando conhecimento para colher conquistas...",
        "Mantenha a calma e estude o próximo tópico...",
        "Disciplina garante aprovação e o quarto arrumado...",
        "Aprovado por antecipação...",
        "Criando o hábito dos grandes mestres...",
        "Foco no objetivo, força no processo...",
        "Você é inteligente! Trust-me...",
        "O conhecimento é o único bem que ninguém te tira...",
        "Preparando sua mente para grandes desafios...",
        "Lapidando o diamante que é você...",
        "A jornada importa tanto quanto o destino...",
        "Sua versão do futuro está te agradecendo agora...",
        "O sucesso é a soma de pequenos esforços diários...",

        // 🚀 Categoria: Criativas e Aleatórias
        "Desbloqueando conquistas acadêmicas...",
        "Recrutando neurônios voluntários...",
        "Sintonizando a rádio 'Frequência dos Aprovados'...",
        "Traduzindo 'entendi nada' para 'vou gabaritar'...",
        "Organizando a bagunça (a do app, não a do quarto)...",
        "Buscando inspiração em 3, 2, 1...",
        "Criando caminhos onde só havia dúvidas...",
        "Tecendo a teia do seu aprendizado...",
        "Descobrindo novas sinapses...",
        "Expandindo o universo do seu conhecimento...",
        "Codificando sua vitória...",
        "A paciência é uma virtude, a aprovação é a recompensa."
    ];

    overlayStartTime = Date.now(); // Marca o início

    // Se não passar mensagem, escolhe uma aleatória
    const textoFinal = (mensagem === "Processando...")
        ? frasesEstudante[Math.floor(Math.random() * frasesEstudante.length)]
        : mensagem;

    document.getElementById("loading-text").innerText = textoFinal;
    document.getElementById("loading-overlay").style.display = "flex";
}

async function esconderOverlay() {
    const currentTime = Date.now();
    const timeElapsed = currentTime - overlayStartTime;
    const remainingTime = MIN_OVERLAY_TIME - timeElapsed;

    // Se ainda falta tempo para o usuário ler, esperamos o restante
    if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    const overlayEl = document.getElementById("loading-overlay");
    if (overlayEl) overlayEl.style.display = "none";
}

// --- 🔑 GERADOR DE IDENTIDADE ÚNICA (HASH SDBM) ---
function gerarUID(item) {
    if (!item || !item.data) return null;

    const dataPart = item.data.trim();
    // Usa "vazio" caso o conteúdo não exista para garantir o hash
    const conteudoPart = (item.conteudo || "vazio")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();

    const stringParaHash = `${dataPart}_${conteudoPart}`;

    let hash = 0;
    for (let i = 0; i < stringParaHash.length; i++) {
        const char = stringParaHash.charCodeAt(i);
        hash = char + (hash << 6) + (hash << 16) - hash;
    }
    return `uid_${(hash >>> 0).toString(36)}`;
}

document.getElementById('iaFile').onchange = function () {
    const file = this.files[0];
    const maxSize = 5 * 1024 * 1024; // 5MB em bytes
    if (file.size > maxSize) {
        exibirAlerta("Arquivo muito grande (máximo 5Mb).", "warning");
        this.value = "";
        return;
    }
    processarArquivoIA(this);
};

document.getElementById('btnConfirmarAcaoExclusao').addEventListener('click', () => {
    if (isDeletingFullMateria) {
        executeFullMateriaDeletion();
    } else if (rowToDelete) {
        executeRowDeletion(rowToDelete);
    }
    bootstrap.Modal.getInstance(document.getElementById('modalConfirmarExclusao')).hide();
});


window.addEventListener('beforeunload', (e) => {
    const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
    const temChave = chave && chave.includes("_key_");

    // 1. Se não tem chave, a sincronia de nuvem não existe
    if (!temChave) {
        CloudSync.pending = false;
    }
    // 2. Se tem chave e a nuvem está pendente, forçamos o alerta visual
    else if (CloudSync.isPending) {
        setUnsavedChanges(true); // Faz o botão "Salvar Tudo" brilhar/ficar vermelho
    }

    // 3. O navegador trava a saída se houver pendência local OU de nuvem
    if (hasUnsavedChanges || CloudSync.isPending) {
        const msg = "Existem dados não salvos ou pendentes de sincronização com a nuvem.";

        // Configuração padrão de segurança dos browsers modernos
        e.preventDefault();
        e.returnValue = msg;
        return msg;
    }
});

document.getElementById('modalConfig').addEventListener('show.bs.modal', function () {
    verificarBotaoPanico();
    loadColumnNames();
});

document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        await executarFluxoSalvamentoCompleto();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        addEmptyRow();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        enableEditModeAllRows();
    }
});

document.getElementById('inputIntervaloDias').addEventListener('change', (e) => {
    setUnsavedChanges(true);
});

function dispararAlertaReload(mensagem = "", segundos = 1) {
    // 1. Forçamos a limpeza das travas de segurança
    hasUnsavedChanges = false;
    CloudSync.pending = false;

    // 2. Atualizamos o texto do overlay que já está na tela
    const loadingText = document.getElementById("loading-text");
    if (loadingText) loadingText.innerText = mensagem;

    // 3. Executamos o reload após o tempo solicitado
    setTimeout(() => {
        // Escondemos o overlay apenas para garantir que não haja "flicker" antes do reload
        const overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.style.display = "none";
        location.reload();
    }, segundos * 1000);
}

function verificarBotaoPanico() {
    const raw = localStorage.getItem("EMERGENCY_BACKUP_V1");
    const container = document.getElementById('container-botao-panico');
    const labelData = document.getElementById('data-backup-emergencia');
    if (raw && container) {
        try {
            const backup = JSON.parse(raw);
            if (labelData) labelData.innerText = backup.timestamp;
            container.classList.remove('d-none');
        } catch (e) {
            container.classList.add('d-none');
        }
    } else if (container) {
        container.classList.add('d-none');
    }
}

function exibirAlerta(mensagem, tipo = 'success') {
    const alertPlaceholder = document.getElementById('liveAlertPlaceholder');
    if (!alertPlaceholder) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = [
        `<div class="alert alert-${tipo} alert-dismissible fade show shadow-lg border-0 mb-2" role="alert">`,
        `   <div class="d-flex align-items-center">`,
        `      <i class="bi ${tipo === 'success' ? 'bi-check-circle-fill' : (tipo === 'danger' ? 'bi-x-circle-fill' : 'bi-exclamation-triangle-fill')} me-2"></i>`,
        `      <div>${mensagem}</div>`,
        `   </div>`,
        '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
        '</div>'
    ].join('');

    alertPlaceholder.append(wrapper);

    // Só agenda o fechamento automático se não for erro crítico (danger)
    if (tipo !== 'danger') {
        setTimeout(() => {
            const alertElement = wrapper.querySelector('.alert');
            // VERIFICAÇÃO CRÍTICA: O elemento ainda está no documento?
            if (alertElement && document.body.contains(alertElement)) {
                const bsAlert = bootstrap.Alert.getOrCreateInstance(alertElement);
                if (bsAlert) {
                    bsAlert.close();
                }
            }

            // Remove o wrapper após a animação de fade do Bootstrap
            setTimeout(() => {
                if (wrapper && wrapper.parentNode) {
                    wrapper.remove();
                }
            }, 500);
        }, 3500); // Aumentei um pouco para dar tempo de ler
    }
}

function higienizarData(dataString) {
    // Se a data for nula, indefinida ou apenas espaços, retorna a data de hoje (ISO)
    if (!dataString || dataString.trim() === "") {
        return new Date().toISOString().split('T')[0];
    }

    // Se a data estiver no formato brasileiro (DD/MM/YYYY), converte para ISO (YYYY-MM-DD)
    if (dataString.includes('/')) {
        const partes = dataString.split('/');
        if (partes.length === 3) {
            return `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
    }

    return dataString; // Retorna o que sobrou (espera-se YYYY-MM-DD)
}

async function restaurarSnapshotEmergencial() {
    const raw = localStorage.getItem("EMERGENCY_BACKUP_V1");
    if (!raw) return;

    const backup = JSON.parse(raw);
    if (!confirm(`⚠️ Os dados atuais serão restaurados para o backup de ${backup.timestamp}. Continuar?`)) return;

    mostrarOverlay();
    //Dá tempo para o navegador iniciar a animação
    await new Promise(resolve => setTimeout(resolve, 100));

    setTimeout(() => {
        // 1. Identificar o que temos hoje para poder limpar depois
        const listaAntes = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");

        // 2. Restaurar os dados do backup (Sobrescrita atômica)
        backup.list.forEach(m => {
            localStorage.setItem(PREFIX + m, JSON.stringify(backup.data[m]));
            if (backup.configs[m]) {
                localStorage.setItem(CONFIG_PREFIX + m, JSON.stringify(backup.configs[m]));
            }
        });

        // 3. Atualizar a lista mestre (O índice novo)
        localStorage.setItem(LIST_KEY, JSON.stringify(backup.list));

        // 4. LIMPEZA FINAL: Deletar apenas o que não faz parte da nova lista
        const novaLista = new Set(backup.list);
        listaAntes.forEach(materiaAntiga => {
            if (!novaLista.has(materiaAntiga)) {
                localStorage.removeItem(PREFIX + materiaAntiga);
                localStorage.removeItem(CONFIG_PREFIX + materiaAntiga);
                console.log(`🧹 Removendo sobra: ${materiaAntiga}`);
            }
        });

        // 5. Finalizar
        localStorage.removeItem("EMERGENCY_BACKUP_V1");
        verificarBotaoPanico();
        dispararAlertaReload("Tudo restaurado.");
    }, 2000);
}

// 1. Adicione esta função para gerenciar o dashboard de uso
function renderizarStatusIA(data) {
    const containerStatus = document.getElementById('containerStatusIA');
    const displayEmail = document.getElementById('displayEmailChave');

    if (!containerStatus) return;

    // FORÇA a exibição do container independente de qualquer erro
    containerStatus.style.display = 'block';
    if (displayEmail) displayEmail.style.display = 'block';

    // Mapeamento de campos (Backend -> Frontend)
    // Caso o backend use 'uso_atual' e a função espere 'consumo', ou vice-versa
    const uso = data.uso_atual || data.consumo || 0;
    const cota = data.cota_maxima || data.limite || 0;
    const percentual = cota > 0 ? Math.min((uso / cota) * 100, 100) : 0;

    const labelConsumo = document.getElementById('labelConsumoIA');
    const barra = document.getElementById('barraProgressoIA');

    if (labelConsumo) {
        // Se não for válido, mostra "BLOQUEADO" em vez de números zerados
        labelConsumo.innerText = data.valido ? `${uso} / ${cota}` : "BLOQUEADO";
        labelConsumo.className = data.valido ? 'badge bg-primary-subtle text-primary' : 'badge bg-danger-subtle text-danger';
    }

    if (barra) {
        barra.style.width = data.valido ? `${percentual}%` : '100%';
        barra.className = 'progress-bar progress-bar-striped progress-bar-animated';

        if (!data.valido) {
            barra.classList.add('bg-danger');
            barra.classList.remove('progress-bar-animated');
        } else {
            if (percentual > 85) barra.classList.add('bg-danger');
            else if (percentual > 50) barra.classList.add('bg-warning');
            else barra.classList.add('bg-primary');
        }
    }

    // Data de Expiração
    const labelExp = document.getElementById('labelExpiracaoIA');
    if (labelExp) {
        const expiracaoRaw = data.expiracao || data.data_expiracao;
        if (expiracaoRaw) {
            const dataApenas = expiracaoRaw.split('T')[0];
            const partes = dataApenas.split('-');
            labelExp.innerText = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataApenas;
        } else {
            labelExp.innerText = "N/A";
        }
    }

    // Badge de Status
    const badge = document.getElementById('badgeStatusChave');
    if (badge) {
        if (data.valido) {
            badge.innerText = 'ATIVO';
            badge.className = 'badge rounded-pill bg-success-subtle text-success border border-success';
        } else {
            let statusTexto = 'INATIVO';
            // Pega o motivo que vem do seu Backend
            if (data.motivo === 'quota_exceeded') statusTexto = 'COTA ESGOTADA';
            else if (data.motivo === 'expired') statusTexto = 'EXPIRADO';
            else if (data.motivo === 'disabled') statusTexto = 'DESATIVADO';
            else if (data.status === 'fail') statusTexto = 'ERRO';

            badge.innerText = statusTexto;
            badge.className = 'badge rounded-pill bg-danger-subtle text-danger border border-danger';
        }
    }
}

// ==========================================
// 🔑 GESTÃO DE ACESSO E CONTRIBUINTE
// ==========================================

/**
 * Salva a nova chave de contribuinte com segurança.
 * Garante que os dados locais sejam limpos ou salvos 
 * antes da troca para evitar colisão entre usuários diferentes.
 */
async function saveChaveContribuinte() {
    const input = document.getElementById('inputChaveAcesso');
    const novaChave = input.value.trim();
    const chaveAntiga = localStorage.getItem("config_vBorda_chave_contribuinte") || "";

    if (novaChave === chaveAntiga) return;

    // 1. Consentimento (Sempre para nova chave)
    if (novaChave !== "") {
        const aceitou = await confirmarConsentimentoModal();
        if (!aceitou) {
            input.value = chaveAntiga;
            return;
        }
    }

    // --- CENÁRIO A: LOGOUT ---
    if (novaChave === "") {
        if (chaveAntiga && (hasUnsavedChanges || CloudSync.isPending)) {
            const sucessoSync = await persistirSnapshotTotal();
            if (!sucessoSync) {
                const sairMesmoAssim = await confirmarErroSyncModal();
                if (!sairMesmoAssim) {
                    input.value = chaveAntiga;
                    return;
                }
            }
        }
        console.log("🔌 Modo local ativado.");
        localStorage.setItem("config_vBorda_chave_contribuinte", "");
        CloudSync.pending = false;
        renderizarEmailChave();
        checkInterfaceState();
        return;
    }

    // --- CENÁRIO B: NOVA CONEXÃO / TROCA ---
    if (chaveAntiga && (hasUnsavedChanges || CloudSync.isPending)) {
        await persistirSnapshotTotal();
    }

    const dadosValidacao = await validarChaveNoServidor(novaChave);

    if (dadosValidacao.valido) {
        const temDadosLocais = itensCronogramaExistentes();
        const temDadosNuvem = dadosValidacao.tem_nuvem;

        // CENÁRIO 1: Ativação inicial com conteúdo local já existente
        if (!chaveAntiga && temDadosLocais) {
            if (temDadosNuvem) {
                const decisao = await confirmarTrocaModal(dadosValidacao.nome, false, 'conflito_inicial');

                if (decisao === 'baixar_nuvem') {
                    limparDadosLocaisParaNovoUsuario(); // Limpa antes de baixar
                    localStorage.setItem("config_vBorda_chave_contribuinte", novaChave);
                    await executarDownloadForcadoFirestore();
                    return; // O download já faz o reload
                } else if (decisao === 'manter_local') {
                    exibirAlerta("Ótimo! Seus dados locais serão sincronizados na nova conta.", "success");
                    // Não limpamos aqui! Queremos manter o local.
                } else {
                    input.value = "";
                    return;
                }
            } else {
                localStorage.setItem("config_vBorda_chave_contribuinte", novaChave);
                await persistirSnapshotTotal();
                exibirAlerta(`Bem-vindo, ${dadosValidacao.nome}! Sincronizado com a nuvem.`, "success");
            }
        }
        // CENÁRIO 2: Troca de uma conta por outra (Aqui a limpeza é obrigatória)
        else if (chaveAntiga && chaveAntiga !== novaChave) {
            const decisao = await confirmarTrocaModal(dadosValidacao.nome, CloudSync.isPending, 'troca');
            if (decisao === 'trocar') {
                limparDadosLocaisParaNovoUsuario();
                localStorage.setItem("config_vBorda_chave_contribuinte", novaChave); // Grava a nova chave antes de resetar
                closeModals(); // Fecha o modal de config e o de troca
                dispararAlertaReload(`Conta alterada para ${dadosValidacao.nome}. Reiniciando...`, 1);
                return; // Mata a execução aqui
            } else {
                input.value = chaveAntiga;
                return;
            }
        }
        // CENÁRIO 3: Login em navegador limpo
        else if (!temDadosLocais) {
            limparDadosLocaisParaNovoUsuario(); // Garante reset de metadados
        }

        // Finalização da ativação para os casos que não deram 'return' (manter_local ou novo login)
        localStorage.setItem("config_vBorda_chave_contribuinte", novaChave);
        CloudSync.pending = false;

        renderizarStatusIA(dadosValidacao);
        checkInterfaceState();
        exibirAlerta(`Conectado como ${dadosValidacao.nome}!`, "success");

        // Busca automática se o local estiver vazio
        if (!temDadosLocais && temDadosNuvem) {
            inicializarSincronia();
        }

    } else {
        // --- 🚨 CHAVE INVÁLIDA ---
        const prosseguir = await confirmarChaveInvalidaModal();
        if (prosseguir) {
            localStorage.setItem("config_vBorda_chave_contribuinte", "");
            CloudSync.pending = false;
            renderizarEmailChave();
            checkInterfaceState();
            exibirAlerta("Entrou em modo local.", "info");
        } else {
            input.value = chaveAntiga;
            setTimeout(() => input.focus(), 100);
        }
    }
}
/**
 * Função auxiliar para isolar a chamada de rede
 */
async function validarChaveNoServidor(chave) {
    try {
        const response = await fetch(`${BASE_URL_SYNC}/validar-contribuinte`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chave: chave })
        });
        const dados = await response.json();
        return {
            valido: response.ok && dados.valido,
            nome: dados.nome || "Usuário",
            uso_atual: dados.uso_atual,
            cota_maxima: dados.cota_maxima,
            expiracao: dados.expiracao
        };
    } catch (e) {
        return { valido: false };
    }
}

// Auxiliar para manter o código limpo
function limparDadosLocaisParaNovoUsuario() {
    console.log("🧹 Executando limpeza atômica para troca de conta.");
    const lista = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");

    lista.forEach(m => {
        localStorage.removeItem(PREFIX + m);
        localStorage.removeItem(CONFIG_PREFIX + m);
    });

    // Limpa metadados de controle
    localStorage.removeItem(LIST_KEY);
    localStorage.removeItem("last_local_save_time");
    localStorage.removeItem("last_active");
    localStorage.removeItem("EMERGENCY_BACKUP_V1");
    localStorage.removeItem("config_vBorda_cloud_pending"); // Importante!

    // Em vez de manipular o DOM aqui, nós vamos forçar o reload
    // Isso é muito mais limpo para o navegador "esquecer" a conta anterior
}

/**
 * Auxiliar para verificar se existem dados populados no LocalStorage
 */
function itensCronogramaExistentes() {
    const lista = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
    return lista.length > 0;
}

/**
 * Limpa o estado da aplicação para troca de usuário ou logout.
 */
function limparEstadoLocalTotal() {
    console.log("🧹 Limpando estado local para transição de usuário...");

    // Limpa lista de matérias e conteúdos
    const lista = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
    lista.forEach(m => {
        localStorage.removeItem(PREFIX + m);
        localStorage.removeItem(CONFIG_PREFIX + m);
    });
    localStorage.removeItem(LIST_KEY);

    // Limpa travas de sincronia e navegação
    localStorage.removeItem("last_local_save_time");
    localStorage.removeItem("last_active");
    sessionStorage.removeItem('google_access_token');

    // Reseta variáveis globais de controle
    currentMateria = "";
    accessToken = null;
    hasUnsavedChanges = false;
    activeEditors = {}; // Nota: os editores reais devem ser destruídos via saveAllRows se necessário
}

/**
 * Renderiza o status da IA e valida a chave com o Backend
 */
async function renderizarEmailChave() {
    const input = document.getElementById('inputChaveAcesso');
    const display = document.getElementById('displayEmailChave');
    const label = document.getElementById('labelEmailContribuinte');
    const containerStatus = document.getElementById('containerStatusIA');
    const valor = input.value.trim();

    // Se o campo estiver vazio, apenas limpamos a interface e saímos
    if (!valor) {
        display.style.display = "none";
        if (containerStatus) containerStatus.style.display = "none";
        input.classList.remove('is-invalid', 'is-valid');
        return;
    }

    try {
        const response = await fetch(`${BASE_URL_SYNC}/validar-contribuinte`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chave: valor })
        });

        const dados = await response.json();

        if (!response.ok) {
            // O backend vai retornar 400 ou 403. Tratamos como inválida visualmente.
            label.innerText = valor.includes("_key_") ? valor.split("_key_")[0] : "Usuário";
            input.classList.remove('is-valid');
            input.classList.add('is-invalid');
            renderizarStatusIA({
                valido: false,
                motivo: dados.motivo || 'invalid',
                status: 'fail'
            });
            exibirAlerta(`${dados.detail}`, "danger");
            return;
        }

        // Sucesso: Chave válida no Python e Firestore
        if (dados.status === "success" && dados.valido) {
            label.innerText = valor.includes("_key_") ? valor.split("_key_")[0] : "Usuário Ativo";
            display.style.display = "block";
            input.classList.remove('is-invalid');
            input.classList.add('is-valid');
            renderizarStatusIA(dados);
        }

    } catch (error) {
        console.error("💥 Falha de comunicação com o servidor:", error);
        renderizarStatusIA({
            valido: false,
            motivo: 'connection_error',
            status: 'fail'
        });
    }
}

function acionarIA() { document.getElementById('iaFile').click(); }

async function processarArquivoIA(input) {
    const chaveContribuinte = localStorage.getItem("config_vBorda_chave_contribuinte");
    if (!chaveContribuinte) {
        exibirAlerta("Chave de Acesso não encontrada!", "warning");
        input.value = "";
        return;
    }
    if (!input.files.length) return;
    const file = input.files[0];
    const btnIa = document.querySelector('button[onclick="acionarIA()"]');
    const originalText = btnIa.innerHTML;
    btnIa.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Processando...`;
    btnIa.disabled = true;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch(`${BASE_URL_SYNC}/processar`, {
            method: "POST",
            headers: {
                // Esta chave deve ser IGUAL à CHAVE_CONTRIBUINTE_VALIDA no seu main.py
                "authorization": chaveContribuinte
            },
            body: formData
        });

        // 1. Primeiro verificamos se a resposta NÃO é ok (status fora da faixa 200-299)
        if (!response.ok) {
            const erroJson = await response.json(); // FastAPI sempre retorna JSON no detail

            if (response.status === 413) {
                //Arquivo muito pesado
                exibirAlerta(`📏 ${erroJson.detail}`, "danger");
            } else if (response.status === 403) {
                //Acesso negado
                exibirAlerta(`${erroJson.detail}`, "danger");
            } else {
                exibirAlerta(`❌ Erro ${response.status}: ${erroJson.detail || 'Erro desconhecido'}`, "danger");
            }
            return; // Interrompe a execução para não tentar importar dados vazios
        }

        // 2. Se chegou aqui, a resposta é 200 OK
        const jsonRecebido = await response.json();
        if (jsonRecebido.error) {
            exibirAlerta("Erro na IA: " + jsonRecebido.error, "danger");
            return;
        }
        importarDadosIA(jsonRecebido);
        closeModals();
    } catch (e) {
        console.error(e);
        exibirAlerta("Falha ao conectar com o servidor IA.", "danger");
    } finally {
        btnIa.innerHTML = originalText;
        btnIa.disabled = false;
        input.value = "";
    }
}

function importarDadosIA(jsonRecebido) {
    try {
        tempImportData = jsonRecebido;
        prepararEscolhaImport();
    } catch (e) {
        exibirAlerta("Erro ao processar dados da IA: " + e.message, "danger");
    }
}

window.addEventListener('load', checkScroll);
window.addEventListener('resize', checkScroll);

function checkScroll() {
    const container = document.getElementById('tabela-container');
    const seta = document.getElementById('seta-scroll');
    if (!container || !seta) return;
    const precisaDeScroll = container.scrollWidth > container.clientWidth;
    const jaRolou = container.scrollLeft > 20;
    if (!precisaDeScroll || jaRolou) {
        seta.style.display = 'none';
    } else if (window.innerWidth < 768) {
        seta.style.display = 'block';
    }
}

async function prepararConfiguracoes() {
    if (hasUnsavedChanges) {
        await saveAllRows();
    }
    const prefTab = document.getElementById('pref-tab');
    const backupTab = document.getElementById('backup-tab');
    const deleteTab = document.getElementById('delete-tab');
    const myModal = new bootstrap.Modal(document.getElementById('modalConfig'));
    const importFile = document.getElementById('importFile');
    importFile.value = "";
    if (!currentMateria) {
        if (prefTab) prefTab.style.display = "none";
        if (deleteTab) deleteTab.style.display = "none";
        myModal.show();
        setTimeout(() => { if (backupTab) new bootstrap.Tab(backupTab).show(); }, 150);
        return;
    }
    if (prefTab) prefTab.style.display = "block";
    if (deleteTab) deleteTab.style.display = "block";
    const nomesDaTabela = {
        t: document.getElementById('colName_t').value,
        e1: document.getElementById('colName_e1').value,
        e2: document.getElementById('colName_e2').value,
        e3: document.getElementById('colName_e3').value,
        e4: document.getElementById('colName_e4').value,
        e5: document.getElementById('colName_e5').value,
        e6: document.getElementById('colName_e6').value
    };
    saveAllRows();
    Object.keys(nomesDaTabela).forEach(k => {
        const modalInput = document.getElementById('modalColName_' + k);
        if (modalInput) modalInput.value = nomesDaTabela[k];
    });

    // --- PASSO 4: SINCRONIZAÇÃO DE VISIBILIDADE ---
    // Carregamos os checkboxes (que não mudam via digitação)
    const rawConfig = localStorage.getItem(CONFIG_PREFIX + currentMateria);
    if (rawConfig) {
        const cfg = JSON.parse(rawConfig);

        let visibleCols = ['t', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6']; // Padrão: todas visíveis
        if (cfg && cfg.hiddenCols) {
            visibleCols = ['t', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'].filter(col => !cfg.hiddenCols.includes(col));
        } else if (cfg && cfg.visibleCols) {
            visibleCols = ['t', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'].filter(col => cfg.visibleCols.includes(col));
        }
        document.querySelectorAll('.check-hide-col').forEach(cb => {
            cb.checked = visibleCols.includes(cb.value);
        });
    }

    updateTabName();
    myModal.show();
    setTimeout(() => {
        if (prefTab) {
            document.getElementById("pref-tab-materia").innerText = currentMateria;
            new bootstrap.Tab(prefTab).show();
        }
    }, 150);
}

function updateTabName() {
    const nomeAtual = document.getElementById('materiaTitulo').value.trim();
    document.querySelectorAll('.nome-materia-modal').forEach(span => {
        span.innerText = nomeAtual ? nomeAtual : "esta matéria";
    });
}

// Lê os nomes das colunas e as configurações de visibilidade do localStorage e atualiza tanto os inputs do header da tabela quanto os inputs do modal de preferências.
function loadColumnNames() {
    if (!currentMateria) return;
    const rawConfig = localStorage.getItem(CONFIG_PREFIX + currentMateria);
    let cfg = {};
    try { if (rawConfig) cfg = JSON.parse(rawConfig); } catch (e) { }
    const defaults = { t: "Teoria", e1: "Ex. 1", e2: "Ex. 2", e3: "Ex. 3", e4: "Ex. 4", e5: "Rev. 1", e6: "Rev. 2" };
    const keys = ['t', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
    keys.forEach(k => {
        const val = (cfg && cfg[k]) ? cfg[k] : defaults[k];
        if (document.getElementById('colName_' + k)) document.getElementById('colName_' + k).value = val;
        if (document.getElementById('colName_' + k)) document.getElementById('colName_' + k).title = val;
        if (document.getElementById('modalColName_' + k)) document.getElementById('modalColName_' + k).value = val;
    });
    const visibleCols = getVisibleColumns();
    document.querySelectorAll('.check-hide-col').forEach(cb => {
        cb.checked = visibleCols.includes(cb.value);
    });
    applyVisibilityStyles(visibleCols);
}

function syncFromModal(key) {
    const modalVal = document.getElementById('modalColName_' + key).value;
    const headerInput = document.getElementById('colName_' + key);
    if (headerInput) { headerInput.value = modalVal; headerInput.title = modalVal; }
    setUnsavedChanges(true);
}

function syncModalLabels() {
    ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].forEach(k => {
        const hVal = document.getElementById('colName_' + k).value;
        const mInput = document.getElementById('modalColName_' + k);
        if (mInput) mInput.value = hVal;
    });
}

function setInitialTableContent(message = "Selecione uma matéria") {
    return `<tr><td colspan="11" class="text-center text-muted py-5"><i class="bi bi-arrow-up-circle d-block h1"></i>${message}</td></tr>`;
}

function formatDateToBR(dateStr) {
    if (!dateStr || !dateStr.includes('-')) return dateStr || '-';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

async function switchMateria(name) {
    const tableBody = document.getElementById('tableBody');
    const inputTitulo = document.getElementById('materiaTitulo');

    // 1. Salva a matéria anterior se houver mudanças pendentes
    if (currentMateria && hasUnsavedChanges) {
        await saveAllRows();
    } else {
        // Limpa editores ativos para evitar vazamento de memória
        for (const id in activeEditors) {
            if (activeEditors[id]) {
                await activeEditors[id].destroy();
                delete activeEditors[id];
            }
        }
        document.querySelectorAll('.is-editing').forEach(tr => tr.classList.remove('is-editing'));
    }

    currentMateria = name;

    // 2. Tratamento para seleção vazia
    if (!name || name.trim() === "") {
        localStorage.removeItem('last_active');
        tableBody.innerHTML = setInitialTableContent();
        if (inputTitulo) inputTitulo.value = "";
        updateTabName();
        checkInterfaceState();
        updateSelect();
        return;
    }

    // 3. Persistência do estado de navegação
    localStorage.setItem('last_active', name);
    if (inputTitulo) inputTitulo.value = name;

    // 4. Carregamento dos dados da matéria selecionada
    loadColumnNames(); // Carrega nomes das colunas e visibilidade
    loadIntervalConfig(); // Carrega o intervalo de dias
    loadRows(); // Renderiza as linhas na tabela

    // 5. Atualização da Interface
    updateSelect();
    updateTabName();
    checkInterfaceState();
}

function applyVisibilityStyles(visibleCols) {
    const colMapping = { 't': 3, 'e1': 4, 'e2': 5, 'e3': 6, 'e4': 7, 'e5': 8, 'e6': 9 };
    Object.keys(colMapping).forEach(key => {
        const colIndex = colMapping[key];
        const shouldHide = !visibleCols.includes(key);
        const th = document.querySelector(`.study-table thead th:nth-child(${colIndex})`);
        if (th) th.style.display = shouldHide ? 'none' : '';
        const cells = document.querySelectorAll(`#tableBody tr td:nth-child(${colIndex})`);
        cells.forEach(td => { td.style.display = shouldHide ? 'none' : ''; });
    });
}

function applyVisibility() {
    const visible = Array.from(document.querySelectorAll('.check-hide-col:checked')).map(cb => cb.value);
    const novoIntervalo = parseInt(document.getElementById('inputIntervaloDias').value) || 7;
    const deveRepetir = document.getElementById('checkRepetirIntervalo').checked;
    saveColumnNames(visible);
    applyVisibilityStyles(visible);
    if (currentMateria && deveRepetir) {
        const materiasList = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
        materiasList.forEach(m => {
            const rawConfig = localStorage.getItem(CONFIG_PREFIX + m);
            let cfg = rawConfig ? JSON.parse(rawConfig) : {};
            cfg.intervalo = novoIntervalo;
            localStorage.setItem(CONFIG_PREFIX + m, JSON.stringify(cfg));
        });
    }
    setUnsavedChanges(true);
    saveAllRows();
    bootstrap.Modal.getInstance(document.getElementById('modalConfig')).hide();
}

function saveColumnNames(visibleCols = null) {
    if (!currentMateria) return;
    if (visibleCols === null) visibleCols = getVisibleColumns();
    const config = {
        t: document.getElementById('colName_t').value,
        e1: document.getElementById('modalColName_e1').value,
        e2: document.getElementById('modalColName_e2').value,
        e3: document.getElementById('modalColName_e3').value,
        e4: document.getElementById('modalColName_e4').value,
        e5: document.getElementById('modalColName_e5').value,
        e6: document.getElementById('modalColName_e6').value,
        visibleCols: visibleCols,
        intervalo: parseInt(document.getElementById('inputIntervaloDias').value) || 7
    };
    localStorage.setItem(CONFIG_PREFIX + currentMateria, JSON.stringify(config));
}

function loadRows() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";
    const data = JSON.parse(localStorage.getItem(PREFIX + currentMateria) || "[]");
    data.sort((a, b) => a.data.localeCompare(b.data));
    if (data.length > 0) {
        data.forEach(i => {
            let dataParaCarregar = higienizarData(i.data);
            let htmlObs = i.obs || "";
            htmlObs = htmlObs.replaceAll('disabled="disabled"', ''); // Habilita o clique
            createRow(i.uid, dataParaCarregar, i.conteudo, i.t, i.e1, i.e2, i.e3, i.e4, i.e5, i.e6, htmlObs);
        });
    } else {
        tbody.innerHTML = setInitialTableContent("Matéria sem conteúdo");
    }
}

function getVisibleColumns() {
    let visibleCols = ['t', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6']; // Padrão: todas visíveis
    const rawConfig = localStorage.getItem(CONFIG_PREFIX + currentMateria);
    if (rawConfig) {
        const cfg = JSON.parse(rawConfig);
        if (cfg && cfg.hiddenCols) {
            visibleCols = ['t', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'].filter(col => !cfg.hiddenCols.includes(col));
        } else if (cfg && cfg.visibleCols) {
            visibleCols = ['t', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'].filter(col => cfg.visibleCols.includes(col));
        }

    }
    return visibleCols
}

function setVisibility() {
    applyVisibilityStyles(getVisibleColumns());
}

function createRow(uid, d, c, t, e1, e2, e3, e4, e5, e6, o, isEdit = false) {
    const tbody = document.getElementById('tableBody');
    const tr = document.createElement('tr');
    tr.id = `row_${uid}`;

    if (isEdit) tr.classList.add('is-editing');

    // --- 1. TRATAMENTO DE DATA ---
    let dateValue = d && d.includes('/') ? d.split('/').reverse().join('-') : d;
    if (dateValue) {
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const dataLinha = new Date(dateValue + 'T12:00:00'); dataLinha.setHours(0, 0, 0, 0);
        if (dataLinha < hoje) tr.classList.add("data-passada");
        else if (dataLinha.getTime() === hoje.getTime()) tr.classList.add("data-hoje");
        else tr.classList.add("data-futura");
    }

    // --- 2. HELPER PARA CHECKBOXES ---
    const tickCell = (val, field) => `<td><i class="bi ${val ? 'bi-check-square-fill' : 'bi-square'} check-toggle view-mode" onclick="toggleCheck(this,'${field}')"></i><input type="checkbox" class="form-check-input edit-mode ${field}" ${val ? 'checked' : ''} style="display: none;"></td>`;

    // Garantimos que 'o' seja string e tratamos nulos para o innerHTML
    const obsTratada = (typeof o === 'string') ? o.replaceAll('disabled="disabled"', '') : (o || "");
    const obsParaExibir = obsTratada || "-";

    // --- 4. RENDERIZAÇÃO ---
    tr.innerHTML = `
        <td>
            <span class="view-mode data-conteudo">${formatDateToBR(dateValue)}</span>
            <input type="date" class="edit-input edit-mode val-data" value="${dateValue}">
        </td>
        <td class="text-start-custom">
            <span class="view-mode fw-bold">${c || '-'}</span>
            <input type="text" class="edit-input edit-mode val-conteudo" value="${c || ''}">
        </td>
        ${tickCell(t, 'val-t')}
        ${tickCell(e1, 'val-e1')}
        ${tickCell(e2, 'val-e2')}
        ${tickCell(e3, 'val-e3')}
        ${tickCell(e4, 'val-e4')}
        ${tickCell(e5, 'val-e5')}
        ${tickCell(e6, 'val-e6')}
        <td class="text-start-custom col-data-obs">
            <div class="view-mode view-obs">${obsParaExibir}</div>
            <div class="edit-mode">
                <div class="val-obs-editor">${obsTratada}</div>
            </div>
        </td>
        <td class="no-print col-actions">
            <i class="bi bi-trash text-danger btn-action" onclick="deleteRow(this)"></i>
        </td>`;

    tbody.appendChild(tr);
    setVisibility();

    if (isEdit) enableEditMode(tr.id);

    return tr;
}

function toggleCheck(icon, field) {
    const tr = icon.closest('tr');
    const cb = tr.querySelector('.' + field);
    cb.checked = !cb.checked;

    // Atualiza o ícone visualmente antes de salvar
    icon.classList.toggle('bi-check-square-fill', cb.checked);
    icon.classList.toggle('bi-square', !cb.checked);

    saveData();
}

// --- 💾 SALVAR DADOS (Com gravação física do UID) ---
function saveData() {
    if (!currentMateria) return;
    const tableRows = Array.from(document.querySelectorAll('#tableBody tr'));

    // Usaremos um Map para garantir a unicidade de data + conteudo
    const uniqueItems = new Map();

    tableRows.forEach(tr => {
        const rowId = tr.id;
        const vObs = tr.querySelector('.view-obs');
        const rawData = tr.querySelector('.val-data')?.value;
        const conteudo = tr.querySelector('.val-conteudo')?.value || "";

        // 1. Higieniza a data imediatamente
        const valData = higienizarData(rawData);

        if (!vObs || !valData) return;

        const rowData = {
            data: valData,
            conteudo: conteudo.trim(),
            t: tr.querySelector('.val-t')?.checked || false,
            e1: tr.querySelector('.val-e1')?.checked || false,
            e2: tr.querySelector('.val-e2')?.checked || false,
            e3: tr.querySelector('.val-e3')?.checked || false,
            e4: tr.querySelector('.val-e4')?.checked || false,
            e5: tr.querySelector('.val-e5')?.checked || false,
            e6: tr.querySelector('.val-e6')?.checked || false,
            obs: activeEditors[rowId] ? activeEditors[rowId].getData() : vObs.innerHTML
        };

        // 2. Define o UID (Prioriza o ID fixo da TR para não quebrar referências)
        if (rowId && rowId.startsWith('row_') && !rowId.startsWith('row_new_')) {
            rowData.uid = rowId.replace('row_', '');
        } else {
            rowData.uid = gerarUID(rowData);
        }

        // 3. CHAVE DE UNICIDADE: Data + Conteúdo (normalizado)
        // Isso impede que "2026-04-26 - Aula 1" exista duas vezes.
        const uniqueKey = `${rowData.data}_${rowData.conteudo.toLowerCase()}`;
        uniqueItems.set(uniqueKey, rowData);
    });

    // 4. Converte o Map de volta para Array, filtra vazios e ORDENA
    const items = Array.from(uniqueItems.values())
        .filter(item => item.conteudo !== "" || item.obs.replace(/<[^>]*>|&nbsp;|\s+/g, '').trim() !== "")
        .sort((a, b) => a.data.localeCompare(b.data));

    localStorage.setItem(PREFIX + currentMateria, JSON.stringify(items));

    setUnsavedChanges(false);

    // MARCA QUE A NUVEM ESTÁ DESATUALIZADA
    const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
    if (!chave || !chave.includes("_key_")) {
        localStorage.setItem("last_local_save_time", new Date().toISOString());
    } else {
        CloudSync.pending = true;
    }

}

function processarRestauracaoTotal(data) {
    const payload = data.payload;
    const metadata = data.metadata;
    const ultima_sinc = metadata.ultima_sinc;

    if (!payload || !payload.list) return;

    // 1. Limpeza Atômica: Remove TUDO que pertence ao app antes de injetar
    // É mais seguro que iterar sobre a lista atual, que pode estar corrompida
    const listaAntiga = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
    listaAntiga.forEach(m => {
        localStorage.removeItem(PREFIX + m);
        localStorage.removeItem(CONFIG_PREFIX + m); // Limpa as configs também!
    });

    // 2. Injeta a nova Lista Mestra
    localStorage.setItem(LIST_KEY, JSON.stringify(payload.list));

    // 3. Injeta os dados das matérias e suas configurações específicas
    if (payload.allData) {
        for (const materia in payload.allData) {
            localStorage.setItem(PREFIX + materia, JSON.stringify(payload.allData[materia]));

            // Verifica se as configs vieram dentro do allData ou em objeto separado
            const configMateria = payload.configs ? payload.configs[materia] : null;
            if (configMateria) {
                localStorage.setItem(CONFIG_PREFIX + materia, JSON.stringify(configMateria));
            }
        }
    }

    // 4. ALINHAMENTO DE CRONÔMETRO (Crucial!)
    // Agora o seu PC acredita que a última alteração dele foi EXATAMENTE 
    // a que o servidor registrou.
    localStorage.setItem("last_local_save_time", ultima_sinc);

    // Reseta estados de controle
    hasUnsavedChanges = false;
    CloudSync.pending = false;

    closeModals();

    // 5. Feedback e Recarregamento
    // Usar um pequeno delay garante que o localStorage terminou de escrever
    dispararAlertaReload("Nuvem sincronizada com sucesso!", 1);
}

async function persistirSnapshotTotal() {
    const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
    if (!chave || !chave.includes("_key_")) return;

    try {
        console.log("☁️ Consultando estado da nuvem antes de salvar...");

        // 1. Gera o hash do que temos LOCALMENTE agora
        const hashLocal = await gerarHashLocal();

        // 2. Consulta o status na nuvem
        const responseStatus = await fetch(`${BASE_URL_SYNC}/nuvem/check-status`, {
            headers: { "authorization": chave }
        });

        if (responseStatus.ok) {
            const status = await responseStatus.json();
            // Se o hash da nuvem for igual ao local, encerramos por aqui
            if (status.metadata && status.metadata.hash === hashLocal) {
                console.log("✅ Nuvem já está atualizada (Hashes coincidem).");
                CloudSync.pending = false;
                return true;
            }
        }

        // 3. Se os hashes forem diferentes, enviamos os dados
        console.log("📤 Enviando atualizações para o Firestore...");
        const fullJson = await getDadosJsonLocais();
        const responseSync = await fetch(`${BASE_URL_SYNC}/nuvem/sync`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "authorization": chave
            },
            body: JSON.stringify({
                full_json: fullJson,
                version: app_version,
                hash: hashLocal
            })
        });

        if (!responseSync.ok) throw new Error("Falha no upload");

        const result = await responseSync.json();
        localStorage.setItem("last_local_save_time", result.server_time);
        CloudSync.pending = false;
        console.log("✅ Snapshot sincronizado com sucesso no Firestore.");

        return true;

    } catch (err) {
        console.error("❌ Erro na persistência:", err.message);
        return false;
    }
}

async function enableEditMode(rowId) {
    const tr = document.getElementById(rowId);
    if (!tr) {
        return;
    }
    tr.classList.add('is-editing');
    try {
        const translationModule = await import('./ckeditor5/translations/pt-br.js');
        if (translationModule && translationModule.default) {
            window.CKEDITOR_TRANSLATIONS = window.CKEDITOR_TRANSLATIONS || {};
            window.CKEDITOR_TRANSLATIONS['pt-br'] = translationModule.default['pt-br'];
        }
        const { ClassicEditor, Essentials, Paragraph, Underline, Bold, Italic, FontFamily, FontSize, FontColor, FontBackgroundColor, Link, AutoLink, List, Undo, TodoList } = await import('ckeditor5');
        ClassicEditor.create(tr.querySelector('.val-obs-editor'), {
            licenseKey: 'GPL',
            plugins: [Essentials, Paragraph, Bold, Italic, Underline, FontFamily, FontSize, FontColor, FontBackgroundColor, Link, AutoLink, List, TodoList, Undo],
            toolbar: ['undo', 'redo', '|', 'bold', 'italic', 'underline', '|', 'fontSize', 'fontFamily', 'fontColor', 'fontBackgroundColor', '|', 'link', 'todoList', 'bulletedList', 'numberedList'],
            language: 'pt-br'
        }).then(editor => {
            activeEditors[rowId] = editor;
            setUnsavedChanges(true);
        });
    } catch (e) { console.error("Editor error:", e); }
}

async function enableEditModeAllRows() {
    if (isProcessingUI) return;
    if (hasUnsavedChanges) {
        await saveAllRows();
    }

    isProcessingUI = true;
    setButtonsState(true); // 🔒 Bloqueia tudo

    try {
        const rows = document.querySelectorAll('#tableBody tr');
        for (const tr of rows) {
            if (tr.id && tr.id.startsWith('row_')) {
                await enableEditMode(tr.id);
            }
        }
    } catch (err) {
        console.error("Erro ao abrir edição:", err);
    } finally {
        isProcessingUI = false;
        setButtonsState(false); // 🔓 Libera tudo
    }
}

async function saveAllRows() {
    if (!currentMateria || isProcessingUI) return;

    // 1. Limpeza dos Editores (Se houver linhas em edição)
    if (document.querySelectorAll('.is-editing').length > 0) {
        isProcessingUI = true;
        try {
            const ids = Object.keys(activeEditors);
            for (const id of ids) {
                if (activeEditors[id]) {
                    try {
                        await activeEditors[id].destroy();
                    } catch (e) {
                        console.warn(`Erro ao destruir editor ${id}:`, e);
                    }
                    delete activeEditors[id];
                }
            }
            document.querySelectorAll('.is-editing').forEach(tr => tr.classList.remove('is-editing'));
        } catch (err) {
            console.error("Erro ao fechar editores:", err);
        } finally {
            isProcessingUI = false;
        }
    }

    // 2. Verificação de necessidade de salvamento
    // Importante: hasUnsavedChanges deve ser verdadeiro se houve edição 
    // ou se o CloudSync.pending está true
    if (!hasUnsavedChanges) return;

    try {
        isProcessingUI = true;

        // --- SALVAMENTO LOCAL ---
        saveData();         // Grava os dados da matéria atual no LocalStorage
        saveColumnNames();  // Grava as preferências de colunas
        loadRows();         // Atualiza a visualização da tabela

        setUnsavedChanges(false);

        // --- SALVAMENTO NA NUVEM (SNAPSHOT TOTAL) ---
        // Aqui integramos a persistência atômica que revisamos antes
        const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
        if (chave && chave.includes("_key_")) {
            // Chamamos a função que verifica o hash antes de fazer o upload
            await persistirSnapshotTotal();
        }

        exibirAlerta("Tudo salvo e sincronizado!", "success");

    } catch (err) {
        console.error("Falha no processo de persistência:", err);
        exibirAlerta("Erro ao salvar ou sincronizar dados", "danger");
    } finally {
        isProcessingUI = false;
    }
}
// Função que o botão da tabela chama
function abrirModalLimpeza() {
    if (!currentMateria || isProcessingUI) return;

    // Pega as colunas visíveis para mostrar no texto do modal
    const rawConfig = localStorage.getItem(CONFIG_PREFIX + currentMateria);
    const defaults = { t: "Teoria", e1: "Ex. 1", e2: "Ex. 2", e3: "Ex. 3", e4: "Ex. 4", e5: "Rev. 1", e6: "Rev. 2" };
    let cfg = {}; try { if (rawConfig) cfg = JSON.parse(rawConfig); } catch (e) { }

    const colunasVisiveis = getVisibleColumns();
    const nomesVisiveisArr = colunasVisiveis.map(k => cfg[k] || defaults[k]);

    // Pegamos apenas as 2 primeiras
    let textoExibicao = nomesVisiveisArr.slice(0, 2).join(", ");

    // Se houver mais de 2 colunas, adicionamos o "etc."
    if (nomesVisiveisArr.length > 2) {
        textoExibicao += ", etc.";
    }
    document.getElementById('textoConfirmacaoLimpeza').innerHTML =
        `Deseja marcar como concluídas as tarefas atrasadas em <strong>${currentMateria}</strong>?`;

    // Reseta o checkbox global sempre que abre
    document.getElementById('checkLimpezaGlobal').checked = false;

    const modal = new bootstrap.Modal(document.getElementById('modalConfirmarLimpeza'));

    // Configura o clique do botão de confirmação dentro do modal
    document.getElementById('btnConfirmarLimpezaAcao').onclick = async () => {
        const global = document.getElementById('checkLimpezaGlobal').checked;
        modal.hide();
        await executarLimpezaPrazos(global);
        CloudSync.pending = true;
    };

    modal.show();
}

// A lógica de execução real
async function executarLimpezaPrazos(isGlobal) {
    isProcessingUI = true;
    setButtonsState(true);

    await mostrarOverlay();

    try {
        await new Promise(r => setTimeout(r, 200));
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const colunasProgresso = ['t', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'];

        // Decide quais matérias processar
        const listaParaProcessar = isGlobal
            ? JSON.parse(localStorage.getItem(LIST_KEY) || "[]")
            : [currentMateria];

        let totalItensMarcados = 0;
        let houveQualquerMudanca = false;

        listaParaProcessar.forEach(materia => {
            const dadosLocais = JSON.parse(localStorage.getItem(PREFIX + materia) || "[]");
            let mudouNestaMateria = false;

            const novosDados = dadosLocais.map(item => {
                const dataTarefa = new Date(item.data + 'T12:00:00');
                dataTarefa.setHours(0, 0, 0, 0);

                if (dataTarefa < hoje) {
                    //1.Colunas das tarefas Teoria, ex1, etc
                    colunasProgresso.forEach(col => {
                        if (!item[col]) {
                            item[col] = true;
                            mudouNestaMateria = true;
                            houveQualquerMudanca = true;
                            totalItensMarcados++;
                        }
                    });

                    // 2.Marcar os Checkboxes da Todo List nas Observações
                    let conteudoObs = item.obs || "";

                    if (conteudoObs.includes('type="checkbox"')) {
                        // Esta Regex encontra checkboxes que NÃO possuem a palavra 'checked' logo após
                        // e insere o atributo checked="checked"
                        const novaObs = conteudoObs.replace(
                            /<input\s+type="checkbox"(?![^>]*checked)/g,
                            '<input type="checkbox" checked="checked"'
                        );

                        if (novaObs !== conteudoObs) {
                            item.obs = novaObs;
                            mudouNestaMateria = true;
                            houveQualquerMudanca = true;
                        }
                    }
                }
                return item;
            });

            if (mudouNestaMateria) {
                localStorage.setItem(PREFIX + materia, JSON.stringify(novosDados));
            }
        });

        if (houveQualquerMudanca) {
            loadRows();
            saveAllRows();
            let msg = isGlobal ? `Sucesso! Todas as tarefas estão em dia.` : `Sucesso! As tarefas de ${currentMateria} estão em dia.`;
            exibirAlerta(`${msg}`, "success");
        } else {
            exibirAlerta("Nenhuma tarefa atrasada encontrada.", "info");
        }

    } catch (err) {
        console.error(err);
        exibirAlerta("Erro ao processar limpeza.", "danger");
    } finally {
        await esconderOverlay();
        isProcessingUI = false;
        setButtonsState(false);
    }
}

function addEmptyRow() {
    if (!currentMateria) return;
    const intervalo = parseInt(document.getElementById('inputIntervaloDias').value) || 0;
    let proximaData = new Date().toISOString().split('T')[0];
    const rows = Array.from(document.querySelectorAll('#tableBody tr'));
    const datas = rows.map(tr => tr.querySelector('.val-data')?.value).filter(d => d);
    if (datas.length > 0) {
        let dataBase = new Date(datas.sort().reverse()[0] + 'T12:00:00');
        dataBase.setDate(dataBase.getDate() + intervalo);
        proximaData = dataBase.toISOString().split('T')[0];
    }
    let uid = gerarUID({ data: Date.now().toString() + Math.random().toString(36).substr(2, 5), conteudo: "vazio" });
    let tr_new = createRow(uid, proximaData, "", false, false, false, false, false, false, false, "", true);
    setTimeout(() => {
        const input = tr_new.querySelector('.val-conteudo');
        if (input) { tr_new.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus(); }
    }, 50);
    setUnsavedChanges(true);
}

function loadIntervalConfig() {
    const rawConfig = localStorage.getItem(CONFIG_PREFIX + currentMateria);
    let intervalo = 7;
    if (rawConfig) {
        const cfg = JSON.parse(rawConfig);
        if (cfg.intervalo !== undefined) intervalo = cfg.intervalo;
    }
    document.getElementById('inputIntervaloDias').value = intervalo;
    document.getElementById('checkRepetirIntervalo').checked = false;
}

function deleteRow(i) {
    const tr = i.closest('tr');
    rowToDelete = tr;
    isDeletingFullMateria = false;
    document.getElementById('msgConfirmacaoExclusao').innerHTML = `Deseja excluir o conteúdo <br><strong>${tr.querySelector('.val-conteudo').value || "este item"}</strong>?`;
    new bootstrap.Modal(document.getElementById('modalConfirmarExclusao')).show();
}

function executeRowDeletion(tr) { tr.remove(); saveData(); rowToDelete = null; }


async function updateMateriaName() {
    const input = document.getElementById('materiaTitulo');
    const newVal = input.value.trim();
    const oldVal = currentMateria;
    // Se o nome for vazio ou igual ao atual, não faz nada
    if (!newVal || newVal === oldVal) return;

    let list = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");

    // Busca normalizada para detectar colisões de "Case" (Ex: Inglês vs INGLÊS)
    const nomeConflitante = list.find(m => m.toLowerCase() === newVal.toLowerCase());

    // --- 1. EXTRAÇÃO TOTAL PARA MEMÓRIA (RAM) ---
    // Pegamos tudo o que existe nas chaves envolvidas ANTES de deletar qualquer coisa
    const dadosOrigem = localStorage.getItem(PREFIX + oldVal);
    const configOrigem = localStorage.getItem(CONFIG_PREFIX + oldVal);
    const interOrigem = localStorage.getItem('config_intervalo_dias_' + oldVal);

    let dadosDestino = null;
    let configDestino = null;

    if (nomeConflitante) {
        dadosDestino = localStorage.getItem(PREFIX + nomeConflitante);
        configDestino = localStorage.getItem(CONFIG_PREFIX + nomeConflitante);
    }

    // --- 2. CONFIRMAÇÃO DE MESCLAGEM ---
    // Se não for apenas mudança de Case (ex: Bio -> BIO), e o destino já existe com outro nome
    if (nomeConflitante && nomeConflitante.toLowerCase() !== oldVal.toLowerCase()) {
        if (!confirm(`⚠️ A matéria "${nomeConflitante}" já existe. Deseja MESCLAR os conteúdos?`)) {
            input.value = oldVal;
            return;
        }
    }

    // --- 3. LIMPEZA DOS REGISTROS ANTIGOS ---
    localStorage.removeItem(PREFIX + oldVal);
    localStorage.removeItem(CONFIG_PREFIX + oldVal);
    localStorage.removeItem('config_intervalo_dias_' + oldVal);

    if (nomeConflitante) {
        localStorage.removeItem(PREFIX + nomeConflitante);
        localStorage.removeItem(CONFIG_PREFIX + nomeConflitante);
    }

    // --- 4. PROCESSAMENTO LOGÍSTICO ---
    let arrayFinal = JSON.parse(dadosOrigem || "[]");

    if (dadosDestino) {
        let arrayDestino = JSON.parse(dadosDestino || "[]");

        // Mesclagem via UID para evitar duplicatas
        arrayFinal.forEach(itemOrigem => {
            itemOrigem.data = higienizarData(itemOrigem.data);
            const uidOrigem = itemOrigem.uid || gerarUID(itemOrigem);
            const idx = arrayDestino.findIndex(d => (d.uid || gerarUID(d)) === uidOrigem);

            if (idx !== -1) {
                arrayDestino[idx] = itemOrigem; // Sobrescreve com o dado mais recente
            } else {
                arrayDestino.push(itemOrigem); // Adiciona novo
            }
        });
        arrayFinal = arrayDestino;
    }

    arrayFinal.sort((a, b) => a.data.localeCompare(b.data));

    // --- 5. GRAVAÇÃO FINAL ---
    // Agora gravamos na chave com a grafia NOVA desejada pelo usuário
    localStorage.setItem(PREFIX + newVal, JSON.stringify(arrayFinal));

    // Preservamos a configuração (preferimos a do destino se houver, ou a da origem)
    const configParaSalvar = configDestino || configOrigem;
    if (configParaSalvar) localStorage.setItem(CONFIG_PREFIX + newVal, configParaSalvar);
    if (interOrigem) localStorage.setItem('config_intervalo_dias_' + newVal, interOrigem);

    // --- 6. ATUALIZAÇÃO DA LISTA MESTRE ---
    // Removemos qualquer rastro dos nomes antigos (independente de case) e add o novo
    list = list.filter(m => m.toLowerCase() !== oldVal.toLowerCase() && m.toLowerCase() !== newVal.toLowerCase());
    list.push(newVal);
    list = [...new Set(list)].sort();

    localStorage.setItem(LIST_KEY, JSON.stringify(list));
    localStorage.setItem('last_active', newVal);
    currentMateria = newVal;

    // --- 8. ATUALIZAÇÃO DA INTERFACE ---
    updateSelect(); // Atualiza o dropdown de matérias
    loadRows();     // Recarrega a tabela com os dados ordenados
    exibirAlerta(`Matéria "${newVal}" atualizada!`, "success");
}

function confirmarNovaMateria() {
    const nom = document.getElementById('novoNomeMateria').value.trim();
    if (nom) {
        let l = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");

        // Verifica se o nome já existe (ignorando maiúsculas/minúsculas)
        const existe = l.some(m => m.toLowerCase() === nom.toLowerCase());

        if (!existe) {
            l.push(nom);
            localStorage.setItem(LIST_KEY, JSON.stringify(l));
            switchMateria(nom);
        } else {
            // Se já existe, apenas troca para a matéria existente em vez de criar duplicada
            const nomeOriginal = l.find(m => m.toLowerCase() === nom.toLowerCase());
            exibirAlerta(`A matéria "${nomeOriginal}" já existe.`, "warning");
            switchMateria(nomeOriginal);
        }

        bootstrap.Modal.getInstance(document.getElementById('modalNovaMateria')).hide();
        document.getElementById('novoNomeMateria').value = ""; // Limpa o campo
    }
}

function updateSelect() {
    const sel = document.getElementById('materiaSelect');
    const l = JSON.parse(localStorage.getItem(LIST_KEY) || "[]").sort();
    sel.innerHTML = '<option value="">*** Matéria ***</option>' + l.map(m => `<option value="${m}">${m}</option>`).join('');
    sel.value = currentMateria;
    const titulo = document.getElementById('materiaTitulo');
    if (titulo && sel) sel.style.width = (titulo.offsetWidth + 40) + "px";
}

function deleteFullMateria() {
    const selectMateria = document.getElementById('materiaSelect');
    const nomeNoSelect = selectMateria.value;

    // 1. Validação de Segurança: Se não há nada selecionado no dropdown, cancela.
    if (!nomeNoSelect || !currentMateria) {
        exibirAlerta("Nenhuma matéria selecionada para exclusão.", "warning");
        return;
    }

    // 2. Sincronização: Se o que está no select é diferente da variável global,
    // forçamos a sincronização ou impedimos a exclusão para evitar erros.
    if (nomeNoSelect !== currentMateria) {
        console.warn("Inconsistência detectada: Select:", nomeNoSelect, "Global:", currentMateria);
        // Em vez de bloquear, podemos perguntar se o usuário quer trocar para a matéria do select
        const confirmarTroca = confirm(`⚠️ A matéria selecionada (${nomeNoSelect}) é diferente da ativa (${currentMateria}).\n\nDeseja carregar e excluir "${nomeNoSelect}"?`);

        if (confirmarTroca) {
            switchMateria(nomeNoSelect);
        } else {
            return;
        }
    }

    // 3. Preparação do Modal (Se passou nas travas acima)
    isDeletingFullMateria = true;
    rowToDelete = null;

    // Injeta o nome confirmado no HTML do modal
    document.getElementById('msgConfirmacaoExclusao').innerHTML =
        `<div class="p-4 text-center">
                                    <div class="mb-4">
                                        <i class="bi bi-exclamation-triangle text-danger" style="font-size: 3rem;"></i>
                                    </div>
                                    <h6 class="fw-bold text-uppercase text-danger mb-3">ATENÇÃO</h6>
                                    <p>
                                        Você está prestes a excluir a matéria <strong>${currentMateria}</strong><br><br>

                                        Esta ação apagará TODOS os conteúdos e notas associadas. Você precisará
                                        restaurar a matéria de um backup anterior caso queira recuperá-la. Tenha certeza
                                        de que deseja prosseguir.
                                    </p>
                                </div>`;

    new bootstrap.Modal(document.getElementById('modalConfirmarExclusao')).show();
}

function executeFullMateriaDeletion() {
    localStorage.removeItem(PREFIX + currentMateria);
    localStorage.removeItem(CONFIG_PREFIX + currentMateria);
    let l = JSON.parse(localStorage.getItem(LIST_KEY) || "[]").filter(m => m !== currentMateria);
    localStorage.setItem(LIST_KEY, JSON.stringify(l));
    switchMateria("");
    closeModals();
}


function checkInterfaceState() {
    const chave = localStorage.getItem("config_vBorda_chave_contribuinte") || "";
    const hasM = !!currentMateria;

    // 1. Botões básicos da tabela (Salvar, Editar, Excluir)
    ['btnSalvarTudo', 'btnEditarTudo', 'btnExcluirMateria'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !hasM;
    });

    const btnAdd = document.querySelector('button[onclick="addEmptyRow()"]');
    if (btnAdd) btnAdd.disabled = !hasM;

    const tit = document.getElementById('materiaTitulo');
    if (tit) tit.disabled = !hasM;

    // 2. Elementos que requerem Chave de Contribuinte
    const btnAuth = document.getElementById('btn-google-auth');
    const btExport = document.getElementById('btn-google-export');
    const btImport = document.getElementById('btn-google-import');
    const btnIaContainer = document.getElementById('container-btn-ia');
    const btnbtnForceCloudRestore = document.getElementById('btn-force-cloud-restore');
    const driveTab = document.getElementById('drive-tab');
    const iaTab = document.getElementById('ia-tab');




    if (chave.trim() !== "" && chave.includes("_key_")) {
        // MOSTRAR elementos de contribuição
        if (driveTab) driveTab.style.setProperty('display', 'block', 'important');
        if (iaTab) iaTab.style.setProperty('display', 'block', 'important');
        if (btnAuth) btnAuth.style.setProperty('display', 'block', 'important');
        if (btExport) btExport.style.setProperty('display', 'block', 'important');
        if (btImport) btImport.style.setProperty('display', 'block', 'important');
        if (btnbtnForceCloudRestore) btnbtnForceCloudRestore.style.setProperty('display', 'block', 'important');
        // Se o botão de IA estiver no HTML com um ID específico:
        const btnIa = document.querySelector('button[onclick="acionarIA()"]');
        if (btnIa) btnIa.style.display = 'inline-block';

        // Lógica de cores do Token Google
        if (accessToken) {
            btnAuth.classList.replace('text-dark', 'text-primary');
            btnAuth.title = "Google Drive Conectado";
            btnAuth.style.backgroundColor = "#d4edda";
            btExport.disabled = false;
            btImport.disabled = false;
        } else {
            btnAuth.classList.replace('text-primary', 'text-dark');
            btnAuth.title = "Conectar Google Drive";
            btnAuth.style.backgroundColor = "";
            btExport.disabled = true;
            btImport.disabled = true;
        }
    } else {
        if (driveTab) driveTab.style.display = 'none';
        if (iaTab) iaTab.style.display = 'none';
        if (btnAuth) btnAuth.style.display = 'none';
        if (btExport) btExport.style.display = 'none';
        if (btImport) btImport.style.display = 'none';
        if (btnbtnForceCloudRestore) btnbtnForceCloudRestore.style.display = 'none';

        const btnIa = document.querySelector('button[onclick="acionarIA()"]');
        if (btnIa) btnIa.style.display = 'none';
    }

}

function setUnsavedChanges(h) {
    hasUnsavedChanges = h;
    const b = document.getElementById('btnSalvarTudo');
    if (b) h ? b.classList.add('btn-save-alert') : b.classList.remove('btn-save-alert');
}

function exportBackup() {
    const list = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
    const allData = {}, configs = {};
    list.forEach(m => {
        allData[m] = JSON.parse(localStorage.getItem(PREFIX + m) || "[]");
        configs[m] = JSON.parse(localStorage.getItem(CONFIG_PREFIX + m) || "null");
    });
    const blob = new Blob([JSON.stringify({ app: "Cronograma", version: app_version, list, allData, configs })], { type: "application/json" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const dataLocal = new Date().toLocaleDateString('pt-BR').split('/').reverse().join('-');
    a.download = `backup_cronograma_${dataLocal}.json`;
    a.click();
}

function closeModals() {
    document.querySelectorAll('.modal.show').forEach(m => bootstrap.Modal.getInstance(m)?.hide());
}

function openImportModal(input) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            tempImportData = JSON.parse(e.target.result);
            bootstrap.Modal.getInstance(document.getElementById('modalConfig')).hide();
            new bootstrap.Modal(document.getElementById('modalImport')).show();
        } catch (err) { exibirAlerta("JSON inválido.", "danger"); }
    };
    reader.readAsText(input.files[0]);
}

// --- 📥 CONFIRMAR IMPORTAÇÃO (Unificado com lógica UID) ---
async function confirmImport(mode, isSilent = false) {
    if (!tempImportData) return;

    // Pergunta apenas se NÃO for um processo de nuvem (onde o usuário já escolheu no modal)
    if (!isSilent) {
        if (mode === 'replace') {
            if (!confirm("⚠️ APAGAR TUDO e substituir pelo backup?")) return;
        } else {
            if (!confirm("⚠️ Incluir os conteúdos novos e substituir os existentes?")) return;
        }
    }

    // 2. Dispara o Overlay e o Snapshot
    mostrarOverlay();
    //Dá tempo para o navegador iniciar a animação
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        // Pequena pausa (100ms) para garantir que o navegador renderize o overlay na tela
        await new Promise(resolve => setTimeout(resolve, 100));

        await criarSnapshotEmergencial();

        let currentList = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");

        if (mode === 'replace') {
            // LIMPEZA TOTAL
            currentList.forEach(m => {
                localStorage.removeItem(PREFIX + m);
                localStorage.removeItem(CONFIG_PREFIX + m);
            });

            currentList = tempImportData.list || [];

            for (let m in tempImportData.allData) {
                const processados = tempImportData.allData[m].map(item => {
                    item.data = higienizarData(item.data);
                    item.uid = item.uid || gerarUID(item);
                    return item;
                });
                processados.sort((a, b) => a.data.localeCompare(b.data));
                localStorage.setItem(PREFIX + m, JSON.stringify(processados));

                if (tempImportData.configs?.[m]) {
                    localStorage.setItem(CONFIG_PREFIX + m, JSON.stringify(tempImportData.configs[m]));
                }
            }
        } else {
            // LÓGICA DE MERGE (Mesclagem)
            for (let m in tempImportData.allData) {
                if (!currentList.includes(m)) currentList.push(m);

                let locais = JSON.parse(localStorage.getItem(PREFIX + m) || "[]");

                tempImportData.allData[m].forEach(imp => {
                    const uid = imp.uid || gerarUID(imp);
                    imp.data = higienizarData(imp.data);
                    imp.uid = uid;
                    const idx = locais.findIndex(d => (d.uid || gerarUID(d)) === uid);
                    if (idx !== -1) {
                        locais[idx] = imp;
                    } else {
                        locais.push(imp);
                    }
                });

                locais.sort((a, b) => a.data.localeCompare(b.data));
                localStorage.setItem(PREFIX + m, JSON.stringify(locais));
            }
        }

        localStorage.setItem(LIST_KEY, JSON.stringify([...new Set(currentList)]));

        // --- SINCRONIA PÓS-IMPORTAÇÃO ---
        const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
        if (chave && chave.includes("_key_")) {
            console.log("📤 Dados importados localmente. Sincronizando nova mesclagem com a nuvem...");
            await persistirSnapshotTotal();
        }

        // Se for nuvem, o reload será disparado pela função chamadora após alinhar o timestamp
        if (!isSilent) {
            dispararAlertaReload("Importação concluída!", 2);
        }

    } catch (err) {
        console.error("Erro na importação:", err);
        exibirAlerta("Falha crítica ao importar dados.", "danger");
    }
    finally {
        await esconderOverlay();
        closeModals();
    }
}

function prepararEscolhaImport() {
    if (!tempImportData || !tempImportData.allData) { exibirAlerta("Arquivo inválido.", "danger"); return };

    const lista = document.getElementById('listaEscolherImport');
    const selectFiltro = document.getElementById('filtroMateriaImport');

    lista.innerHTML = "";
    selectFiltro.innerHTML = '<option value="">Todas as Matérias</option>'; // Reseta o filtro

    // Fecha o modal de escolha inicial
    const modalIni = bootstrap.Modal.getInstance(document.getElementById('modalImport'));
    if (modalIni) modalIni.hide();

    let totalItens = 0;
    const materiasNoJson = Object.keys(tempImportData.allData).sort();

    // Preenche o Select de matérias do filtro
    materiasNoJson.forEach(materia => {
        const opt = document.createElement('option');
        opt.value = materia;
        opt.innerText = materia;
        selectFiltro.appendChild(opt);

        // Preenche a tabela com todos os itens inicialmente
        tempImportData.allData[materia].forEach((item, index) => {
            totalItens++;
            const tr = document.createElement('tr');
            tr.setAttribute('data-materia-row', materia);
            tr.setAttribute('data-conteudo-row', (item.conteudo || "").toLowerCase());

            tr.innerHTML = `
                <td class="text-center">
                    <input class="form-check-input check-item-import" type="checkbox" 
                        data-materia="${materia}" data-index="${index}">
                </td>
                <td class="small">${formatDateToBR(item.data)}</td>
                <td class="small fw-bold text-primary">${materia}</td>
                <td class="small">${item.conteudo || '<span class="text-muted italic">Sem título</span>'}</td>
            `;

            tr.style.cursor = "pointer";
            tr.onclick = (e) => {
                if (e.target.type !== 'checkbox') {
                    const cb = tr.querySelector('.check-item-import');
                    cb.checked = !cb.checked;
                }
            };
            lista.appendChild(tr);
        });
    });

    document.getElementById('infoQtdImport').innerText = `${totalItens} itens no arquivo`;
    document.getElementById('checkMarcarTodosImport').checked = false;
    document.getElementById('buscaConteudoImport').value = "";

    new bootstrap.Modal(document.getElementById('modalEscolherImport')).show();
}

// Função para filtrar as linhas visíveis
function filtrarTabelaImport() {
    const filtroMateria = document.getElementById('filtroMateriaImport').value;
    const buscaTexto = document.getElementById('buscaConteudoImport').value.toLowerCase();
    const linhas = document.querySelectorAll('#listaEscolherImport tr');
    let visiveis = 0;

    document.getElementById('checkMarcarTodosImport').checked = false;

    linhas.forEach(tr => {
        const mat = tr.getAttribute('data-materia-row');
        const cont = tr.getAttribute('data-conteudo-row');
        const cb = tr.querySelector('.check-item-import');

        const combinaMateria = filtroMateria === "" || mat === filtroMateria;
        const combinaTexto = buscaTexto === "" || cont.includes(buscaTexto);

        if (combinaMateria && combinaTexto) {
            tr.style.display = "";
            visiveis++;
        } else {
            tr.style.display = "none";
            // CRÍTICO: Desmarca o checkbox de linhas que foram escondidas pelo filtro
            if (cb) cb.checked = false;
        }
    });

    document.getElementById('infoQtdImport').innerText = `${visiveis} itens visíveis`;
}

// Função Marcar/Desmarcar Todos
function toggleTodosImport(source) {
    // Selecionamos apenas as linhas que NÃO estão com display: none
    const linhasVisiveis = document.querySelectorAll('#listaEscolherImport tr:not([style*="display: none"])');

    linhasVisiveis.forEach(tr => {
        const cb = tr.querySelector('.check-item-import');
        if (cb) cb.checked = source.checked;
    });
}

async function criarSnapshotEmergencial() {
    const listRaw = localStorage.getItem(LIST_KEY);
    if (!listRaw) return;
    const list = JSON.parse(listRaw);
    const backup = {
        timestamp: new Date().toLocaleString(),
        list,
        data: {},
        configs: {}
    };
    list.forEach(m => {
        backup.data[m] = JSON.parse(localStorage.getItem(PREFIX + m) || "[]");
        backup.configs[m] = JSON.parse(localStorage.getItem(CONFIG_PREFIX + m) || "null");
    });
    localStorage.setItem("EMERGENCY_BACKUP_V1", JSON.stringify(backup));
    verificarBotaoPanico();
    console.log("📸 Snapshot de segurança criado.");
}

function filtrarHTML(str) {
    const temp = document.createElement('div');
    temp.innerHTML = String(str || "");
    return temp.textContent || temp.innerText || "";
}

async function executarImportacaoSeletiva() {
    const selecionados = document.querySelectorAll('.check-item-import:checked');
    if (!selecionados.length) {
        exibirAlerta("Selecione ao menos um item.", "warning");
        return;
    }

    if (!confirm(`⚠️ Confirma importação dos ${selecionados.length} itens selecionados?`)) return;

    mostrarOverlay();
    //Dá tempo para o navegador iniciar a animação
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        // Pequena pausa para UI respirar
        await new Promise(r => setTimeout(r, 300));

        await criarSnapshotEmergencial();

        let currentList = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");

        selecionados.forEach(cb => {
            const materia = cb.getAttribute('data-materia');
            const index = cb.getAttribute('data-index');

            // Recupera o item vindo da IA ou arquivo
            const itemParaImportar = tempImportData.allData?.[materia]?.[index];

            if (!itemParaImportar || typeof itemParaImportar.conteudo === 'undefined') return;

            // 1. Garantia de que o item ganhe um UID (essencial para dados vindos da IA)
            const novoUID = itemParaImportar.uid || gerarUID(itemParaImportar);
            itemParaImportar.uid = novoUID;

            // 2. Garantia da matéria na lista mestra
            if (!currentList.includes(materia)) {
                currentList.push(materia);
                if (tempImportData.configs?.[materia]) {
                    localStorage.setItem(CONFIG_PREFIX + materia, JSON.stringify(tempImportData.configs[materia]));
                }
            }

            let dadosLocais = JSON.parse(localStorage.getItem(PREFIX + materia) || "[]");

            // 3. Lógica de Upsert baseada no UID gerado
            const idxExistente = dadosLocais.findIndex(d => (d.uid || gerarUID(d)) === novoUID);

            // Sanitização dos textos para evitar lixo HTML
            const itemSanitizado = {
                ...itemParaImportar,
                data: higienizarData(filtrarHTML(itemParaImportar.data)),
                conteudo: filtrarHTML(itemParaImportar.conteudo)
            };

            if (idxExistente !== -1) {
                // Sobrescreve se já existir
                dadosLocais[idxExistente] = itemSanitizado;
            } else {
                // Adiciona se for novo
                dadosLocais.push(itemSanitizado);
            }

            // ORDENAÇÃO ANTES DE GRAVAR:
            dadosLocais.sort((a, b) => new Date(a.data) - new Date(b.data));
            localStorage.setItem(PREFIX + materia, JSON.stringify(dadosLocais));
        });

        // Se esta importação manual nasceu de um conflito de sincronia (opção 'pick')
        if (window.sincroniaPendenteAposEscolha) {
            localStorage.setItem("last_local_save_time", window.sincroniaPendenteAposEscolha);
            window.sincroniaPendenteAposEscolha = null; // Limpa a flag para a próxima vez
            console.log("⏰ Relógio local alinhado após escolha manual da nuvem.");
        }

        // Atualiza a lista mestra sem duplicatas
        localStorage.setItem(LIST_KEY, JSON.stringify([...new Set(currentList)]));

        // --- SINCRONIA PÓS-ESCOLHA ---
        const chave = localStorage.getItem("config_vBorda_chave_contribuinte");
        if (chave && chave.includes("_key_")) {
            // Se veio de um conflito de nuvem (pick), já temos o timestamp oficial
            if (window.sincroniaPendenteAposEscolha) {
                localStorage.setItem("last_local_save_time", window.sincroniaPendenteAposEscolha);
                window.sincroniaPendenteAposEscolha = null;
            }

            // Sobe a nova versão mesclada para a nuvem
            await persistirSnapshotTotal();
        }
        dispararAlertaReload("Seleção importada e sincronizada!", 1);

    } catch (err) {
        console.error(err);
        await esconderOverlay();
        exibirAlerta("Falha crítica na gravação dos dados.", "danger");
    }
}


// ==========================================
// 🛡️ PREVENÇÃO DE PERDA DE DADOS (Auto-Save)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    // Aqui a ideia é simples: toda vez que o usuário tentar imprimir ou abrir o modal de "Sobre", a função saveAllRows() é chamada para garantir que nada fique perdido. Além disso, há um timer que verifica se existem mudanças não salvas a cada 30 segundos, e se já passaram 5 minutos desde a última mudança, ele salva automaticamente.
    // 1. Botão Imprimir
    const btnPrint = document.querySelector('button[onclick="window.print()"]');
    if (btnPrint) {
        btnPrint.removeAttribute('onclick'); // Removemos o atributo antigo
        btnPrint.addEventListener('click', () => {
            saveAllRows();
            // Preenche os dados no cabeçalho de impressão
            const printMateria = document.getElementById('print-materia-name');

            // Se houver uma matéria ativa, usa o nome dela, senão coloca "Geral"
            if (printMateria) printMateria.innerText = currentMateria || "Geral";

            const footerMateria = document.querySelector('.footer-materia-name');
            if (footerMateria) footerMateria.innerText = currentMateria || "Geral";

            window.print();
        });
    }


    // 3. Botão Sobre (Abre o Modal)
    const btnAbout = document.querySelector('button[data-bs-target="#modalAbout"]');
    if (btnAbout) {
        btnAbout.addEventListener('click', () => {
            saveAllRows();
        });
    }


});

// ==========================================
// ⏱️ SALVAMENTO AUTOMÁTICO (5 MINUTOS)
// ==========================================
let unsavedStartTime = null;

// Verifica o status do salvamento a cada 30 segundos
setInterval(() => {
    if (hasUnsavedChanges && unsavedStartTime && (Date.now() - unsavedStartTime >= 300000)) {
        saveAllRows();
        unsavedStartTime = null;
    } else if (hasUnsavedChanges && !unsavedStartTime) {
        unsavedStartTime = Date.now();
    }
}, 30000);

function initTokenClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: '749297806019-h4pgn5kdb4rdij99m3vd8ksi53l4ad3h.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file email openid',
        callback: (res) => {
            if (res.access_token) {
                console.log("Token tipo:", typeof res.access_token);
                console.log("Início do token:", res.access_token.substring(0, 10));
                accessToken = res.access_token;
                sessionStorage.setItem('google_access_token', accessToken);
                exibirAlerta("Conectado ao Drive.", "success");
                checkInterfaceState();
            }
        }
    });
}

// Inicia o monitoramento (chame isso dentro do window.onload)
function iniciarMonitoramentoRemoto() {
    // Verifica a cada 2 minutos (60000ms * 2) - Equilíbrio entre real-time e economia
    setInterval(async () => {
        const chave = localStorage.getItem("config_vBorda_chave_contribuinte");

        // SÓ CHECA SE:
        // 1. Tem chave configurada
        // 2. O usuário NÃO está editando nada agora (evita sustos)
        // 3. Não há uma operação de salvamento/IA em curso
        if (!chave || isProcessingUI || Object.keys(activeEditors).length > 0) return;

        try {
            const response = await fetch(`${BASE_URL_SYNC}/nuvem/check-status`, {
                headers: { "authorization": chave }
            });

            if (!response.ok) return;
            const res = await response.json();

            if (res.status === "success" && res.metadata) {
                const hashNuvem = res.metadata.hash;
                const hashLocal = await gerarHashLocal();

                // Se os conteúdos divergirem
                if (hashNuvem && hashLocal !== hashNuvem) {
                    const dataNuvem = new Date(res.metadata.ultima_sinc).getTime();
                    const dataLocal = new Date(localStorage.getItem("last_local_save_time")).getTime();

                    // Se a nuvem for realmente mais nova (margem de 10s para segurança)
                    if (dataNuvem > (dataLocal + 10000)) {
                        exibirAvisoMudancaExterna(res.metadata.ultima_sinc);
                    }
                }
            }
        } catch (e) {
            console.log("☁️ Falha silenciosa no check de background.");
        }
    }, 120000);
}

function exibirAvisoMudancaExterna(dataSinc) {
    if (document.getElementById('alerta-nuvem-externa')) return;

    const dataFormatada = new Date(dataSinc).toLocaleTimeString();
    const alerta = document.createElement('div');
    alerta.id = 'alerta-nuvem-externa';

    // Estilização fixa no topo, estilo "toast" moderno
    alerta.className = 'alert alert-primary position-fixed top-0 start-50 translate-middle-x mt-3 shadow-lg d-flex align-items-center';
    alerta.style.zIndex = "10001";
    alerta.style.minWidth = "300px";
    alerta.style.borderLeft = "5px solid #0d6efd";

    alerta.innerHTML = `
        <div class="me-auto">
            <i class="bi bi-cloud-arrow-down-fill me-2"></i>
            <strong>Nuvem atualizada às ${dataFormatada}</strong>
            <div class="small opacity-75">Outro dispositivo salvou mudanças.</div>
        </div>
        <button class="btn btn-sm btn-primary ms-3 fw-bold" onclick="location.reload()">ATUALIZAR</button>
        <button class="btn-close ms-2" onclick="this.parentElement.remove()" style="font-size: 0.7rem;"></button>
    `;

    document.body.append(alerta);
}

function solicitarAcessoDrive() {
    if (!tokenClient) initTokenClient();
    tokenClient.requestAccessToken();
}

async function getDadosJsonLocais() {
    await saveAllRows();
    const list = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
    const allData = {}, configs = {};
    list.forEach(m => {
        allData[m] = JSON.parse(localStorage.getItem(PREFIX + m) || "[]");
        configs[m] = JSON.parse(localStorage.getItem(CONFIG_PREFIX + m) || "null");
    });
    return { app: "Cronograma", version: app_version, list, allData, configs };
}

async function exportarParaGoogleDrive() {
    const chaveContribuinte = localStorage.getItem("config_vBorda_chave_contribuinte");
    if (!chaveContribuinte) {
        exibirAlerta("Configure sua Chave de Acesso primeiro.", "warning");
        return;
    }

    if (!confirm("⚠️ O backup atual no Google Drive será sobrescrito. Continuar?")) return;

    const btn = document.activeElement;
    const originalContent = btn.innerHTML;

    mostrarOverlay();
    //Dá tempo para o navegador iniciar a animação
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        await saveAllRows(); // Garante que dados atuais estão no localStorage
        const dadosLocais = await getDadosJsonLocais();

        const payloadParaPython = {
            cronograma_json: dadosLocais, // Deve bater com o nome na classe SyncRequest
            google_token: accessToken  // Deve bater com o nome na classe SyncRequest
        };


        const response = await fetch(`${BASE_URL_SYNC}/drive/exportar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "authorization": chaveContribuinte
            },
            body: JSON.stringify(payloadParaPython)
        });

        if (!response.ok) {
            const erroData = await response.json();

            // Se o backend enviou o erro de e-mail incompatível (403)
            if (response.status === 403) {
                // erroData.detail contém: "O e-mail do Google Drive não coincide..."
                exibirAlerta(`${erroData.detail}`, "danger");
                return;
            }

            throw new Error(erroData.detail || "Erro ao exportar");
        }

        const res = await response.json();
        if (res.status === "success") {
            exibirAlerta("Backup realizado com sucesso no Drive!", "success");
            closeModals();
        } else {
            throw new Error(res.message || "Erro no processamento remoto.");
        }
    } catch (error) {
        console.error("Erro exportação:", error);
        exibirAlerta(`Falha: ${error.message}`, "danger");
    } finally {
        await esconderOverlay();
    }
}

async function restaurarGoogleDrive() {
    // 1. Validação de Token
    if (!accessToken) {
        exibirAlerta("Por favor, faça login no Google primeiro (Botão Sincronizar).", "warning");
        return;
    }

    const btnOriginal = document.activeElement;
    const originalText = btnOriginal?.innerHTML;

    // Criamos o backup local ANTES de qualquer operação de rede
    await criarSnapshotEmergencial();

    mostrarOverlay();
    //Dá tempo para o navegador iniciar a animação
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        // Respiro para o UI renderizar o overlay
        await new Promise(resolve => setTimeout(resolve, 300));

        if (btnOriginal && btnOriginal.tagName === "BUTTON") {
            btnOriginal.disabled = true;
            btnOriginal.innerHTML = '<i class="fas fa-cloud-download-alt fa-spin"></i> Buscando...';
        }

        const chaveContribuinte = localStorage.getItem("config_vBorda_chave_contribuinte");

        const response = await fetch(`${BASE_URL_SYNC}/drive/importar`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "authorization": chaveContribuinte },
            body: JSON.stringify({
                google_token: accessToken // O nome da chave aqui deve ser igual ao da classe TokenRequest
            })
        });

        if (!response.ok) {
            const erroData = await response.json();

            // Se o backend enviou o erro de e-mail incompatível (403)
            if (response.status === 403) {
                // erroData.detail contém: "O e-mail do Google Drive não coincide..."
                exibirAlerta(`${erroData.detail}`, "danger");
                return;
            }

            throw new Error(erroData.detail || "Erro ao exportar");
        }

        if (response.status === 400 || response.status === 401) {
            accessToken = null; // Limpa o token inválido
            sessionStorage.removeItem('google_access_token');

            throw new Error("Sua sessão do Google expirou. Por favor, clique em 'Conectar Google Drive'.");
        }
        if (!response.ok) throw new Error(`Erro no servidor: ${response.status}`);

        const res = await response.json();

        if (res.status === "success" && res.data) {
            tempImportData = res.data;

            // Fecha modais abertos para limpar a tela para o próximo passo
            closeModals();

            // Abre o modal de decisão (Mesclar ou Sobrescrever)
            const modalImport = new bootstrap.Modal(document.getElementById('modalImport'));
            modalImport.show();

        } else {
            throw new Error(res.detail || "Nenhum dado de backup encontrado no Drive.");
        }

    } catch (err) {
        console.error("Erro na restauração:", err);
        exibirAlerta(`Falha: ${err.message}`, "danger");
    } finally {
        // Garantimos que o overlay saia se algo der errado
        await esconderOverlay();

        if (btnOriginal && btnOriginal.tagName === "BUTTON") {
            btnOriginal.disabled = false;
            btnOriginal.innerHTML = originalText;
        }
    }
}

// ======================================================================
// 🌍 EXPOSIÇÃO DE FUNÇÕES PARA O ESCOPO GLOBAL (window)
// Necessário pois o arquivo é um Módulo (type="module")
// ======================================================================

// --- Controles de Interface e Modais ---
window.prepararConfiguracoes = prepararConfiguracoes;
window.acionarIA = acionarIA;
window.solicitarAcessoDrive = solicitarAcessoDrive;
window.abrirModalLimpeza = abrirModalLimpeza;

// --- Gestão de Matérias ---
window.switchMateria = switchMateria;
window.confirmarNovaMateria = confirmarNovaMateria;
window.deleteFullMateria = deleteFullMateria;
window.updateMateriaName = updateMateriaName;

// --- Operações na Tabela ---
window.saveAllRows = saveAllRows;
window.enableEditModeAllRows = enableEditModeAllRows;
window.addEmptyRow = addEmptyRow;
window.deleteRow = deleteRow;
window.toggleCheck = toggleCheck;

// --- Sincronização e Conflitos ---
window.resolverConflitoNuvem = resolverConflitoNuvem;
window.confirmarRestauracaoForcadaNuvem = confirmarRestauracaoForcadaNuvem;

// --- Importação e Exportação ---
window.exportBackup = exportBackup;
window.openImportModal = openImportModal;
window.confirmImport = confirmImport;
window.prepararEscolhaImport = prepararEscolhaImport;
window.filtrarTabelaImport = filtrarTabelaImport;
window.toggleTodosImport = toggleTodosImport;
window.executarImportacaoSeletiva = executarImportacaoSeletiva;

// --- Configurações e Preferências ---
window.applyVisibility = applyVisibility;
window.syncFromModal = syncFromModal;
window.syncModalLabels = syncModalLabels;

// --- Segurança e Recuperação ---
window.saveChaveContribuinte = saveChaveContribuinte;
window.restaurarSnapshotEmergencial = restaurarSnapshotEmergencial;
window.fecharModalRestoreForcado = fecharModalRestoreForcado;
window.fecharModalChaveInvalida = fecharModalChaveInvalida;
window.fecharModalErroSync = fecharModalErroSync;
window.fecharModalTroca = fecharModalTroca;
window.fecharModalConsentimento = fecharModalConsentimento;

// --- Integrações Cloud ---
window.exportarParaGoogleDrive = exportarParaGoogleDrive;
window.restaurarGoogleDrive = restaurarGoogleDrive;

console.log("🚀 Funções expostas ao escopo global com sucesso.");