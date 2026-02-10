const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const {
    execSync
} = require('child_process');
require('dotenv').config();

const app = express();
let browser;

const PORT = process.env.PORT || 3000;
const folderPath = path.join(__dirname, 'hasil_screen');

// =====================
// Pastikan folder ada
// =====================
if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
}

// =====================
// Middleware
// =====================
app.use(express.json());
app.use(express.static('public'));
app.use('/hasil_screen', express.static(folderPath));

// =====================
// Cari Chrome otomatis
// =====================
function findChromePath() {
    const candidates = [
        'google-chrome-stable',
        'google-chrome',
        'chromium-browser',
        'chromium'
    ];

    for (const cmd of candidates) {
        try {
            const result = execSync(`which ${cmd}`, {
                stdio: ['pipe', 'pipe', 'ignore']
            }).toString().trim();

            if (result) return result;
        } catch (e) {}
    }

    throw new Error('Chrome / Chromium tidak ditemukan di server');
}

// =====================
// Init Browser (GLOBAL)
// =====================
(async () => {
    try {
        const chromePath = process.env.CHR_PATH || findChromePath();
        console.log(`✅ Chrome ditemukan di: ${chromePath}`);

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        console.log('✅ Browser siap digunakan');
    } catch (err) {
        console.error('❌ Gagal menjalankan browser:', err.message);
        process.exit(1);
    }
})();

// =====================
// ENDPOINT CAPTURE
// =====================
app.get('/capture', async (req, res) => {
    let page;
    try {
        if (!browser) {
            return res.status(500).json({
                status: false,
                message: 'Browser belum siap'
            });
        }

        const url = req.query.url;
        if (!url) {
            return res.status(400).json({
                status: false,
                message: 'Parameter url wajib diisi'
            });
        }

        const filename = req.query.filename || `capture_${Date.now()}`;
        console.log(`📸 Capture dimulai: ${url}`);

        // =====================
        // BUAT PAGE BARU
        // =====================
        page = await browser.newPage();

        // =====================
        // SETTING DASAR
        // =====================
        await page.setCacheEnabled(false);

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/120.0.0.0 Safari/537.36'
        );

        await page.setViewport({
            width: 1200,
            height: 900,
            deviceScaleFactor: 2
        });

        // =====================
        // CLEAR CACHE & STORAGE
        // =====================
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
        await client.send('Network.setBypassServiceWorker', {
            bypass: true
        });

        await page.evaluateOnNewDocument(() => {
            localStorage.clear();
            sessionStorage.clear();
        });

        // =====================
        // LOAD PAGE
        // =====================
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // =====================
        // TUNGGU ELEMEN FIX
        // =====================
        await page.waitForSelector('#capture', {
            visible: true,
            timeout: 30000
        });

        await page.waitForFunction(() => {
            const el = document.querySelector('#capture');
            return el && el.offsetHeight > 100;
        });

        // =====================
        // SCREENSHOT
        // =====================
        const fileName = `${filename}.png`;
        const savePath = path.join(folderPath, fileName);

        const element = await page.$('#capture');
        await element.screenshot({
            path: savePath
        });

        console.log('✅ Screenshot berhasil:', savePath);

        await page.close();

        res.json({
            status: true,
            file: fileName,
            url: `/hasil_screen/${fileName}`
        });

    } catch (err) {
        console.error('❌ Capture gagal:', err);
        if (page) await page.close();

        res.status(500).json({
            status: false,
            message: 'Gagal mengambil screenshot',
            error: err.toString()
        });
    }
});

// =====================
// LIST FILE
// =====================
app.get('/screens', (req, res) => {
    const files = fs.readdirSync(folderPath).map(f => ({
        name: f,
        url: `/hasil_screen/${f}`
    }));
    res.json(files);
});

// =====================
// HAPUS 1 FILE
// =====================
app.delete('/delete/:filename', (req, res) => {
    const filePath = path.join(folderPath, req.params.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({
            status: true
        });
    } else {
        res.status(404).json({
            status: false
        });
    }
});

// Hapus semua file 
app.delete('/delete-all', (req, res) => {
    fs.readdirSync(folderPath).forEach(file => {
        fs.unlinkSync(path.join(folderPath, file));
    });
    res.json({
        status: true,
        message: 'Semua file dihapus'
    });
});

// =====================
// CLEAN SHUTDOWN
// =====================
process.on('SIGINT', async () => {
    console.log('\n🛑 Menutup browser...');
    if (browser) await browser.close();
    process.exit();
});

// =====================
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
});