# Деплой Zcord в облако (VPS) — пошагово

Ниже описан рекомендуемый способ деплоя: один домен + HTTPS + проксирование `frontend` и `backend` через Caddy.
Так WebRTC (камера/микрофон/демонстрация экрана) корректно работает в браузере.

## Что будет автоматически при первом запуске

1) Создаётся канал `Новости Zcord` (`tag=news`) и сидятся текущие новости (все сообщения, которые есть сейчас локально).  
2) Создаются аккаунты `root` и `nikdimer` (если их нет) с e-mail:
   - `root` → `<BOOTSTRAP_ROOT_EMAIL>`
   - `nikdimer` → `<BOOTSTRAP_NIKDIMER_EMAIL>`
3) Все новые пользователи автоматически добавляются в новостной канал.  
4) Пользователи с тегами `root` и `nikdimer` могут писать в `news` (остальным канал read-only).

## 0) Требования к серверу

- VPS с Linux (Ubuntu 22.04+ достаточно), домен `example.com`
- Открыты порты `80/tcp` и `443/tcp` (и `22/tcp` для SSH)
- Установлен Docker + docker compose plugin

## 1) Установка Docker (Ubuntu)

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Проверка:

```bash
docker version
docker compose version
```

## 2) Подготовка проекта

```bash
git clone <URL_РЕПОЗИТОРИЯ>
cd Zcord-main
cp .env.example .env
```

Открой `.env` и обязательно задай:

- `ZCORD_DOMAIN=ваш.домен`
- `JWT_SECRET=длинный_случайный_секрет`
- `POSTGRES_PASSWORD=случайный_пароль`
- `BOOTSTRAP_ROOT_PASSWORD=пароль_для_root`
- `BOOTSTRAP_NIKDIMER_PASSWORD=пароль_для_nikdimer`
- (опционально) `CADDY_EMAIL=почта_для_LetsEncrypt`

## 3) Запуск в проде (HTTPS + один домен)

Запуск с Caddy (рекомендуется):

```bash
docker compose -f docker-compose.cloud.yml --env-file .env up -d --build
```

Проверка логов:

```bash
docker compose -f docker-compose.cloud.yml logs -f --tail=200 caddy
docker compose -f docker-compose.cloud.yml logs -f --tail=200 backend
```

Открой в браузере:

- `https://ваш.домен`

## 4) Первый вход

Войти можно под:

- `root` (email `<BOOTSTRAP_ROOT_EMAIL>`, пароль из `BOOTSTRAP_ROOT_PASSWORD`)
- `nikdimer` (email `<BOOTSTRAP_NIKDIMER_EMAIL>`, пароль из `BOOTSTRAP_NIKDIMER_PASSWORD`)

Канал `Новости Zcord` появится у всех пользователей автоматически.

## 5) Данные и бэкапы

В `docker-compose.cloud.yml` данные хранятся в volume’ах:

- `postgres_data` — база
- `uploads_data` — загруженные файлы/аватарки
- `caddy_data`, `caddy_config` — сертификаты/конфиг Caddy

Бэкап базы:

```bash
set -a; source .env; set +a
docker exec -i zcord-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > zcord_backup.sql
```

Бэкап uploads:

```bash
docker run --rm \
  -v uploads_data:/data:ro \
  -v "$PWD":/backup \
  alpine:3 sh -c "cd /data && tar -czf /backup/uploads_backup.tar.gz ."
```

## 6) Обновление версии

```bash
git pull
docker compose -f docker-compose.cloud.yml --env-file .env up -d --build
docker compose -f docker-compose.cloud.yml logs -f --tail=200 backend
```

## 7) Если деплоишь без Caddy (не рекомендуется)

В облаке камера/микрофон часто не работают без HTTPS (кроме `localhost`), поэтому этот вариант хуже.
Но если всё равно нужно:

- Подними `docker-compose.yml`
- Задай `NEXT_PUBLIC_API_URL` и `PUBLIC_API_URL` на публичный адрес backend (например `http://IP:8000`)
- Настрой HTTPS отдельно (Nginx/Traefik/Caddy) и переведи `NEXT_PUBLIC_API_URL`/`PUBLIC_API_URL` на `https://...`
