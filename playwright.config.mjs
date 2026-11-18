import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',timeout:25000,workers:1,reporter:'list',
  use:{baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure'},
  webServer:{command:'node server.js',url:'http://127.0.0.1:3000/api/cards',reuseExistingServer:!process.env.CI,timeout:30000}
});
