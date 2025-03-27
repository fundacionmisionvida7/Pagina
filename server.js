import express from 'express';
import cors from 'cors';
import webPush from 'web-push';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// ================= CONFIGURACIÓN CORS DINÁMICA =================
const allowedOrigins = [
  'https://mision-vida-app.web.app',
  'http://127.0.0.1:5501',
  'http://localhost:5501'
];

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).send();
  next();
});

// ================= CONFIGURACIÓN WEB-PUSH =================
webPush.setVapidDetails(
  'mailto:contacto@misionvida.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ================= ENDPOINTS =================

// POST /api/subscribe (Versión mejorada)
// En el endpoint POST /api/subscribe
app.post('/api/subscribe', async (req, res) => {
    console.log('Nueva suscripción:', req.body.subscription);
  try {
    const { subscription } = req.body;
    
    // Validación mejorada
    if (!subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ 
        error: 'Suscripción inválida: Faltan claves de cifrado' 
      });
    }

    // Convertir claves a Buffer
    const p256dh = Buffer.from(subscription.keys.p256dh, 'base64url');
    const auth = Buffer.from(subscription.keys.auth, 'base64url');

    // Validar longitud de claves
    if (p256dh.length !== 65) {
      throw new Error(`La clave p256dh debe tener 65 bytes (Recibidos: ${p256dh.length})`);
    }

    await webPush.sendNotification(subscription, JSON.stringify({
      title: '✅ Notificaciones Activadas',
      body: 'Recibirás la Palabra del Día cada mañana',
      icon: '/icon-192x192.png'
    }));

    res.status(201).json({ success: true });

  } catch (error) {
    console.error('Error en suscripción:', error);
    res.status(500).json({
      error: 'Error al procesar la suscripción',
      details: error.message
    });
  }
});

// GET /devotional (Versión estable)
app.get('/devotional', async (req, res) => {
  try {
    const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
    const response = await fetch(sourceUrl);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const title = document.querySelector('.daily-suptitle')?.textContent.trim() || 'Palabra del Día';
    const content = document.querySelector('.daily-content')?.textContent.trim() || '';
    const date = document.querySelector('.daily-date')?.textContent.trim() || new Date().toLocaleDateString();

    res.json({
      title,
      content: content.replace(/\s+/g, ' '),
      date,
      source: sourceUrl
    });

  } catch (error) {
    console.error('Error en devocional:', error);
    res.status(500).json({
      error: 'No se pudo obtener el devocional',
      details: error.message
    });
  }
});

// GET /send-daily (Versión simplificada)
app.get('/send-daily', async (req, res) => {
  try {
    const devotional = await fetch('https://palabra-del-dia-backend.vercel.app/devotional').then(r => r.json());
    
    res.json({
      status: 'Notificaciones programadas',
      devotional: devotional.title
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en puerto ${PORT}`);
  console.log('🔑 Clave VAPID pública:', process.env.VAPID_PUBLIC_KEY?.substring(0, 15) + '...');
});
