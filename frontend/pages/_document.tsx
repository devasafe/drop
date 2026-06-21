import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

export default function Document() {
  return (
    <Html>
      <Head>
        {/* Favicon (ícone da aba) */}
        <link rel="icon" type="image/png" href="/images/drop_png.png" />
        <link rel="apple-touch-icon" href="/images/drop_png.png" />
        {/* Google Fonts — Space Grotesk + Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
