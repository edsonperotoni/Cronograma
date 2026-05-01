import datetime
import io
import json
import os
import re
import time

import httpx
import pandas as pd  # suporte arquivo de Excel e CSV
from bs4 import BeautifulSoup
from docx import Document  # suporte arquivo de Word
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# SDK Moderno
from google import genai
from google.cloud import firestore
from google.genai import types
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from pydantic import BaseModel
from PyPDF2 import PdfReader

# O ID do projeto
PROJECT_ID = "cronograma-backend"

# Inicializa o cliente de forma limpa
# Localmente: ele usará o ADC
# Na Nuvem: ele usará a conta de serviço do Cloud Run
db_firestore = firestore.Client(project=PROJECT_ID)

app = FastAPI()

# --- CONFIGURAÇÃO DE SEGURANÇA CORS DINÂMICA ---
# Buscamos as origens de uma variável de ambiente.
# Se não existir, usamos o localhost como padrão de segurança.
env_origins = os.environ.get("ALLOWED_ORIGINS")

if env_origins:
    # Espera uma string separada por vírgulas: "https://site1.com,https://site2.com"
    ORIGENS_PERMITIDAS = [origin.strip() for origin in env_origins.split(",")]
else:
    # Fallback para desenvolvimento local no seu CachyOS
    ORIGENS_PERMITIDAS = [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]

REGEX_CHAVE = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}+_key_[a-zA-Z0-9]+$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENS_PERMITIDAS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
    allow_credentials=True,
)


async def obter_email_google(token: str):
    """Verifica o token com o Google e retorna o e-mail logado."""
    if not token:
        return None
    token = token.replace('"', "").replace("'", "").strip()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = "https://www.googleapis.com/oauth2/v3/userinfo"
            response = await client.get(url, params={"access_token": token})
            if response.status_code != 200:
                return None
            return response.json().get("email", "").lower().strip()
    except Exception:
        return None


async def validar_usuario(authorization: str, exige_cota: bool = False):
    """
    Centraliza todas as validações de segurança e regras de negócio.
    Retorna os dados do usuário e a referência do documento se tudo estiver OK.
    """
    if not authorization:
        raise HTTPException(
            status_code=401, detail="Chave de contribuinte não fornecida."
        )

    # 1. Busca no Firestore
    user_ref = db_firestore.collection("usuarios").document(authorization)
    user_doc = user_ref.get()
    authorization = authorization.strip()

    if not re.match(REGEX_CHAVE, authorization, re.IGNORECASE):
        print(f"🛑 Formato inválido interceptado: {authorization[:15]}")
        raise HTTPException(
            status_code=400, detail="O formato da chave de contribuinte é inválido."
        )

    if not user_doc.exists:
        print(f"🚫 Chave inválida: {authorization[:10]}...")
        raise HTTPException(status_code=403, detail="Chave de contribuinte inválida.")

    user_data = user_doc.to_dict()

    # 2. Verificação de Ativo
    if not user_data.get("ativo", True):
        raise HTTPException(
            status_code=403, detail="Esta chave de contribuinte está desativada."
        )

    # 3. Verificação de Expiração (Robusta para String ou Datetime)
    raw_expira = user_data.get("expira", "2026-12-31")
    try:
        if isinstance(raw_expira, str):
            data_expira = datetime.datetime.strptime(
                raw_expira.split("T")[0], "%Y-%m-%d"
            )
        else:
            data_expira = raw_expira.replace(tzinfo=None)

        if datetime.datetime.now() > data_expira:
            raise HTTPException(
                status_code=403, detail="Sua chave de contribuinte expirou."
            )
    except Exception:
        raise HTTPException(
            status_code=500, detail="Erro ao validar data de expiração."
        )

    # 4. Verificação de Cota (Opcional, pois o sync não gasta cota, só o processar)
    if exige_cota:
        uso = user_data.get("uso", 0)
        limite = user_data.get("limite", 0)
        if uso >= limite:
            raise HTTPException(status_code=403, detail="Sua cota de IA chegou ao fim.")

    return user_data, user_ref


# --- FUNÇÃO PARA CARREGAR O PROMPT EXTERNO ---
def carregar_prompt(ano_atual, hoje, conteudo_extraido):
    with open("prompt_template.txt", "r", encoding="utf-8") as f:
        template = f.read()
    return template.format(
        ano_atual=ano_atual, hoje=hoje, conteudo_extraido=conteudo_extraido
    )


# --- TRADUTOR DE FORMATOS ATUALIZADO ---
def extrair_conteudo(file_content, filename):
    """Extrai texto de diversos formatos. Lança erro 400 se falhar."""
    ext = filename.split(".")[-1].lower()

    try:
        # imagens analisa o binário diretamente.
        if ext in ["jpg", "jpeg", "png"]:
            return None
        elif ext == "html":
            soup = BeautifulSoup(file_content, "html.parser")
            return soup.get_text(separator=" ")

        elif ext == "pdf":
            pdf_file = io.BytesIO(file_content)
            reader = PdfReader(pdf_file)
            # LIMITADOR: Pegar apenas as primeiras 5
            paginas_para_ler = reader.pages[:5]

            texto = "".join(
                [p.extract_text() for p in paginas_para_ler if p.extract_text()]
            )
            return texto if texto.strip() else None  # Se PDF for imagem, retorna None

        elif ext == "docx":
            docx_file = io.BytesIO(file_content)
            doc = Document(docx_file)
            return "\n".join([para.text for para in doc.paragraphs])

        elif ext in ["xlsx", "xls"]:
            excel_file = io.BytesIO(file_content)
            # Lê a primeira aba do Excel
            df = pd.read_excel(excel_file)
            return df.to_markdown(index=False)

        elif ext == "csv":
            csv_file = io.BytesIO(file_content)
            # Tenta detectar se o CSV usa vírgula ou ponto e vírgula
            try:
                df = pd.read_csv(csv_file, sep=None, engine="python")
            except Exception:
                csv_file.seek(0)
                df = pd.read_csv(csv_file, sep=";")
            return df.to_markdown(index=False)
        else:
            # Para .txt e outros formatos de texto puro
            return file_content.decode("utf-8", errors="ignore")
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao processar o conteúdo do arquivo {filename}.",
        )


# --- MODELOS DE DADOS ---
class ValidarChaveRequest(BaseModel):
    chave: str


class SyncRequest(BaseModel):
    cronograma_json: dict
    google_token: str  # Campo obrigatório para receber o token do Frontend


# Modelo para receber o Snapshot Total
class SyncPayload(BaseModel):
    full_json: dict
    version: str


class TokenRequest(BaseModel):
    google_token: str


@app.post("/validar-contribuinte")
async def consultar_status_chave(req: ValidarChaveRequest):
    """Retorna os dados para o dashboard 'renderizarStatusIA' do frontend."""
    # O validar_usuario já cuida de lançar 400 ou 403 se a chave for ruim
    user_data, _ = await validar_usuario(req.chave, exige_cota=False)

    # Prepara a data de expiração para o JS
    expira = user_data.get("expira", "2026-12-31")
    expira_limpa = expira if isinstance(expira, str) else expira.strftime("%Y-%m-%d")

    return {
        "status": "success",
        "valido": True,
        "nome": user_data.get("nome", "Usuário"),
        "uso_atual": user_data.get("uso", 0),
        "cota_maxima": user_data.get("limite", 0),
        "expiracao": expira_limpa,
    }


# --- ROTA DE EXPORTAÇÃO (GOOGLE DRIVE) ---
@app.post("/drive/exportar")
async def exportar_para_drive(req: SyncRequest, authorization: str = Header(None)):
    # 1. Validação Centralizada no Firestore (Chave, Ativo, Expiração)
    # Não passamos exige_cota=True aqui pois exportar não deve gastar créditos de IA
    user_data, _ = await validar_usuario(authorization)

    # 2. VALIDAÇÃO DE IDENTIDADE CRUZADA 🛡️
    # (acesso de chave em dicionário)
    email_google = await obter_email_google(req.google_token)
    email_firestore = user_data.get("email", "").lower().strip()

    if not email_firestore:
        # Se o email não estiver no documento, tentamos extrair da própria chave
        # Já que sua chave segue o padrão email_key_...
        if "_key_" in authorization:
            email_firestore = authorization.split("_key_")[0].lower().strip()

    # Limpeza final para comparação justa
    email_firestore = email_firestore.lower().strip() if email_firestore else ""
    email_google = email_google.lower().strip() if email_google else ""

    if not email_google or email_google != email_firestore:
        raise HTTPException(
            status_code=403,
            detail="O e-mail do Google Drive não coincide com o dono desta chave.",
        )

    try:
        # 2. Configura as credenciais usando o token enviado pelo Frontend
        creds = Credentials(token=req.google_token)
        service = build("drive", "v3", credentials=creds)

        # 3. Preparação do arquivo binário (JSON)
        json_bytes = json.dumps(
            req.cronograma_json, indent=4, ensure_ascii=False
        ).encode("utf-8")
        buffer = io.BytesIO(json_bytes)

        # Usamos o e-mail que está no Firestore para nomear o arquivo
        nome_arquivo = f"Backup_Cronograma_{user_data.get('email', 'usuario')}.json"

        file_metadata = {
            "name": nome_arquivo,
            "mimeType": "application/json",
        }

        media = MediaIoBaseUpload(buffer, mimetype="application/json", resumable=True)

        # 4. Verifica se o arquivo já existe no Drive para atualizar ou criar
        query = f"name = '{nome_arquivo}' and trashed = false"
        results = service.files().list(q=query, fields="files(id)").execute()
        files = results.get("files", [])

        if files:
            file_id = files[0]["id"]
            service.files().update(fileId=file_id, media_body=media).execute()
            status = "atualizado"
        else:
            service.files().create(
                body=file_metadata, media_body=media, fields="id"
            ).execute()
            status = "criado"

        return {
            "status": "success",
            "message": f"Backup {status} no Google Drive de {user_data['nome']}!",
        }
    except HTTPException:
        # Re-levanta erros de negócio (403, 404)
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro na API do Google: {str(e)}")


# --- ROTA PARA BUSCAR BACKUP DO DRIVE (IMPORTAR) ---
@app.post("/drive/importar")
async def importar_do_drive(req: TokenRequest, authorization: str = Header(None)):
    # 1. Validação Centralizada no Firestore
    user_data, _ = await validar_usuario(authorization)

    # 2. VALIDAÇÃO DE IDENTIDADE CRUZADA 🛡️
    # (acesso de chave em dicionário)
    email_google = await obter_email_google(req.google_token)
    email_firestore = user_data.get("email", "").lower().strip()

    if not email_firestore:
        # Se o email não estiver no documento, tentamos extrair da própria chave
        # Já que sua chave segue o padrão email_key_...
        if "_key_" in authorization:
            email_firestore = authorization.split("_key_")[0].lower().strip()

    # Limpeza final para comparação justa
    email_firestore = email_firestore.lower().strip() if email_firestore else ""
    email_google = email_google.lower().strip() if email_google else ""

    if not email_google or email_google != email_firestore:
        raise HTTPException(
            status_code=403,
            detail="O e-mail do Google Drive não coincide com o dono desta chave.",
        )

    google_token = req.google_token
    if not google_token:
        raise HTTPException(status_code=400, detail="Token do Google ausente.")

    try:
        creds = Credentials(token=google_token)
        service = build("drive", "v3", credentials=creds)

        # 2. Busca o arquivo pelo nome associado ao e-mail do Firestore
        nome_arquivo = f"Backup_Cronograma_{user_data.get('email', 'usuario')}.json"
        query = f"name = '{nome_arquivo}' and trashed = false"
        results = service.files().list(q=query, fields="files(id)").execute()
        files = results.get("files", [])

        if not files:
            # Retornamos sucesso mas com aviso, para o frontend tratar
            return {
                "status": "error",
                "message": "Nenhum backup encontrado no seu Google Drive.",
            }

        # 3. Baixa o conteúdo do arquivo
        file_id = files[0]["id"]
        content = service.files().get_media(fileId=file_id).execute()

        # 4. Decodifica o JSON
        backup_json = json.loads(content.decode("utf-8"))

        return {"status": "success", "data": backup_json}

    except HTTPException:
        # Re-levanta erros de negócio (403, 404)
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Erro ao acessar Google Drive: {str(e)}"
        )


# rota para importar matérias com IA
@app.post("/processar")
async def processar(file: UploadFile = File(...), authorization: str = Header(None)):
    # Chama a validação centralizada exigindo cota
    user_data, user_ref = await validar_usuario(authorization, exige_cota=True)

    # 0.Definir limite (ex: 5MB)
    MAX_FILE_SIZE = 5 * 1024 * 1024

    # 2. Verificar o tamanho do arquivo
    # O objeto 'file' do UploadFile tem o atributo 'size' em versões recentes do FastAPI
    if file.size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, detail="Arquivo muito grande. O limite é 5MB."
        )

    # 4. Processamento do arquivo
    content = await file.read()
    conteudo_extraido = extrair_conteudo(content, file.filename)

    hoje = datetime.date.today().isoformat()
    ano_atual = datetime.date.today().year

    try:
        target_model = "gemini-2.5-flash"

        # Inicializa o Cliente Google GenAI
        client = genai.Client(
            api_key=os.environ.get("GEMINI_API_KEY"), http_options={"api_version": "v1"}
        )

        response = None
        for tentativa in range(5):
            try:
                # --- LÓGICA DE DECISÃO: TEXTO OU IMAGEM ---
                if conteudo_extraido is None:
                    # SE NÃO TEM TEXTO (Imagem ou PDF de imagem), envia o BINÁRIO direto
                    prompt_config = carregar_prompt(
                        ano_atual,
                        hoje,
                        "Siga as instruções para analisar a imagem anexa.",
                    )
                    # Ajuste dinâmico de MIME Type
                    mime_atual = file.content_type

                    # Pequena "blindagem": se o arquivo for imagem mas o mime vier estranho
                    if file.filename.lower().endswith((".png", ".jpg", ".jpeg")):
                        if "image" not in mime_atual:
                            mime_atual = "image/jpeg"  # Força um padrão de imagem
                    # O SDK moderno do Google GenAI aceita o binário assim:
                    conteudo_ia = [
                        prompt_config,
                        types.Part.from_bytes(data=content, mime_type=mime_atual),
                    ]
                else:
                    # SE TEM TEXTO, envia o PROMPT formatado
                    conteudo_ia = carregar_prompt(ano_atual, hoje, conteudo_extraido)

                response = client.models.generate_content(
                    model=target_model,
                    contents=conteudo_ia,
                    config=types.GenerateContentConfig(temperature=0.1),
                )
                break
            except Exception as e:
                if "503" in str(e) and tentativa < 4:
                    time.sleep(tentativa + 2)
                else:
                    raise e

        if not response:
            raise Exception("Falha ao obter resposta da IA.")

        # 5. Sucesso: Incrementa uso e salva banco
        try:
            user_ref.update({"uso": firestore.Increment(1)})
        except Exception as e:
            print(f"⚠️ Erro ao atualizar contador: {e}")

        res_text = response.text.strip()

        # Limpeza de JSON (Markdown Guard)
        match = re.search(r"\{.*\}", res_text, re.DOTALL)
        json_str = match.group(0) if match else res_text
        # 2. Remove os backticks de markdown que a IA adora colocar
        json_str = json_str.replace("```json", "").replace("```", "").strip()

        # Converte para objeto Python para validar se o JSON está ok
        dados_da_ia = json.loads(json_str)

        return dados_da_ia

    except HTTPException:
        # Re-levanta erros de negócio (403, 404)
        raise
    except Exception as e:
        return {"error": "Falha na IA", "details": str(e)}


# --- ROTA DE SINCRONIZAÇÃO AUTOMÁTICA (FIRESTORE) ---
# Rota para o Front disparar o "Save" para a Nuvem
@app.post("/nuvem/sync")
async def sync_total_snapshot(req: SyncPayload, authorization: str = Header(None)):
    user_data, _ = await validar_usuario(
        authorization
    )  # Validação básica de chave e data

    try:
        # No Firestore, o ID do documento será a própria CHAVE do usuário
        doc_ref = db_firestore.collection("snapshots").document(authorization)

        doc_ref.set(
            {
                "payload": req.full_json,
                "metadata": {
                    "ultima_sinc": firestore.SERVER_TIMESTAMP,
                    "versao_app": req.version,
                },
            }
        )
        return {"status": "success"}
    except Exception:
        raise HTTPException(status_code=500, detail="Erro interno ao salvar.")


# Rota para o Front verificar se há algo novo ao carregar a página
@app.get("/nuvem/restore")
async def restore_from_cloud(authorization: str = Header(None)):
    await validar_usuario(authorization)  # Valida se ainda é contribuinte

    doc = db_firestore.collection("snapshots").document(authorization).get()

    if doc.exists:
        res = doc.to_dict()
        # Converte o objeto de data do Google para string ISO (o JS ama isso)
        if "ultima_sinc" in res["metadata"]:
            res["metadata"]["ultima_sinc"] = res["metadata"]["ultima_sinc"].isoformat()
        return {"status": "success", "data": res}

    return {"status": "error", "message": "Nenhum dado na nuvem."}


if __name__ == "__main__":
    import uvicorn

    # Localmente usa 8000, no Cloud Run usa a variável PORT
    port = int(os.environ.get("PORT", 8000))
    # Localmente usa 127.0.0.1, no Cloud Run usa 0.0.0.0
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    uvicorn.run(app, host=host, port=port)
