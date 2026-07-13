const { chromium } = require('playwright');
const { spawn } = require('child_process');

async function main() {
  console.log('Starting preview server...');
  const server = spawn('npm', ['run', 'preview'], { shell: true });
  
  // Wait a bit for server to start
  await new Promise(r => setTimeout(r, 2000));

  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log('Navigating to SM Rafael dashboard...');
  await page.goto('http://localhost:4173/sm/rafael', { waitUntil: 'networkidle' });
  
  console.log('Waiting for Debug span...');
  try {
    await page.waitForSelector('span.text-rose-500', { timeout: 5000 });
    const debugText = await page.textContent('span.text-rose-500');
    console.log('FOUND DEBUG TEXT:', debugText);
  } catch (e) {
    console.log('Could not find debug text. Is there an error on screen?');
    const body = await page.textContent('body');
    console.log('Body text (first 500 chars):', body.substring(0, 500));
  }

  await browser.close();
  server.kill();
  process.exit(0);
}

main().catch(console.error);
