// firebaseAdmin.js
import admin from 'firebase-admin';

console.log("FIREBASE_SERVICE_ACCOUNT:", process.env.FIREBASE_SERVICE_ACCOUNT); // Agrega este log temporalmente

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin inicializado correctamente");
} else {
  console.log("Firebase Admin ya estaba inicializado");
}

export default admin;
