# Operational Transaction Discrepancy & Resolution Terminal

A modern, highly responsive operations terminal designed for transactional discrepancy tracking, automated reconciliation validation, and technical query routing.

---

## 🚀 How to Run and Use Locally

This application is built using **React 19**, **Vite 6**, and **Tailwind CSS v4**. You can run it locally in your web browser or pack it inside an **Electron** desktop shell.

---

### Method A: Running as a Local Web App (Recommended)

#### 1. Prerequisites
Ensure you have **Node.js** (v18.0.0 or higher) and **npm** installed on your machine.
- Download Node.js: [https://nodejs.org](https://nodejs.org)

#### 2. Install Dependencies
Extract your exported ZIP archive or clone the repository, open your command terminal in the project directory, and run:
```bash
npm install
```

#### 3. Run the Development Server
Launch the real-time responsive local developer environment:
```bash
npm run dev
```
Once started, open your web browser and navigate to:
👉 **`http://localhost:3000`**

#### 4. Build for Production Compilation
Compile optimized, production-grade static bundle files:
```bash
npm run build
```

---

### Method B: Running as an Electron Desktop App

If you want to package and launch this application directly inside a standalone desktop window using **Electron** (as requested in the design specs), follow these quick steps:

#### 1. Install Electron Packages
Install `electron` as a development dependency:
```bash
npm install electron --save-dev
```

#### 2. Create the Electron Entrypoint Script (`main.js`)
Create a file named `main.js` at the root of your project directory and add the following script:

```javascript
// main.js
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    titleBarStyle: 'hidden', // Hides the native OS title bar to favor the customized TitleBar component
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // During development, load the running Vite port:
  mainWindow.loadURL('http://localhost:3000');
  
  // Or load the production compiled build in release mode:
  // mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

#### 3. Add Launch Command to `package.json`
Open your `package.json` and add the `"main": "main.js"` entrypoint along with a `"desktop"` running script inside the `"scripts"` block:
```json
{
  "name": "react-example",
  "version": "0.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "desktop": "electron ."
  }
}
```

#### 4. Boot Up the Desktop Application!
1. Start your background Vite compiler in terminal 1:
   ```bash
   npm run dev
   ```
2. Run your desktop container shell in terminal 2:
   ```bash
   npm run desktop
   ```

---

## 📂 System User Account Matrix (Local Credentials)

By default, the platform enforces **Role-Based Access Control (RBAC)**. You can log in using these preset credentials, or register a new account on the login screen (which can be approved inside the **System Administration** panel):

| Username | Password | Role | Clearance Capability |
| :--- | :--- | :--- | :--- |
| **admin** | `admin123` | **Administrator** | Full user management, DB mappings, overriding privileges |
| **operator** | `ops123` | **Operational User** | Raise issues, download/upload criteria, run sandbox tests |
| **tech** | `tech123` | **Technical User** | Deep investigate, script SQL resolutions, batch-execute on files |
| **manager** | `mgr123` | **Managerial User** | Read-only metrics dashboard, audit trace log verification |
