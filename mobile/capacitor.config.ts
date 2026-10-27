import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App Android da DROP. A WebView carrega o site de produção (server.url): cada deploy na
 * main já vale no app, sem nova versão na loja, e o cookie de login segue same-site com
 * api.dropapp.com.br. O que é nativo (push e GPS em segundo plano) vem dos plugins, que o
 * site chama por `frontend/lib/native.ts`.
 */
const config: CapacitorConfig = {
  appId: 'app.drop',
  appName: 'DROP',
  webDir: 'www',
  appendUserAgent: 'DropApp/1',
  backgroundColor: '#FFFFFF',
  android: {
    // Sem isso a posição do motoboy para depois de 5 min em segundo plano (README do
    // @capacitor-community/background-geolocation, issue #89).
    useLegacyBridge: true,
  },
  server: {
    url: 'https://dropapp.com.br',
    // Sem internet ou site fora do ar: tela local em vez da página de erro do Chrome.
    errorPath: 'offline.html',
  },
  plugins: {
    // Sem viewport-fit=cover no site, a WebView fica entre a barra de status e a de navegação.
    SystemBars: { insetsHandling: 'native' },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
