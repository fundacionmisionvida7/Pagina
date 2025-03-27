import express from 'express';
import cors from 'cors';
import webPush from 'web-push';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// ================= CONFIGURACIÓN FIREBASE =================
const firebaseConfig = {
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
};

const adminApp = initializeApp(firebaseConfig);
const db = getFirestore(adminApp);

// ================= CONFIGURACIÓN WEB-PUSH =================
webPush.setVapidDetails(
  'mailto:contacto@misionvida.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ================= CONFIGURACIÓN CORS =================
const allowedOrigins = [
  'https://mision-vida-app.web.app',
  'http://127.0.0.1:5501',
  'http://localhost:5501'
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ================= HELPERS FIREBASE =================
const loadSubscriptions = async () => {
  const snapshot = await db.collection('subscriptions').get();
  return snapshot.docs.map(doc => doc.data());
};

const saveSubscription = async (subscription) => {
  await db.collection('subscriptions')
    .doc(subscription.keys.auth)
    .set(subscription);
};

const deleteSubscription = async (authKey) => {
  await db.collection('subscriptions')
    .doc(authKey)
    .delete();
};

// ================= ENDPOINTS =================
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Palabra del Día Backend',
    version: '2.0',
    firebaseProject: process.env.FIREBASE_PROJECT_ID
  });
});

app.post('/api/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ 
        error: 'Estructura de suscripción inválida',
        required: ['endpoint', 'keys.p256dh', 'keys.auth']
      });
    }

    // Verificar existencia en Firestore
    const doc = await db.collection('subscriptions')
      .doc(subscription.keys.auth)
      .get();

    if (doc.exists) {
      return res.status(409).json({ error: 'Suscripción ya registrada' });
    }

    // Guardar en Firestore
    await saveSubscription(subscription);

    // Enviar notificación de confirmación
    await webPush.sendNotification(subscription, JSON.stringify({
      title: '✅ Notificaciones Activadas',
      body: 'Recibirás la Palabra del Día cada mañana',
      icon: '/icon-192x192.png'
    }));

    res.status(201).json({ 
      success: true,
      message: 'Suscripción exitosa',
      totalSubscriptions: (await loadSubscriptions()).length
    });

  } catch (error) {
    console.error('Error en suscripción:', error);
    res.status(500).json({
      error: 'Error al procesar la suscripción',
      details: error.message
    });
  }
});

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

app.get('/send-daily', async (req, res) => {
  try {
    const [devotionalResponse, subscriptions] = await Promise.all([
      fetch('https://palabra-del-dia-backend.vercel.app/devotional'),
      loadSubscriptions()
    ]);

    if (!devotionalResponse.ok) throw new Error('Error al obtener devocional');
    
    const devotionalData = await devotionalResponse.json();
    const notificationPayload = {
      title: devotionalData.title,
      body: devotionalData.content.substring(0, 120) + '...',
      icon: '/icon-192x192.png',
      url: '/'
    };

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(sub, JSON.stringify(notificationPayload));
          return { status: 'success', endpoint: sub.endpoint };
        } catch (error) {
          if (error.statusCode === 410) {
            await deleteSubscription(sub.keys.auth);
          }
          return { 
            status: 'error', 
            endpoint: sub.endpoint, 
            error: error.message 
          };
        }
      })
    );

    res.json({
      sent: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      activeSubscriptions: subscriptions.length,
      details: results
    });

  } catch (error) {
    console.error('Error en send-daily:', error);
    res.status(500).json({
      error: 'Error al enviar notificaciones',
      details: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
  console.log('🔐 Clave VAPID pública:', process.env.VAPID_PUBLIC_KEY?.substring(0, 15) + '...');
  console.log('📦 Proyecto Firebase:', process.env.FIREBASE_PROJECT_ID);
});
