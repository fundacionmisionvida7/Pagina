// api/send-daily.js
import admin from '../firebaseAdmin.js';
import webPush from 'web-push';
import fetch from 'node-fetch';

// Nota: Para obtener el dominio actual en Vercel puedes usar la variable de entorno VERCEL_URL. 
// Si no está configurada, reemplaza 'https://tu-dominio.vercel.app' por la URL correcta de tu proyecto.
const DOMAIN = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://tu-dominio.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  
  try {
    // 1. Obtener el devocional desde el endpoint /api/devotional
    const devotionalResponse = await fetch(`${DOMAIN}/api/devotional`);
    if (!devotionalResponse.ok) throw new Error('Error al obtener el devocional');
    const devotionalData = await devotionalResponse.json();
    
    // 2. Construir la carga útil (payload) para la notificación push
    const notificationPayload = {
      title: devotionalData.title,
      body: devotionalData.content.substring(0, 120) + '...',
      icon: '/icon-192x192.png',
      url: '/'
    };
    
    // 3. Leer las suscripciones desde la colección "pushSubscriptions" en Firestore
    const db = admin.firestore();
    const snapshot = await db.collection('pushSubscriptions').get();
    const subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // 4. Enviar notificaciones a todas las suscripciones
    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(sub, JSON.stringify(notificationPayload));
          return { status: 'success', endpoint: sub.endpoint };
        } catch (error) {
          // Si la suscripción ya no es válida (por ejemplo, error 410 o 404) se elimina
          if (error.statusCode === 410 || error.statusCode === 404) {
            await db.collection('pushSubscriptions').doc(sub.id).delete();
          }
          return { status: 'error', endpoint: sub.endpoint, error: error.message };
        }
      })
    );
    
    res.json({
      sent: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      details: results
    });
    
  } catch (error) {
    console.error('Error en send-daily:', error);
    res.status(500).json({ error: 'Error al enviar notificaciones', details: error.message });
  }
}
