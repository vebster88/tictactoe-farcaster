// Vercel API endpoint для обработки Farcaster Frame действий

import { farcasterFrame } from '../../src/farcaster/frame.js';

export default async function handler(req, res) {
  // Разрешаем только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Парсим тело запроса
    const body = req.body;
    
    // Валидация Farcaster Frame данных
    if (!body.untrustedData) {
      return res.status(400).json({ error: 'Invalid frame data' });
    }

    const { buttonIndex, inputText, state } = body.untrustedData;
    
    // Обрабатываем действие через Frame класс
    const frameResponse = await farcasterFrame.handleFrameAction({
      buttonIndex,
      inputText,
      state
    });

    // Возвращаем HTML с Frame метаданными
    const html = generateFrameHTML(frameResponse);
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
    
  } catch (error) {
    console.error('Frame action error:', error);
    
    const errorResponse = farcasterFrame.generateErrorResponse();
    const html = generateFrameHTML(errorResponse);
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(html);
  }
}

function generateFrameHTML(frameData) {
  const metaTags = [
    '<meta property="fc:frame" content="vNext" />',
    `<meta property="fc:frame:image" content="${frameData.image}" />`,
    `<meta property="fc:frame:post_url" content="${process.env.VERCEL_URL || 'http://localhost:3000'}/api/frame/action" />`
  ];

  // Добавляем кнопки
  frameData.buttons.forEach((button, index) => {
    metaTags.push(`<meta property="fc:frame:button:${index + 1}" content="${button.text}" />`);
    if (button.action) {
      metaTags.push(`<meta property="fc:frame:button:${index + 1}:action" content="${button.action}" />`);
    }
    if (button.target) {
      metaTags.push(`<meta property="fc:frame:button:${index + 1}:target" content="${button.target}" />`);
    }
  });

  // Добавляем input если есть
  if (frameData.input) {
    metaTags.push(`<meta property="fc:frame:input:text" content="${frameData.input.text}" />`);
  }

  // Добавляем состояние если есть
  if (frameData.state) {
    metaTags.push(`<meta property="fc:frame:state" content="${encodeURIComponent(frameData.state)}" />`);
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <title>TicTacToe Farcaster Frame</title>
  ${metaTags.join('\n  ')}
  <meta property="og:title" content="TicTacToe Farcaster" />
  <meta property="og:description" content="Играйте в крестики-нолики прямо в Farcaster!" />
  <meta property="og:image" content="${frameData.image}" />
</head>
<body>
  <h1>TicTacToe Farcaster Frame</h1>
  <p>Это Frame для Farcaster. Откройте в Warpcast для игры!</p>
  <img src="${frameData.image}" alt="Game Board" style="max-width: 100%; height: auto;" />
</body>
</html>`;
}
