console.log("main.jsx executing...");
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { Toaster } from 'react-hot-toast'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
        <Toaster position="bottom-right" toastOptions={{
            style: {
                background: '#333',
                color: '#fff',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.1)'
            }
        }} />
    </React.StrictMode>,
)
