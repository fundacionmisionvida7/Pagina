// api/subscribe.js
import admin from '../firebaseAdmin.js'; // La ruta debe ser correcta según tu estructura

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Método no permitido');
  }

  const subscription = req.body;
  console.log("Suscripción recibida:", subscription); // Log para ver qué se recibe

  try {
    const db = admin.firestore();
    const subscriptionsRef = db.collection('pushSubscriptions'); // Asegúrate de que sea el nombre correcto

    // Guardamos usando el endpoint como ID (debe ser único)
    await subscriptionsRef.doc(subscription.endpoint).set(subscription, { merge: true });
    console.log("Suscripción guardada en Firestore correctamente");
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error al guardar la suscripción:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
