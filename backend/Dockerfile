FROM node:24-bookworm-slim AS frontend-build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.10.5 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
COPY docs/architecture/fixtures/ /docs/architecture/fixtures/
RUN pnpm exec nuxt prepare && pnpm build

FROM php:8.5-apache-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev libpq-dev supervisor unzip \
    && docker-php-ext-install mbstring pdo_pgsql \
    && a2enmod headers proxy proxy_http rewrite \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

WORKDIR /var/www/html

COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --prefer-dist

COPY backend/ ./
COPY backend/docker/joinsplit.conf /etc/apache2/conf-available/joinsplit.conf
COPY backend/docker/supervisord.conf /etc/supervisor/conf.d/joinsplit.conf
COPY --from=frontend-build /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend-build /app/.output /var/www/frontend/.output

RUN composer dump-autoload --no-dev --optimize --no-interaction \
    && a2enconf joinsplit \
    && sed -ri 's!Listen 80!Listen 10000!' /etc/apache2/ports.conf \
    && sed -ri 's!<VirtualHost \*:80>!<VirtualHost *:10000>!' /etc/apache2/sites-available/000-default.conf \
    && sed -ri 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/000-default.conf \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 10000

CMD ["sh", "bin/start-render-web"]
