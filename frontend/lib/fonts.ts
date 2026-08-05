import { Space_Grotesk, Inter } from 'next/font/google';
// Pesos cobrem o que o app usa (SG display vai até 800; Inter body até 700),
// equivalentes ao <link> do Google que foi removido (next/font self-hospeda).
export const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-space-grotesk', display: 'swap' });
export const inter = Inter({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-inter', display: 'swap' });
