import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

const executablePath = chromePaths.find(p => fs.existsSync(p));
if (!executablePath) {
  console.error('No browser executable found!');
  process.exit(1);
}

const artifactDir = 'C:\\Users\\hp\\.gemini\antigravity-ide\\brain\\d7f6f3ca-4f66-41dd-bc8f-1179ddc6b00e';
fs.mkdirSync(artifactDir, { recursive: true });
fs.mkdirSync('scratch', { recursive: true });

async function run() {
  console.log('Launching browser from:', executablePath);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900']
  });

  const page = await browser.newPage();

  // Navigate to app
  console.log('Navigating to http://localhost:3000...');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  // Check if login screen is present and click admin profile
  const loginBtn = await page.$('button[type="submit"]');
  if (loginBtn) {
    console.log('Login screen detected. Selecting admin profile...');
    const profileButtons = await page.$$('button');
    let adminClicked = false;
    for (const b of profileButtons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.includes('admin') && text.includes('@paymentops.com')) {
        await b.click();
        adminClicked = true;
        break;
      }
    }

    if (!adminClicked) {
      // Fallback: type into inputs
      const usernameInput = await page.$('input[type="text"]');
      const passwordInput = await page.$('input[type="password"]');
      if (usernameInput) await usernameInput.type('admin');
      if (passwordInput) await passwordInput.type('123456');
    }

    await new Promise(r => setTimeout(r, 500));
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('Submitted login form. Waiting for dashboard...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Navigate to Governance tab
  console.log('Navigating to Governance screen (#governance)...');
  await page.goto('http://localhost:3000/#governance', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // If still not on governance, try clicking the sidebar item
  const onGov = await page.evaluate(() => {
    return document.body.innerText.includes('Operational Authority & Dual Authorization Center') ||
           document.body.innerText.includes('Governance & Dual Authorization Center');
  });

  if (!onGov) {
    console.log('Attempting to click Governance in side navigation...');
    const navItems = await page.$$('nav button, aside button, [role="button"]');
    for (const item of navItems) {
      const txt = await page.evaluate(el => el.textContent, item);
      if (txt && (txt.includes('Governance') || txt.includes('Authority'))) {
        await item.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // 1. Capture 1440px Desktop Screenshot
  console.log('Capturing 1440px Desktop Screenshot...');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await new Promise(r => setTimeout(r, 1000));
  const desktopPath1 = path.join(artifactDir, 'governance_1440px_desktop.png');
  await page.screenshot({ path: desktopPath1, fullPage: false });
  fs.copyFileSync(desktopPath1, 'scratch/governance_1440px_desktop.png');
  console.log('Desktop 1440px screenshot saved:', desktopPath1);

  // 2. Capture 375px Mobile Screenshot
  console.log('Capturing 375px Mobile Screenshot...');
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 1000));
  const mobilePath1 = path.join(artifactDir, 'governance_375px_mobile.png');
  await page.screenshot({ path: mobilePath1, fullPage: false });
  fs.copyFileSync(mobilePath1, 'scratch/governance_375px_mobile.png');
  console.log('Mobile 375px screenshot saved:', mobilePath1);

  // 3. Switch to Workflow Bundles tab on Desktop
  console.log('Switching to Workflow Bundles tab at 1440px...');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await new Promise(r => setTimeout(r, 500));
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text && text.includes('Operational Workflow Bundles')) {
      await b.click();
      console.log('Clicked Operational Workflow Bundles tab');
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  const desktopPath2 = path.join(artifactDir, 'governance_bundles_1440px_desktop.png');
  await page.screenshot({ path: desktopPath2, fullPage: false });
  fs.copyFileSync(desktopPath2, 'scratch/governance_bundles_1440px_desktop.png');
  console.log('Desktop 1440px bundles screenshot saved:', desktopPath2);

  // 4. Workflow Bundles on Mobile
  console.log('Capturing Workflow Bundles tab at 375px Mobile...');
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 500));
  const mobileButtons = await page.$$('button');
  for (const b of mobileButtons) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text && text.includes('Operational Workflow Bundles')) {
      await b.click();
      console.log('Clicked Operational Workflow Bundles tab on mobile');
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  const mobilePath2 = path.join(artifactDir, 'governance_bundles_375px_mobile.png');
  await page.screenshot({ path: mobilePath2, fullPage: false });
  fs.copyFileSync(mobilePath2, 'scratch/governance_bundles_375px_mobile.png');
  console.log('Mobile 375px bundles screenshot saved:', mobilePath2);

  await browser.close();
  console.log('Screenshots completed successfully!');
}

run().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
