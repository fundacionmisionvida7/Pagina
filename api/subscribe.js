// api/subscribe.js

import admin from '../firebaseAdmin.js'; // Asegúrate que el nombre y ruta coincidan

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Método no permitido');
  }

  const subscription = req.body;

  try {
    const db = admin.firestore();
    const subscriptionsRef = db.collection('subscriptions');

    await subscriptionsRef.doc(subscription.endpoint).set(subscription, { merge: true });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error al guardar la suscripción:', error);
    res.status(500).json({ success: false, error: 'Error del servidor' });
  }
}
