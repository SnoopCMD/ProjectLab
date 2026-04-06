import { JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Initialisation de la police
const jetbrains = JetBrains_Mono({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      {/* Application de la police sur tout le site */}
      <body className={jetbrains.className}>
        {children}
      </body>
    </html>
  );
}