FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia apenas os arquivos necessários para o backend
COPY main.py .
COPY contribuintes_db.json .
COPY prompt_template.txt .

# Usamos o formato de shell para que o python possa ler a variável $PORT
CMD uvicorn main:app --host 0.0.0.0 --port $PORT