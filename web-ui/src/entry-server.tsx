import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppRoutes } from './App';
import serverI18n from './i18n/server';

export function render(url: string) {
  const html = renderToString(
    <HelmetProvider>
      <I18nextProvider i18n={serverI18n}>
        <StaticRouter location={url}>
          <ThemeProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </ThemeProvider>
        </StaticRouter>
      </I18nextProvider>
    </HelmetProvider>,
  );

  return { html };
}
