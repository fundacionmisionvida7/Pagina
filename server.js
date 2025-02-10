// server.js
import express from 'express';
import fetch from 'node-fetch'; // Importa node-fetch como un módulo ES
import { JSDOM } from 'jsdom';
import cors from 'cors';

const app = express();
const PORT = 3000;

// Habilita CORS para todas las solicitudes
app.use(cors({
  origin: '*', // Permite solicitudes desde cualquier origen
  methods: ['GET'], // Solo permite solicitudes GET
}));

// Ruta para obtener el devocional
app.get('/devotional', async (req, res) => {
  try {
    const url = 'https://www.bibliaon.com/es/palabra_del_dia/';
    console.log('Consultando URL:', url); // Mensaje de depuración

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error al cargar el devocional: ${response.status}`);
    }
    const html = await response.text();
    console.log('HTML recibido:', html.substring(0, 500)); // Muestra los primeros 500 caracteres del HTML

    // Usar JSDOM para analizar el HTML
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extraer el título, contenido y fecha del devocional
    const title = document.querySelector('.daily-suptitle')?.textContent.trim() || 'Título no disponible';
    let content = document.querySelector('.daily-content')?.innerHTML || 'Contenido no disponible';
    const date = document.querySelector('.daily-date')?.textContent.trim() || 'Fecha no disponible';

    console.log('Datos extraídos:', { title, content, date }); // Mensaje de depuración

    // Limpiar el contenido HTML para eliminar direcciones y enlaces
    content = content
      .replace(/<a[^>]*>.*?<\/a>/g, '') // Elimina todos los enlaces (<a>)
      .replace(/<\/?p>/g, '')           // Elimina las etiquetas <p>
      .replace(/<\/?strong>/g, '')      // Elimina las etiquetas <strong>
      .replace(/<br\s*\/?>/gi, '\n');   // Convierte <br> en saltos de línea

    // Devolver los datos como JSON
    res.json({ title, content: content.trim(), date });
  } catch (error) {
    console.error('Error al cargar el devocional:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el devocional' });
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
