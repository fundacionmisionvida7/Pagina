// server.js
import express from 'express';
import cors from 'cors';
import webPush from 'web-push';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import 'dotenv/config';

import admin from './firebaseAdmin.js'; // Asegúrate de que este archivo existe en la raíz

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'https://mision-vida-app.web.app',
  'http://127.0.0.1:5501',
  'http://localhost:5501'
];

// Middlewares
app.use(express.json());
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Configuración WebPush
webPush.setVapidDetails(
  'mailto:contacto@misionvida.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

//
// ENDPOINTS
//

// 1. Estado del servicio
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Palabra del Día Backend',
    version: '2.0',
    allowedOrigins: allowedOrigins
  });
});

// 2. Endpoint para recibir y guardar suscripciones (se guardan en la colección "pushSubscriptions")
app.post('/api/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }

    const db = admin.firestore();
    const subsRef = db.collection('pushSubscriptions');
    // Verifica si ya existe una suscripción con ese endpoint
    const existingSnapshot = await subsRef.where('endpoint', '==', subscription.endpoint).get();
    if (!existingSnapshot.empty) {
      return res.status(409).json({ error: 'Suscripción ya registrada' });
    }

    await subsRef.add({
      ...subscription,
      createdAt: new Date().toISOString()
    });

    // Envía notificación de confirmación a la suscripción
    await webPush.sendNotification(subscription, JSON.stringify({
      title: '✅ Notificaciones Activadas',
      body: 'Recibirás la Palabra del Día cada mañana',
      icon: '/icon-192x192.png'
    }));

    res.status(201).json({ success: true, message: 'Suscripción guardada' });
  } catch (error) {
    console.error('Error al guardar suscripción:', error);
    res.status(500).json({ error: 'Fallo al guardar suscripción', details: error.message });
  }
});

// 3. Endpoint para obtener el devocional diario (desde bibliaon.com)
app.get('/devotional', async (req, res) => {
  try {
    const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const { document } = new JSDOM(html).window;

    const extractContent = (selector) =>
      document.querySelector(selector)?.textContent.trim() || '';

    res.json({
      title: extractContent('.daily-suptitle') || 'Palabra del Día',
      content: extractContent('.daily-content').replace(/\s+/g, ' '),
      date: extractContent('.daily-date') || new Date().toLocaleDateString(),
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

// 4. Endpoint para enviar notificaciones (send-daily) leyendo las suscripciones desde Firestore
app.get('/send-daily', async (req, res) => {
  try {
    const devotionalResponse = await fetch('https://palabra-del-dia-backend.vercel.app/devotional');
    if (!devotionalResponse.ok) throw new Error('Error al obtener devocional');

    const devotionalData = await devotionalResponse.json();

    const notificationPayload = {
      title: devotionalData.title,
      body: devotionalData.content.substring(0, 120) + '...',
      icon: '/icon-192x192.png',
      url: '/'
    };

    const db = admin.firestore();
    // Usamos la colección "pushSubscriptions"
    const snapshot = await db.collection('pushSubscriptions').get();
    const subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Enviar notificaciones a cada suscripción
    const results = await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(sub, JSON.stringify(notificationPayload));
        return { status: 'success', endpoint: sub.endpoint };
      } catch (error) {
        // Eliminar suscripciones inválidas (por ejemplo, si ya no existen)
        if (error.statusCode === 410 || error.statusCode === 404) {
          await db.collection('pushSubscriptions').doc(sub.id).delete();
        }
        return { status: 'error', endpoint: sub.endpoint, error: error.message };
      }
    }));

    res.json({
      sent: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      details: results
    });
  } catch (error) {
    console.error('Error en send-daily:', error);
    res.status(500).json({ error: 'Error al enviar notificaciones', details: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
  console.log('🔐 Clave VAPID pública:', process.env.VAPID_PUBLIC_KEY?.substring(0, 15) + '...');

  // Para depuración: contar suscripciones en Firestore
  (async () => {
    try {
      const db = admin.firestore();
      const snapshot = await db.collection('pushSubscriptions').get();
      console.log('📝 Suscripciones activas:', snapshot.size);
    } catch (error) {
      console.error('Error al contar suscripciones:', error);
    }
  })();
});
