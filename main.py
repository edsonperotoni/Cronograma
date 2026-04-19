import os
import datetime
import json
import re
import io
import time
import pandas as pd #suporte arquivo de Excel e CSV
from docx import Document # suporte arquivo de Word
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from bs4 import BeautifulSoup
from PyPDF2 import PdfReader

# SDK Moderno
from google import genai
from google.genai import types

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- BANCO DE DADOS LOCAL (JSON) ---
DB_FILE = "contribuintes_db.json"

def carregar_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            return json.load(f)
    else:
        return {}

def salvar_db(dados):
    with open(DB_FILE, "w") as f:
        json.dump(dados, f, indent=4)

# Carrega os contribuintes na memória ao iniciar
CONTRIBUINTES_AUTORIZADOS = carregar_db()

# Inicializa o Cliente Google GenAI
client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
    http_options={'api_version': 'v1'}
)

# --- FUNÇÃO PARA CARREGAR O PROMPT EXTERNO ---
def carregar_prompt(ano_atual, hoje, texto_extraido):
    with open("prompt_template.txt", "r", encoding="utf-8") as f:
        template = f.read()
    return template.format(ano_atual=ano_atual, hoje=hoje, texto_extraido=texto_extraido)

# --- TRADUTOR DE FORMATOS ATUALIZADO ---
def extrair_texto(file_content, filename):
    ext = filename.split('.')[-1].lower()
    
    try:
        if ext == 'html':
            soup = BeautifulSoup(file_content, 'html.parser')
            return soup.get_text(separator=' ')
            
        elif ext == 'pdf':
            pdf_file = io.BytesIO(file_content)
            reader = PdfReader(pdf_file)
            return "".join([p.extract_text() for p in reader.pages if p.extract_text()])
            
        elif ext == 'docx':
            docx_file = io.BytesIO(file_content)
            doc = Document(docx_file)
            return "\n".join([para.text for para in doc.paragraphs])
            
        elif ext in ['xlsx', 'xls']:
            excel_file = io.BytesIO(file_content)
            # Lê a primeira aba do Excel
            df = pd.read_excel(excel_file)
            # Converte para Markdown: a IA entende tabelas assim com precisão cirúrgica
            return df.to_markdown(index=False)
            
        elif ext == 'csv':
            csv_file = io.BytesIO(file_content)
            # Tenta detectar se o CSV usa vírgula ou ponto e vírgula
            try:
                df = pd.read_csv(csv_file, sep=None, engine='python')
            except:
                csv_file.seek(0)
                df = pd.read_csv(csv_file, sep=';')
            return df.to_markdown(index=False)
            
        else:
            # Para .txt e outros formatos de texto puro
            return file_content.decode("utf-8", errors="ignore")
            
    except Exception as e:
        print(f"❌ Erro ao extrair {filename}: {e}")
        return f"Erro ao processar o arquivo {filename}."

@app.post("/processar")
async def processar(file: UploadFile = File(...), authorization: str = Header(None)):
    # Carrega os dados atualizados do disco a cada tentativa de login
    db_atualizado = carregar_db()
    
    print(f"DEBUG: Tentativa de acesso com chave: {authorization[:5]}***")

    # 1. Validação de Existência da Chave
    if authorization not in db_atualizado:
        print(f"🚫 Acesso negado: Tentativa com chave inválida ({authorization[:5]}***)")
        raise HTTPException(status_code=403, detail="Chave inválida.")

    user = db_atualizado[authorization]
    nome_usuario = user.get("nome", "Desconhecido") # Pega o nome do JSON
    print(f"👤 Usuário identificado: {nome_usuario}")
    
    # 2. Validação de Expiração
    data_expira = datetime.datetime.strptime(user["expira"], "%Y-%m-%d")
    if datetime.datetime.now() > data_expira:
        print(f"⚠️ Acesso bloqueado (Expirado): {user['nome']}")
        raise HTTPException(status_code=403, detail="Sua chave de contribuinte expirou.")

    # 3. Validação de Cota de Uso
    if user["uso"] >= user["limite"]:
        print(f"🚫 Cota esgotada: {user['nome']} ({user['uso']}/{user['limite']})")
        raise HTTPException(status_code=403, detail="Sua cota de IA chegou ao fim.")

    # 4. Processamento do arquivo
    content = await file.read()
    texto_extraido = extrair_texto(content, file.filename)

    hoje = datetime.date.today().isoformat()
    ano_atual = datetime.date.today().year

    # Agora o prompt é carregado do arquivo externo
    try:
        prompt_final = carregar_prompt(ano_atual, hoje, texto_extraido)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Template de prompt não encontrado no servidor.")

    try:
        target_model = 'gemini-2.5-flash' 
        print(f"🚀 {user['nome']} disparando IA para arquivo: {file.filename}")

        response = None
        for tentativa in range(5):
            try:
                response = client.models.generate_content(
                    model=target_model,
                    contents=prompt_final,
                    config=types.GenerateContentConfig(temperature=0.1)
                )
                break 
            except Exception as e:
                if "503" in str(e) and tentativa < 4:
                    print(f"⚠️ Servidor ocupado, tentativa {tentativa + 1}...")
                    time.sleep(tentativa + 2)
                else:
                    raise e
        
        if not response:
            raise Exception("Falha ao obter resposta da IA.")

        # 5. Sucesso: Incrementa uso e salva banco
        user["uso"] += 1
        salvar_db(db_atualizado)

        res_text = response.text.strip()
        
        # Limpeza de JSON (Markdown Guard)
        match = re.search(r'\{.*\}', res_text, re.DOTALL)
        json_str = match.group(0) if match else res_text
        # 2. Remove os backticks de markdown que a IA adora colocar
        json_str = json_str.replace('```json', '').replace('```', '').strip()

        # Converte para objeto Python para validar se o JSON está ok
        dados_da_ia = json.loads(json_str)

        print(f"📈 Uso atual de {user['nome']}: {user['uso']}/{user['limite']}")

        return dados_da_ia
        
    except Exception as e:
        print(f"❌ Erro na IA: {e}")
        return {"error": "Falha na IA", "details": str(e)}

if __name__ == "__main__":
    import uvicorn
    # Localmente usa 8000, no Cloud Run usa a variável PORT
    port = int(os.environ.get("PORT", 8000))
    # Localmente usa 127.0.0.1, no Cloud Run usa 0.0.0.0
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    uvicorn.run(app, host=host, port=port)