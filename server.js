import express from 'express';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import cors from 'cors';
import webPush from 'web-push';
import fs from 'fs';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;



// Configuración CORS actualizada
const allowedOrigins = [
  'https://mision-vida-app.web.app', // Dominio Firebase
  'http://localhost:5501', // Desarrollo local
  'https://mision-vida-app.web.app' // Tu PWA en producción
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Manejar preflight
app.options('*', cors());

// Configuración VAPID
// Usa las mismas claves que en el frontend
webPush.setVapidDetails(
  'mailto:contacto@misionvida.com',
  'BKbz0Gk49FDvNqS78cb3W-xuCkTHmIrkGBuXQ1haspH_aKeuLl2Xdu3J_YHsORZ_JJoOxeBDPGlDrsT3ZPODstU', // Mismo que en script.js
  '__GwOwyUuPP6TefdhjDkuYPl-c-RA7WOHmTBnMqCAnw' // 👈 ¡Obtén esta con npx web-push generate-vapid-keys!
);

// Manejo de suscripciones
const getSubscriptions = () => {
  try {
    return JSON.parse(fs.readFileSync('subscriptions.json', 'utf8'));
  } catch (error) {
    return [];
  }
};

// Endpoints
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Backend para Palabra del Día',
    suscripciones_activas: getSubscriptions().length
  });
});

app.post('/api/subscribe', async (req, res) => {
  // ... (usar el código del subscribe.js corregido)
});





// Almacenamiento temporal (reemplazar por base de datos en producción)
let subscriptions = [];

// ================= ENDPOINTS =================

// Endpoint de estado
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Palabra del Día Backend',
    version: '1.0.0',
    endpoints: {
      devotional: '/devotional',
      subscribe: '/api/subscribe (POST)',
      sendDaily: '/send-daily (GET)'
    }
  });
});

// Endpoint de suscripciones
app.post('/api/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    
    if (!subscription?.endpoint) {
      return res.status(400).json({ 
        error: 'Se requiere una suscripción válida' 
      });
    }

    // Eliminar suscripciones duplicadas
    subscriptions = subscriptions.filter(sub => 
      sub.endpoint !== subscription.endpoint
    );
    
    // Agregar nueva suscripción
    subscriptions.push(subscription);

    // Enviar notificación de confirmación
    await webPush.sendNotification(subscription, JSON.stringify({
      title: '✅ Notificaciones Activadas',
      body: 'Recibirás la Palabra del Día cada mañana',
      icon: '/icon-192x192.png',
      url: '/'
    }));

    res.status(201).json({ 
      success: true,
      message: 'Suscripción exitosa' 
    });

  } catch (error) {
    console.error('Error en suscripción:', error);
    res.status(500).json({
      error: 'Error al procesar la suscripción',
      details: error.message
    });
  }
});

// Endpoint del devocional diario
app.get('/devotional', async (req, res) => {
  try {
    const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
    const response = await fetch(sourceUrl);
    
    if (!response.ok) {
      throw new Error(`Error ${response.status} al obtener el devocional`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extraer datos
    const title = document.querySelector('.daily-suptitle')?.textContent.trim() || 'Palabra del Día';
    const content = document.querySelector('.daily-content')?.innerHTML || '';
    const date = document.querySelector('.daily-date')?.textContent.trim() || new Date().toLocaleDateString();

    // Limpiar contenido
    const cleanContent = content
      .replace(/<\/?p>/g, '')
      .replace(/<\/?strong>/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .trim();

    res.json({
      title,
      content: cleanContent,
      date,
      source: sourceUrl
    });

  } catch (error) {
    console.error('Error en devocional:', error.message);
    res.status(500).json({
      error: 'No se pudo obtener el devocional',
      details: error.message
    });
  }
});

// Endpoint para enviar notificaciones
app.get('/send-daily', async (req, res) => {
  try {
    // Obtener último devocional
    const devotionalResponse = await fetch('https://palabra-del-dia-backend.vercel.app/devotional');
    const devotionalData = await devotionalResponse.json();

    // Preparar notificación
    const notificationPayload = {
      title: devotionalData.title,
      body: devotionalData.content.substring(0, 120) + '...',
      url: '/',
      icon: '/icon-192x192.png'
    };

    // Enviar notificaciones
    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(sub, JSON.stringify(notificationPayload));
          return { success: true, endpoint: sub.endpoint };
        } catch (error) {
          if (error.statusCode === 410) { // Suscripción expirada
            subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
          }
          return { 
            success: false, 
            endpoint: sub.endpoint, 
            error: error.message 
          };
        }
      })
    );

    res.json({
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results
    });

  } catch (error) {
    console.error('Error al enviar notificaciones:', error);
    res.status(500).json({
      error: 'Error al enviar notificaciones',
      details: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
  console.log('Modo:', process.env.NODE_ENV || 'development');
  console.log('Clave VAPID pública:', process.env.VAPID_PUBLIC_KEY?.substring(0, 15) + '...');
});

