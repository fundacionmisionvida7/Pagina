// api/devotional.js
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

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
    console.error('Error al obtener el devocional:', error);
    res.status(500).json({
      error: 'No se pudo obtener el devocional',
      details: error.message
    });
  }
}
