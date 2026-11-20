import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isTauriRuntime } from './utils/platform';

createRoot(document.getElementById('root')!).render(<App />);

if (
  import.meta.env.PROD &&
  !isTauriRuntime() &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        // Не прерываем работу приложения, если регистрация SW недоступна в текущем окружении
      });
  });
}
