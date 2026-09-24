import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

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

  // Attempt to navigate to #governance
  console.log('Navigating to #governance...');
  await page.goto('http://localhost:3000/#governance', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const hasGovernanceText = await page.evaluate(() => {
    return document.body.innerText.includes('Operational Authority & Dual Authorization Center') ||
           document.body.innerText.includes('Governance & Dual Authorization Center');
  });

  const hasGovernanceNav = await page.$('#nav-governance');

  console.log('Has Governance Screen text:', hasGovernanceText);
  console.log('Has #nav-governance in DOM:', !!hasGovernanceNav);

  await page.screenshot({ path: 'scratch/verified_no_governance_1440px.png', fullPage: false });

  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'scratch/verified_no_governance_375px.png', fullPage: false });

  await browser.close();
  console.log('Verification finished successfully.');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
