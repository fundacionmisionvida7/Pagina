import express from 'express';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import cors from 'cors';
import webPush from 'web-push';
import fs from 'fs';
import 'dotenv/config';

// ================= CONFIGURACIÓN INICIAL =================
const app = express();
const PORT = process.env.PORT || 3000;

// ================= MIDDLEWARES =================
// Configuración CORS segura
const allowedOrigins = [
  'https://mision-vida-app.web.app',
  'http://localhost:5501',
  'http://127.0.0.1:5501', // 👈 ¡Agrega esta línea!
  'https://palabra-del-dia-backend.vercel.app'
];

// Middleware CORS actualizado
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Manejo explícito de OPTIONS
app.options('*', cors());

app.use(express.json()); // Para parsear JSON en las solicitudes

// ================= CONFIGURACIÓN VAPID =================
webPush.setVapidDetails(
  'mailto:contacto@misionvida.com',
  process.env.VAPID_PUBLIC_KEY, // Usar variables de entorno
  process.env.VAPID_PRIVATE_KEY
);

// ================= MANEJO DE SUSCRIPCIONES =================
const SUBSCRIPTIONS_FILE = 'subscriptions.json';

// Cargar suscripciones desde archivo
const loadSubscriptions = () => {
  try {
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
};

// Guardar suscripciones en archivo
const saveSubscriptions = (subscriptions) => {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
};

// ================= ENDPOINTS =================

// 1. Endpoint de estado
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Palabra del Día Backend',
    version: '1.0.0',
    suscripciones_activas: loadSubscriptions().length,
    endpoints: {
      devotional: '/devotional',
      subscribe: '/api/subscribe (POST)',
      sendDaily: '/send-daily (GET)'
    }
  });
});

// 2. Suscripciones
app.post('/api/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }

    const subscriptions = loadSubscriptions();
    
    // Evitar duplicados
    if (!subscriptions.some(sub => sub.endpoint === subscription.endpoint)) {
      subscriptions.push(subscription);
      saveSubscriptions(subscriptions);
    }

    // Notificación de confirmación
    await webPush.sendNotification(subscription, JSON.stringify({
      title: '✅ Notificaciones Activadas',
      body: 'Recibirás la Palabra del Día cada mañana',
      icon: '/icon-192x192.png',
      url: '/'
    }));

    res.status(201).json({ success: true });
    
  } catch (error) {
    console.error('Error en suscripción:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// 3. Devocional diario
app.get('/devotional', async (req, res) => {
  try {
    const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
    const response = await fetch(sourceUrl);
    
    if (!response.ok) throw new Error(`Error ${response.status}`);

    const html = await response.text();
    const dom = new JSDOM(html);
    const { document } = dom.window;

    // Extraer y limpiar contenido
    const cleanHTML = (content) => content
      .replace(/<\/?p>/g, '')
      .replace(/<\/?strong>/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .trim();

    res.json({
      title: document.querySelector('.daily-suptitle')?.textContent.trim() || 'Palabra del Día',
      content: cleanHTML(document.querySelector('.daily-content')?.innerHTML || ''),
      date: document.querySelector('.daily-date')?.textContent.trim() || new Date().toLocaleDateString(),
      source: sourceUrl
    });

  } catch (error) {
    console.error('Error en devocional:', error);
    res.status(500).json({
      error: 'Error al obtener el devocional',
      details: error.message
    });
  }
});

// 4. Enviar notificaciones
app.get('/send-daily', async (req, res) => {
  try {
    const response = await fetch('https://palabra-del-dia-backend.vercel.app/devotional');
    const devotional = await response.json();
    const subscriptions = loadSubscriptions();

    const notification = {
      title: devotional.title,
      body: devotional.content.substring(0, 120) + '...',
      url: '/',
      icon: '/icon-192x192.png'
    };

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(sub, JSON.stringify(notification));
          return { success: true, endpoint: sub.endpoint };
        } catch (error) {
          if (error.statusCode === 410) { // Eliminar suscripciones expiradas
            saveSubscriptions(subscriptions.filter(s => s.endpoint !== sub.endpoint));
          }
          return { success: false, endpoint: sub.endpoint };
        }
      })
    );

    res.json({
      enviadas: results.filter(r => r.success).length,
      fallidas: results.filter(r => !r.success).length
    });

  } catch (error) {
    console.error('Error al enviar notificaciones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ================= INICIAR SERVIDOR =================
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en puerto ${PORT}`);
  console.log('🔧 Modo:', process.env.NODE_ENV || 'development');
});
