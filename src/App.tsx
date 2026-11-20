import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AppModeProvider, useAppMode } from './hooks/useAppMode';
import { LibraryProvider } from './hooks/useLibrary';
import { ThemeProvider } from './hooks/useTheme';
import { CatalogPage } from './pages/CatalogPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { MoodPage } from './pages/MoodPage';
import { ProfilePage } from './pages/ProfilePage';
import { SetupPage } from './pages/SetupPage';
import { TitleDetailsPage } from './pages/TitleDetailsPage';

function AppRoutes() {
  const { needsSetup } = useAppMode();

  if (needsSetup) {
    return <SetupPage />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/title/:mediaType/:id" element={<TitleDetailsPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/mood" element={<MoodPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppModeProvider>
        <LibraryProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </LibraryProvider>
      </AppModeProvider>
    </ThemeProvider>
  );
}
