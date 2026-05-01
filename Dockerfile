FROM python:3.11-slim
WORKDIR /app

# Evita que o Python gere arquivos .pyc dentro do container
ENV PYTHONDONTWRITEBYTECODE 1
# Garante que os logs do servidor apareçam em tempo real no console do Google
ENV PYTHONUNBUFFERED 1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY prompt_template.txt .

CMD uvicorn main:app --host 0.0.0.0 --port $PORT
