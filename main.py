import os
import datetime
import json
import re
import io
import time
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

def extrair_texto(file_content, filename):
    ext = filename.split('.')[-1].lower()
    if ext == 'html':
        soup = BeautifulSoup(file_content, 'html.parser')
        return soup.get_text(separator=' ')
    elif ext == 'pdf':
        pdf_file = io.BytesIO(file_content)
        reader = PdfReader(pdf_file)
        return "".join([p.extract_text() for p in reader.pages if p.extract_text()])
    else:
        return file_content.decode("utf-8", errors="ignore")

@app.post("/processar")
async def processar(file: UploadFile = File(...), authorization: str = Header(None)):
    # Carrega os dados atualizados do disco a cada tentativa de login
    db_atualizado = carregar_db()
    
    print(f"DEBUG: Recebido Header Authorization -> {authorization}")

    # 1. Validação de Existência da Chave
    if authorization not in CONTRIBUINTES_AUTORIZADOS:
        print(f"🚫 Acesso negado: Chave '{authorization}' não encontrada.")
        raise HTTPException(status_code=403, detail="Chave inválida.")

    user = CONTRIBUINTES_AUTORIZADOS[authorization]
    
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
        print(f"🚀 {user['nome']} disparando IA ({target_model})")

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
        print(f"📈 Uso atual de {user['nome']}: {user['uso']}/{user['limite']}")

        res_text = response.text.strip()
        
        # 1. Tenta extrair apenas o que está entre chaves { } se a IA mandou lixo fora
        match = re.search(r'\{.*\}', res_text, re.DOTALL)
        if match:
            json_str = match.group(0)
        else:
            json_str = res_text

        # 2. Remove os backticks de markdown que a IA adora colocar
        json_str = json_str.replace('```json', '').replace('```', '').strip()
        return json.loads(json_str)
        
    except Exception as e:
        print(f"❌ Erro na IA: {e}")
        return {"error": "Falha na IA", "details": str(e)}

if __name__ == "__main__":
    import uvicorn
    # Inicia o servidor local
    uvicorn.run(app, host="127.0.0.1", port=8000)