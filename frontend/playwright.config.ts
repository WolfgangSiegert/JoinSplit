import { defineConfig, devices } from '@playwright/test'

const laravelTestServerCommand = [
  'php artisan config:clear --env=testing',
  'php tests/Support/guard-playwright-database.php',
  'php artisan migrate:fresh --env=testing --force',
  'php artisan serve --env=testing --host=127.0.0.1 --port=8001',
].join(' && ')

const laravelTestEnvironment = {
  APP_ENV: 'testing',
  DB_CONNECTION: 'pgsql',
  DB_HOST: '127.0.0.1',
  JOIN_SPLIT_CLIENT_ORIGIN: 'http://127.0.0.1:3100',
  DB_PORT: '5432',
  DB_DATABASE: 'joinsplit_test',
  DB_USERNAME: 'joinsplit_test',
  DB_URL: '',
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: laravelTestServerCommand,
      cwd: '../backend',
      url: 'http://127.0.0.1:8001/up',
      env: laravelTestEnvironment,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/support/pwa-test-server.mjs',
      url: 'http://127.0.0.1:3100',
      env: {
        HOST: '127.0.0.1',
        PORT: '3100',
        JOIN_SPLIT_BACKEND_HOSTPORT: '127.0.0.1:8001',
        NUXT_PUBLIC_API_BASE: 'http://127.0.0.1:8001',
      },
      reuseExistingServer: false,
    },
  ],
})
