FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia apenas os arquivos necessários para o backend
COPY main.py .
COPY contribuintes_db.json .
COPY prompt_template.txt .

# Se você tiver pastas de bibliotecas locais ou outros assets de lógica, adicione-os aqui
# COPY pasta_da_logica/ ./pasta_da_logica/

CMD ["uvicorn", "main.py:app", "--host", "0.0.0.0", "--port", "8080"]