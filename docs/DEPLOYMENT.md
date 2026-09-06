# 🚀 Руководство по развёртыванию Zcord

Это подробное руководство по развёртыванию мессенджера Zcord в различных окружениях.

## 📋 Содержание

- [Системные требования](#системные-требования)
- [Локальное развёртывание](#локальное-развёртывание)
- [Production развёртывание](#production-развёртывание)
- [Облачное развёртывание](#облачное-развёртывание)
- [Мониторинг и логирование](#мониторинг-и-логирование)
- [Резервное копирование](#резервное-копирование)
- [Масштабирование](#масштабирование)

## 💻 Системные требования

### Минимальные требования

**Для разработки:**

- CPU: 2 ядра
- RAM: 4 GB
- Диск: 10 GB свободного места
- Podman: 4.0+
- Podman Compose: 1.0+

**Для production:**

- CPU: 4 ядра
- RAM: 8 GB
- Диск: 50 GB SSD
- Podman: 4.0+
- Podman Compose: 1.0+
- Reverse proxy (Nginx/Traefik)

### Поддерживаемые операционные системы

- ✅ Ubuntu 20.04+
- ✅ CentOS 8+
- ✅ Debian 11+
- ✅ macOS 12+
- ✅ Windows 10+ (с WSL2)

## 🏠 Локальное развёртывание

### Быстрый старт

1. **Клонирование репозитория:**

```bash
git clone <repository-url>
cd Zcord-main
```

2. **Проверка Docker:**

```bash
podman --version
podman-compose --version
```

3. **Запуск:**

```bash
# Production режим
podman-compose -f podman-compose.yml up -d

# Development режим
podman-compose -f podman-compose.dev.yml up -d
```

4. **Проверка статуса:**

```bash
podman-compose -f podman-compose.yml ps
```

### Настройка переменных окружения

Создайте файл `server/.env`:

```env
# JWT секретный ключ (обязательно измените!)
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# URL подключения к базе данных
DATABASE_URL=postgres://zcord:<POSTGRES_PASSWORD>@postgres:5432/zcord?sslmode=disable

# Режим работы (development/production)
APP_ENV=development

# Порт backend сервера
SERVER_PORT=8000

# CORS настройки
CORS_ORIGIN=http://localhost:3000
```

### Проверка работоспособности

```bash
# Проверка frontend
curl -I http://localhost:3000

# Проверка backend API
curl -I http://localhost:8000/api/register

# Проверка базы данных
podman-compose -f podman-compose.yml exec postgres psql -U zcord -d zcord -c "SELECT version();"
```

## 🌐 Production развёртывание

### Подготовка сервера

1. **Обновление системы:**

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

2. **Установка Docker:**

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y podman podman-compose

# CentOS/RHEL
sudo dnf install -y podman podman-compose

# Или через пакетный менеджер
curl -fsSL https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_20.04/Release.key | sudo apt-key add -
echo "deb https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_20.04/ /" | sudo tee /etc/apt/sources.list.d/devel:kubic:libcontainers:stable.list
sudo apt update
sudo apt install -y podman podman-compose
```

3. **Настройка Podman:**

```bash
# Настройка rootless режима
echo "$USER:100000:65536" | sudo tee -a /etc/subuid
echo "$USER:100000:65536" | sudo tee -a /etc/subgid

# Перезагрузка для применения изменений
sudo systemctl reboot
```

### Настройка production окружения

1. **Создание production .env:**

```bash
cp server/.env.example server/.env
```

Отредактируйте `server/.env`:

```env
JWT_SECRET=VERY-STRONG-SECRET-KEY-MINIMUM-32-CHARACTERS
DATABASE_URL=postgres://zcord_user:STRONG_DB_PASSWORD@postgres:5432/zcord?sslmode=disable
APP_ENV=production
SERVER_PORT=8000
CORS_ORIGIN=https://yourdomain.com
```

2. **Создание production docker-compose:**

```yaml
# podman-compose.prod.yml
services:
  postgres:
    image: postgres:15-alpine
    container_name: zcord-postgres-prod
    environment:
      POSTGRES_DB: zcord
      POSTGRES_USER: zcord_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "127.0.0.1:5432:5432" # Только локальный доступ
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped
    networks:
      - zcord-network

  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: zcord-backend-prod
    environment:
      DATABASE_URL: postgres://zcord_user:${DB_PASSWORD}@postgres:5432/zcord?sslmode=disable
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "127.0.0.1:8000:8000" # Только локальный доступ
    volumes:
      - ./server/uploads:/root/uploads
    depends_on:
      - postgres
    restart: unless-stopped
    networks:
      - zcord-network

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: zcord-frontend-prod
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: https://yourdomain.com/api
    ports:
      - "127.0.0.1:3000:3000" # Только локальный доступ
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - zcord-network

volumes:
  postgres_data:

networks:
  zcord-network:
    driver: bridge
```

3. **Настройка Nginx reverse proxy:**

Создайте `/etc/nginx/sites-available/zcord`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL сертификаты (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    # Безопасность
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Увеличиваем таймауты для загрузки файлов
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Статические файлы (uploads)
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Кеширование статических файлов
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

4. **Получение SSL сертификата:**

```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Автоматическое обновление
sudo crontab -e
# Добавьте строку:
0 12 * * * /usr/bin/certbot renew --quiet
```

### Запуск production

1. **Создание .env файла с секретами:**

```bash
# Создайте .env файл в корне проекта
cat > .env << EOF
DB_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
EOF
```

2. **Запуск сервисов:**

```bash
# Запуск с production конфигурацией
podman-compose -f podman-compose.prod.yml --env-file .env up -d

# Проверка статуса
podman-compose -f podman-compose.prod.yml ps
```

3. **Включение Nginx:**

```bash
sudo ln -s /etc/nginx/sites-available/zcord /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## ☁️ Облачное развёртывание

### AWS EC2

1. **Создание EC2 инстанса:**

- AMI: Ubuntu 22.04 LTS
- Instance Type: t3.medium (минимум)
- Security Groups: 80, 443, 22

2. **Настройка:**

```bash
# Подключение к инстансу
ssh -i your-key.pem ubuntu@your-ec2-ip

# Установка зависимостей
sudo apt update
sudo apt install -y podman podman-compose nginx certbot python3-certbot-nginx

# Клонирование проекта
git clone <repository-url>
cd Zcord-main
```

3. **Настройка домена:**

- Настройте A-запись в DNS на IP вашего EC2
- Следуйте инструкциям production развёртывания

### DigitalOcean Droplet

1. **Создание Droplet:**

- Image: Ubuntu 22.04
- Size: 2 GB RAM / 2 vCPUs (минимум)
- Add-ons: Monitoring

2. **Настройка аналогична AWS EC2**

### Google Cloud Platform

1. **Создание VM:**

```bash
gcloud compute instances create zcord-instance \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --machine-type=e2-medium \
    --zone=us-central1-a
```

2. **Настройка firewall:**

```bash
gcloud compute firewall-rules create allow-http-https \
    --allow tcp:80,tcp:443 \
    --source-ranges 0.0.0.0/0
```

### Docker Swarm (кластер)

1. **Инициализация Swarm:**

```bash
# Podman не поддерживает Swarm, используйте Kubernetes или Podman pods
# Для кластеризации рекомендуется использовать Kubernetes

# Создание pod в Podman
podman pod create --name zcord-pod -p 3000:3000 -p 8000:8000 -p 5435:5432
```

2. **Создание stack файла:**

```yaml
# docker-stack.yml
version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: zcord
      POSTGRES_USER: zcord_user
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    secrets:
      - db_password
    networks:
      - zcord-network
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]

  backend:
    image: zcord-backend:latest
    environment:
      DATABASE_URL: postgres://zcord_user:@postgres:5432/zcord?sslmode=disable
    secrets:
      - jwt_secret
      - db_password
    networks:
      - zcord-network
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s

  frontend:
    image: zcord-frontend:latest
    ports:
      - "3000:3000"
    networks:
      - zcord-network
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s

volumes:
  postgres_data:

networks:
  zcord-network:
    driver: overlay

secrets:
  db_password:
    external: true
  jwt_secret:
    external: true
```

3. **Развёртывание stack:**

```bash
# Podman использует другой подход к секретам
# Создание секретов через переменные окружения или файлы

# Создание .env файла с секретами
cat > .env << EOF
DB_PASSWORD=strong_db_password
JWT_SECRET=jwt_secret_key
EOF

# Развёртывание
podman-compose -f podman-compose.yml --env-file .env up -d
```

## 📊 Мониторинг и логирование

### Prometheus + Grafana

1. **Добавление в docker-compose:**

```yaml
prometheus:
  image: prom/prometheus
  ports:
    - "9090:9090"
  volumes:
    - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
  networks:
    - zcord-network

grafana:
  image: grafana/grafana
  ports:
    - "3001:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  volumes:
    - grafana_data:/var/lib/grafana
  networks:
    - zcord-network
```

2. **Конфигурация Prometheus:**

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "zcord-backend"
    static_configs:
      - targets: ["backend:8000"]

  - job_name: "zcord-frontend"
    static_configs:
      - targets: ["frontend:3000"]
```

### ELK Stack для логов

```yaml
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.5.0
  environment:
    - discovery.type=single-node
    - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
  volumes:
    - elasticsearch_data:/usr/share/elasticsearch/data

logstash:
  image: docker.elastic.co/logstash/logstash:8.5.0
  volumes:
    - ./monitoring/logstash.conf:/usr/share/logstash/pipeline/logstash.conf

kibana:
  image: docker.elastic.co/kibana/kibana:8.5.0
  ports:
    - "5601:5601"
  environment:
    - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
```

## 💾 Резервное копирование

### Автоматический бэкап базы данных

1. **Создание скрипта бэкапа:**

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="zcord_backup_$DATE.sql"

# Создание бэкапа
podman-compose -f podman-compose.yml exec -T postgres pg_dump -U zcord_user zcord > "$BACKUP_DIR/$BACKUP_FILE"

# Сжатие
gzip "$BACKUP_DIR/$BACKUP_FILE"

# Удаление старых бэкапов (старше 30 дней)
find $BACKUP_DIR -name "zcord_backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

2. **Настройка cron:**

```bash
# Ежедневный бэкап в 2:00
0 2 * * * /path/to/backup.sh >> /var/log/zcord-backup.log 2>&1
```

### Бэкап файлов

```bash
#!/bin/bash
# backup-files.sh

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Бэкап загруженных файлов
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" server/uploads/

# Бэкап конфигурации
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    docker-compose.yml \
    docker-compose.prod.yml \
    server/.env \
    init.sql
```

### Восстановление

```bash
# Восстановление базы данных
gunzip -c zcord_backup_20250128_020000.sql.gz | \
podman-compose -f podman-compose.yml exec -T postgres psql -U zcord_user zcord

# Восстановление файлов
tar -xzf uploads_20250128_020000.tar.gz
```

## 📈 Масштабирование

### Горизонтальное масштабирование

1. **Load Balancer (Nginx):**

```nginx
upstream zcord_backend {
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
    server 127.0.0.1:8003;
}

upstream zcord_frontend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    location /api/ {
        proxy_pass http://zcord_backend;
    }

    location / {
        proxy_pass http://zcord_frontend;
    }
}
```

2. **Docker Compose для нескольких инстансов:**

```yaml
services:
  backend-1:
    extends: backend
    ports:
      - "8001:8000"

  backend-2:
    extends: backend
    ports:
      - "8002:8000"

  backend-3:
    extends: backend
    ports:
      - "8003:8000"
```

### Вертикальное масштабирование

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 4G
        reservations:
          cpus: "1.0"
          memory: 2G
```

### База данных

1. **PostgreSQL Master-Slave:**

```yaml
postgres-master:
  image: postgres:15-alpine
  environment:
    POSTGRES_REPLICATION_MODE: master
    POSTGRES_REPLICATION_USER: replicator
    POSTGRES_REPLICATION_PASSWORD: repl_password

postgres-slave:
  image: postgres:15-alpine
  environment:
    POSTGRES_REPLICATION_MODE: slave
    POSTGRES_MASTER_HOST: postgres-master
    POSTGRES_REPLICATION_USER: replicator
    POSTGRES_REPLICATION_PASSWORD: repl_password
```

2. **Connection Pooling (PgBouncer):**

```yaml
pgbouncer:
  image: pgbouncer/pgbouncer:latest
  environment:
    DATABASES_HOST: postgres
    DATABASES_PORT: 5432
    DATABASES_USER: zcord_user
    DATABASES_PASSWORD: password
    DATABASES_DBNAME: zcord
  ports:
    - "6432:6432"
```

## 🔒 Безопасность

### Основные меры безопасности

1. **Firewall настройки:**

```bash
# UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

2. **Docker security:**

```yaml
services:
  backend:
    security_opt:
      - no-new-privileges:true
      - label=disable
    read_only: true
    tmpfs:
      - /tmp
    user: "1000:1000"
    userns_mode: keep-id
```

3. **Secrets management:**

```bash
# Использование переменных окружения или файлов
echo "secret_value" > /path/to/secret_file

# В compose файле
services:
  backend:
    environment:
      - SECRET_VALUE_FILE=/run/secrets/my_secret
    volumes:
      - /path/to/secret_file:/run/secrets/my_secret:ro
```

### SSL/TLS настройки

```nginx
# Современные SSL настройки
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

# HSTS
add_header Strict-Transport-Security "max-age=63072000" always;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
```

---

**Версия:** 1.0  
**Дата обновления:** 28 июля 2025
