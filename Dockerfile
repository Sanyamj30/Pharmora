FROM python:3.12-slim

# Prevent python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements/project metadata
COPY pyproject.toml ./
COPY shared ./shared

# Install custom shared library first
RUN pip install --no-cache-dir -e ./shared

# Install general dependencies
RUN pip install --no-cache-dir .

# Copy the entire workspace
COPY . .

# Expose default port
EXPOSE 8000
