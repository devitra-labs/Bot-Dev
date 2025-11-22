// =======================================================
// 🚀 Devitra Official WhatsApp Bot + Admin Panel
// =======================================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import qrcode from "qrcode-terminal";
import multer from "multer";
import * as XLSX from "xlsx";
import pkg from "whatsapp-web.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Client, LocalAuth } = pkg;

// =======================================================
// 🛠️ EXPRESS CONFIG
// =======================================================
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "web"))); // Static Tailwind Web

// =======================================================
// 📁 FILE DATABASE
// =======================================================
// 📌 Lokasi database.json (global)
const DB_PATH = path.join(__dirname, "database.json");


// 🔥 Tambahkan endpoint ini
app.get("/api/data", (req, res) => {
  const dbpath = path.join(__dirname, "database.json");
  fs.readFile(dbpath, "utf-8", (err, data) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(JSON.parse(data));
  });
});

const ADMIN_PATH = "./admin.json";

function loadDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "[]");
  return JSON.parse(fs.readFileSync(DB_PATH));
}
function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}
function loadAdmin() {
  if (!fs.existsSync(ADMIN_PATH)) fs.writeFileSync(ADMIN_PATH, "[]");
  return JSON.parse(fs.readFileSync(ADMIN_PATH));
}

// =======================================================
// 📌 MULTER (UPLOAD PAYMENT PROOF)
// =======================================================
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// =======================================================
// 🤖 WHATSAPP CLIENT
// =======================================================
console.log("🚀 Starting WhatsApp Bot...");
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", (qr) => {
  console.log("\n📌 Scan QR untuk login Bot:\n");
  qrcode.generate(qr, { small: true });
});
client.on("ready", () => console.log("🤖 BOT DEVITRA SIAP DIGUNAKAN!"));
client.on("authenticated", () => console.log("🔐 AUTHENTICATED"));
client.on("auth_failure", () => console.log("❌ AUTH FAILED — Hapus folder .wwebjs_auth"));
client.on("disconnected", (r) => console.log("⚠️ DISCONNECTED:", r));
client.initialize();

// =======================
// 📌 ID GRUP ADMIN (WAJIB BENAR)
// =======================
const forwardGroupId = "120363424021306629@g.us"; // <- ganti jika perlu

// =======================
// Message state (per-user)
// =======================
const userState = new Map(); // key: from (e.g. '6281xxx@c.us') => { state: string, ts: number }

// Helper: show main menu
function mainMenuText(name = "Pengguna") {
  return `👋 Hai *${name}*, selamat datang di *Devitra Official Bot*\n\nSilakan pilih layanan:\n1. Cek Pembayaran\n2. Terhubung ke Admin\n\nBalas dengan nomor menu (1 atau 2).\nKetik *menu* kapan saja untuk kembali.`;
}

// =======================================================
// 📩 MESSAGE HANDLER (stateful & robust)
// =======================================================
client.on("message", async (msg) => {
  try {
    const textRaw = msg.body?.trim();
    if (!textRaw) return;
    const text = textRaw.toLowerCase();
    const from = msg.from; // '6281xxx@c.us'

    // Ignore group messages
    if (msg.author || msg.from.endsWith("@g.us") || msg.isGroupMsg) return;

    // Get contact info
    const contact = await msg.getContact();
    const senderName = contact.pushname || contact.number || from;

    // Read/ensure state object
    const info = userState.get(from) || { state: null, ts: Date.now() };
    const state = info.state;

    console.log(`[MSG] From=${from} State=${state} Text="${textRaw}"`);

    // Normalize cancellation or menu commands
    const isMenuCmd = text === "menu" || text === "m";
    const isCancelCmd = text === "cancel" || text === "/cancel";

    // If no state: require greeting/menu or prompt user
    if (!state) {
      if (text.includes("assalam") || text.includes("assalamu") || text.includes("halo") || text.includes("hi") || isMenuCmd) {
        userState.set(from, { state: "awaiting_menu", ts: Date.now() });
        await msg.reply(mainMenuText(senderName));
        return;
      }

      // Not greeting/menu: prompt to send menu (do not forward)
      await msg.reply(`👋 Hai *${senderName}*, silakan ketik *menu* untuk mulai menggunakan layanan Devitra.`);
      return;
    }

    // If user asked menu or cancel while in any flow: reset to awaiting_menu
    if (isMenuCmd || isCancelCmd) {
      userState.set(from, { state: "awaiting_menu", ts: Date.now() });
      await msg.reply(mainMenuText(senderName));
      return;
    }

    // Awaiting menu selection
    if (state === "awaiting_menu") {
      if (text === "1") {
        userState.set(from, { state: "awaiting_payment_code", ts: Date.now() });
        await msg.reply(`📌 *Cek Pembayaran*\nSilakan kirim *KODE PEMBAYARAN* Anda (contoh: ABC123).`);
        return;
      }
      if (text === "2") {
        userState.set(from, { state: "awaiting_admin_message", ts: Date.now() });
        await msg.reply(`📨 *Terhubung ke Admin*\nSilakan ketik pesan Anda. Pesan akan diteruskan ke Admin setelah Anda mengirimkannya.`);
        return;
      }

      await msg.reply("⚠️ Pilihan tidak dikenali. Ketik *1* untuk Cek Pembayaran atau *2* untuk Terhubung ke Admin.");
      return;
    }

    // Awaiting payment code
    if (state === "awaiting_payment_code") {
      // allow user to go back with menu/cancel handled above
      // validate code format
      if (!/^[a-z0-9]{5,10}$/i.test(text)) {
        // let user retry (do not reset state), but give helpful message
        await msg.reply("⚠️ Format kode tidak valid. Kode terdiri dari 5–10 karakter alfanumerik. Silakan coba lagi atau ketik *menu* untuk kembali.");
        return;
      }

      // format valid — check DB
      const db = loadDB();
      const find = db.find(x => x.kode && x.kode.toLowerCase() === text);

      if (!find) {
        // keep state so user can retry, but inform not found
        await msg.reply("❌ Kode tidak ditemukan atau belum membayar. Silakan periksa kembali atau ketik *menu* untuk kembali.");
        return;
      }

      // found — reply and reset
      await msg.reply(
`✔️ *Pembayaran Ditemukan*\n\n👤 Nama: ${find.nama}\n💳 Kode: ${find.kode}\n💰 Status: *${find.status}*\n\n🙏 Terima kasih`
      );
      userState.set(from, { state: null, ts: Date.now() });
      return;
    }

    // Awaiting admin message — forward one message then reset
    if (state === "awaiting_admin_message") {
      const forwardText =
`📩 *Pesan Dari User*
---------------------------------
👤 *Nama:* ${senderName}
📱 *Nomor:* ${contact.number}

💬 *Pesan:*
${textRaw}`;

      try {
        await client.sendMessage(forwardGroupId, forwardText);
        await msg.reply("📨 Pesan Anda sudah diteruskan ke Admin. Mohon tunggu balasan. Terima kasih 🙏");
      } catch (err) {
        console.error("[FORWARD_ERR]", err);
        await msg.reply("⚠️ Gagal meneruskan pesan ke admin. Pastikan bot telah ditambahkan ke grup admin dan memiliki izin. Silakan coba lagi nanti.");
      }

      // reset state
      userState.set(from, { state: null, ts: Date.now() });
      return;
    }

    // fallback: reset and prompt
    userState.set(from, { state: null, ts: Date.now() });
    await msg.reply("⚠️ Terjadi kesalahan, silakan ketik *menu* untuk memulai lagi.");

  } catch (err) {
    console.error("❌ ERROR HANDLE MESSAGE:", err);
  }
});

// =======================================================
// 🔐 LOGIN PANEL ADMIN
// =======================================================
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const admin = loadAdmin().find(a => a.username === username && a.password === password);
  if (!admin) return res.status(401).json({ message: "Login salah" });
  res.json({ success: true });
});

// =======================================================
// 📤 UPLOAD BUKTI PEMBAYARAN
// =======================================================
app.post("/api/upload", upload.single("bukti"), (req, res) => {
  const { kode } = req.body;
  const data = loadDB();
  const find = data.find(x => x.kode === kode);
  if (!find) return res.status(404).json({ message: "Kode tidak ditemukan" });
  find.status = "LUNAS";
  find.bukti = req.file.filename;
  saveDB(data);
  res.json({ success: true });
});

// =======================================================
// 🧾 EXPORT DATA EXCEL
// =======================================================
app.get("/api/export", (req, res) => {
  const data = loadDB();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Pembayaran");
  XLSX.writeFile(wb, "pembayaran.xlsx");
  res.download("pembayaran.xlsx");
});

// =======================================================
// 💌 FORM WEBSITE → WHATSAPP (Nomor Admin)
// =======================================================
app.post("/send-message", async (req, res) => {
  const { name, email, subject, message } = req.body;
  const targetNumber = "6281456070180@c.us";

  try {
    await client.sendMessage(
      targetNumber,
      `📨 *Pesan Baru Dari Website*\n👤 ${name}\n📧 ${email}\n📝 ${subject}\n💬 ${message}`
    );
    res.json({ status: "success" });
  } catch {
    res.status(500).json({ error: "Gagal mengirim pesan ke admin" });
  }
});

// =======================================================
app.get("/", (req, res) => res.send("🚀 Devitra Bot Server Running"));
app.listen(3000, () => console.log("🌐 Tailwind Panel http://localhost:3000"));
