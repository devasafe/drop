import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';
import { spaceGrotesk, inter } from '../lib/fonts';

export default function Document() {
  return (
    <Html className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <Head>
        {/* Favicon (ícone da aba) */}
        <link rel="icon" type="image/png" href="/images/drop_png.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* PWA / Web Push — permite instalar na tela inicial (necessário p/ push no iOS) */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6C2BD9" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DROP" />
        {/* Fontes (Space Grotesk + Inter) são carregadas e self-hospedadas pelo
            next/font (lib/fonts, aplicado no <Html> acima) — sem <link> externo. */}
        <Script
          id="suppress-dev-warnings"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                (function() {
                  // Suppress console messages
                  const originalLog = console.log;
                  const originalWarn = console.warn;
                  const originalError = console.error;
                  
                  const shouldSuppress = (msg) => {
                    if (!msg) return false;
                    const str = msg.toString();
                    return str.includes('WebSocket') || 
                           str.includes('refresh.js') || 
                           str.includes('Marker is deprecated');
                  };
                  
                  console.log = function(...args) {
                    if (shouldSuppress(args[0])) return;
                    return originalLog.apply(console, args);
                  };
                  
                  console.warn = function(...args) {
                    if (shouldSuppress(args[0])) return;
                    return originalWarn.apply(console, args);
                  };
                  
                  console.error = function(...args) {
                    if (shouldSuppress(args[0])) return;
                    return originalError.apply(console, args);
                  };
                })();
              }
            `,
          }}
          strategy="beforeInteractive"
        />
        {/* Google Maps API */}
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places&loading=async`}
          strategy="beforeInteractive"
          onError={(e) => {
            // Silently ignore Google Maps load errors
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
