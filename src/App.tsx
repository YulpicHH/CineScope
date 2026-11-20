import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OfflineVideoPlayerModal } from './components/offline/OfflineVideoPlayerModal';
import { RowSkeleton } from './components/ui/Skeleton';
import { AppModeProvider } from './hooks/useAppMode';
import { LibraryProvider } from './hooks/useLibrary';
import { OfflineDownloadsProvider } from './hooks/useOfflineDownloads';
import { ThemeProvider } from './hooks/useTheme';
import { getRouterMode, isTauriRuntime } from './utils/platform';

const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
);
const CatalogPage = lazy(() =>
  import('./pages/CatalogPage').then((m) => ({ default: m.CatalogPage })),
);
const TitleDetailsPage = lazy(() =>
  import('./pages/TitleDetailsPage').then((m) => ({ default: m.TitleDetailsPage })),
);
const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

function RouteFallback() {
  return (
    <div className="space-y-6 py-4" aria-busy="true">
      <RowSkeleton count={5} />
    </div>
  );
}

function RouterAdapter({ children }: { children: ReactNode }) {
  const mode = getRouterMode(isTauriRuntime());
  if (mode === 'hash') {
    return <HashRouter>{children}</HashRouter>;
  }
  return <BrowserRouter>{children}</BrowserRouter>;
}

function AppRoutes() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/title/:mediaType/:id" element={<TitleDetailsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/mood" element={<Navigate to="/catalog?panel=mood" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppModeProvider>
        <LibraryProvider>
          <OfflineDownloadsProvider>
            <RouterAdapter>
              <AppRoutes />
            </RouterAdapter>
            <OfflineVideoPlayerModal />
          </OfflineDownloadsProvider>
        </LibraryProvider>
      </AppModeProvider>
    </ThemeProvider>
  );
}
