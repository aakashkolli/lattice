import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Lattice — Collaborative Documents',
  description: 'Real-time collaborative document editor powered by CRDTs and a Rust backend',
  icons: {
    icon: '/favicon.svg',
  },
};

const themeScript = `(function(){try{var s=localStorage.getItem('lattice_theme');if(s==='light'||s==='dark'){document.documentElement.dataset.theme=s;}else{document.documentElement.dataset.theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
