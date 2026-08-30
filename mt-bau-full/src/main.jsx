import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { BookmarksProvider } from './contexts/BookmarksContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <BookmarksProvider>
          <App />
        </BookmarksProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
)

