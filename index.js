const FIREBASE_URL = 'https://art-group-eebcb-default-rtdb.firebaseio.com';
const FIREBASE_PATH = '/jcrm';
const TG_TOKEN = '8852464996:AAGoIULpUdlfWRv_7oeDOh7Thk13HpMt994';
const TG_CHATS = ["6685550868", "8346672906", "6489718684", "7993612373"];
const SUPPORT_PHONE = '+373 69 698 841';

let lastUpdateId = 0;

// Парсим дату из CRM (хранится как локальное время Кишинёва без зоны)
// "2026-05-17T14:27" => Date объект в UTC
function parseLocalDate(str) {
  if (!str) return null;
  // Убираем Z если есть, добавляем +03:00
  const clean = str.replace('Z', '');
  const d = new Date(clean + '+03:00');
  return isNaN(d) ? null : d;
}

function fd(str) {
  if (!str) return '—';
  const d = parseLocalDate(str);
  if (!d) return '—';
  return d.toLocaleDateString('ru', {timeZone:'Europe/Chisinau', day:'2-digit', month:'2-digit', year:'numeric'});
}

function ft(str) {
  if (!str) return '—';
  const d = parseLocalDate(str);
  if (!d) return '—';
  return d.toLocaleTimeString('ru', {timeZone:'Europe/Chisinau', hour:'2-digit', minute:'2-digit'});
}

function nowLocal() {
  return new Date();
}

async function tgSend(text) { for (const id of TG_CHATS) await tgSendTo(id, text); }

async function tgSendTo(chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    const data = await res.json();
    if (!data.ok) console.error('TG error:', data);
  } catch (e) { console.error('TG send failed:', e.message); }
}

async function getEntries() {
  try {
    const res = await fetch(`${FIREBASE_URL}${FIREBASE_PATH}/entries.json`);
    const data = await res.json();
    if (!data) return [];
    return Object.values(data);
  } catch (e) { console.error('Firebase error:', e.message); return []; }
}

async function getSentReminders() {
  try {
    const res = await fetch(`${FIREBASE_URL}${FIREBASE_PATH}/tg_reminders.json`);
    const data = await res.json();
    return data || {};
  } catch (e) { return {}; }
}

async function markSent(key) {
  try {
    await fetch(`${FIREBASE_URL}${FIREBASE_PATH}/tg_reminders/${key}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Date.now())
    });
  } catch (e) { console.error('markSent error:', e.message); }
}

function addrStr(e) { return [e.street, e.house].filter(Boolean).join(' ') || e.city || '—'; }

async function cmdStart(chatId) {
  await tgSendTo(chatId,
`👋 <b>Добро пожаловать в бот ART-GROUP!</b>

🏠 Здесь вы получаете все уведомления по заказам компании в режиме реального времени.

📬 <b>Что присылает бот:</b>
📋 Новая заявка — сразу после создания
🔧 Заказ → Монтаж — когда готов к монтажу
⏰ За 3 часа до монтажа — напоминание
🚨 За 1 час до монтажа — финальное напоминание
🔍 На проверке — после завершения монтажа
✅ Заказ завершён — закрытие заказа
🗓 Дайджест в 17:00 — события на завтра

Бот работает <b>24/7</b> и не пропустит ни одного события! 💪
Используйте меню внизу для навигации 👇`);
}

async function cmdHelp(chatId) {
  await tgSendTo(chatId,
`📖 <b>Инструкция по работе с ботом ART-GROUP</b>

/start — Приветствие и описание бота
/orders — Список активных заказов
/archive — История завершённых заказов
/balance — Суммы оплат по заказам
/support — Связаться с диспетчером
/help — Эта инструкция

Бот автоматически присылает уведомления при любых изменениях в CRM. Всё работает само! 🤖`);
}

async function cmdOrders(chatId) {
  const entries = await getEntries();
  const active = entries.filter(e => ['request','unprocessed','measure','order','install','review','in_work','wait'].includes(e.status));
  if (!active.length) { await tgSendTo(chatId, '📋 <b>Активные заказы</b>\n\nАктивных заказов нет.'); return; }
  const names = { request:'📋 Заявка', unprocessed:'🔴 Необработан', measure:'📐 Замер', order:'📦 Заказ', install:'🔧 Монтаж', review:'🔍 На проверке', in_work:'⚙️ В работе', wait:'⏳ Ожидание' };
  let msg = `📋 <b>Активные заказы (${active.length}):</b>\n\n`;
  active.forEach((e, i) => {
    msg += `${i+1}. ${names[e.status]||e.status}\n👤 ${e.clientName}\n📞 ${e.phone||'—'}\n🔢 №${e.orderNum||'—'}\n📍 ${addrStr(e)}\n\n`;
  });
  await tgSendTo(chatId, msg);
}

async function cmdArchive(chatId) {
  const entries = await getEntries();
  const closed = entries.filter(e => ['closed','archive','closed-install','closed-order'].includes(e.status));
  if (!closed.length) { await tgSendTo(chatId, '📁 <b>История заказов</b>\n\nЗавершённых заказов нет.'); return; }
  let msg = `📁 <b>История завершённых заказов (${closed.length}):</b>\n\n`;
  closed.slice(-15).reverse().forEach((e, i) => {
    msg += `${i+1}. ✅ <b>${e.clientName}</b>\n📞 ${e.phone||'—'}\n🔢 №${e.orderNum||'—'}\n💰 ${e.measureTotal ? e.measureTotal+' MDL' : '—'}\n\n`;
  });
  if (closed.length > 15) msg += `<i>Показаны последние 15 из ${closed.length}</i>`;
  await tgSendTo(chatId, msg);
}

async function cmdBalance(chatId) {
  const entries = await getEntries();
  const withPay = entries.filter(e => e.installPayAmount || e.measureTotal);
  if (!withPay.length) { await tgSendTo(chatId, '💰 <b>Баланс</b>\n\nДанных об оплатах нет.'); return; }
  let totalInstall = 0, totalMeasure = 0;
  withPay.forEach(e => {
    if (e.installPayAmount) totalInstall += parseFloat(e.installPayAmount)||0;
    if (e.measureTotal) totalMeasure += parseFloat(e.measureTotal)||0;
  });
  const total = totalInstall + totalMeasure;
  await tgSendTo(chatId,
`💰 <b>Баланс и выплаты ART-GROUP</b>

💳 Оплата за монтаж: <b>${totalInstall.toLocaleString()} MDL</b>
📐 Сумма по замерам: <b>${totalMeasure.toLocaleString()} MDL</b>
━━━━━━━━━━━━━━
📊 Итого: <b>${total.toLocaleString()} MDL</b>

📁 Записей с оплатой: ${withPay.length}`);
}

async function cmdSupport(chatId) {
  await tgSendTo(chatId,
`🎧 <b>Связаться с диспетчером ART-GROUP</b>

📞 <b>Телефон:</b> ${SUPPORT_PHONE}

Звоните или пишите в любое время — мы всегда на связи! 💬`);
}

async function pollUpdates() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=${lastUpdateId+1}&timeout=10`);
    const data = await res.json();
    if (!data.ok || !data.result.length) return;
    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || !msg.text) continue;
      const chatId = msg.chat.id;
      const text = msg.text.trim().toLowerCase();
      console.log(`Command: ${text} from ${chatId}`);
      if (text === '/start' || text === 'старт') await cmdStart(chatId);
      else if (text === '/help') await cmdHelp(chatId);
      else if (text === '/orders') await cmdOrders(chatId);
      else if (text === '/archive') await cmdArchive(chatId);
      else if (text === '/balance') await cmdBalance(chatId);
      else if (text === '/support') await cmdSupport(chatId);
    }
  } catch (e) { console.error('Poll error:', e.message); }
}

async function checkInstallReminders() {
  const entries = await getEntries();
  const sentReminders = await getSentReminders();
  const now = new Date();

  for (const e of entries) {
    if (e.status !== 'install' || !e.installDate) continue;

    const installTime = parseLocalDate(e.installDate);
    if (!installTime) continue;

    const diffMin = Math.round((installTime - now) / 60000);
    const dateStr = fd(e.installDate);
    const timeStr = ft(e.installDate);

    console.log(`Check: ${e.clientName}, installDate: ${e.installDate}, diffMin: ${diffMin}`);

    const info = `👤 ${e.clientName}\n📞 ${e.phone||'—'}\n🔢 №${e.orderNum||'—'}\n🏭 ${e.manufacturer||'—'}\n📅 ${dateStr} в ${timeStr}\n📍 ${addrStr(e)}\n💰 ${e.installPayAmount ? e.installPayAmount+' MDL' : '—'}\n💳 ${e.payMethod||'—'}`;

    // За 3 часа (175-185 минут)
    if (diffMin >= 175 && diffMin <= 185) {
      const key = `3h_${e.id}_${dateStr}`.replace(/[./\s]/g, '_');
      if (!sentReminders[key]) {
        await markSent(key);
        await tgSend(`⏰ <b>Монтаж через 3 часа!</b>\n${info}`);
        console.log(`3h reminder sent: ${e.clientName}`);
      }
    }

    // За 1 час (55-65 минут)
    if (diffMin >= 55 && diffMin <= 65) {
      const key = `1h_${e.id}_${dateStr}`.replace(/[./\s]/g, '_');
      if (!sentReminders[key]) {
        await markSent(key);
        await tgSend(`🚨 <b>Монтаж через 1 час!</b>\n${info}`);
        console.log(`1h reminder sent: ${e.clientName}`);
      }
    }
  }
}

async function tgDailyDigest() {
  const entries = await getEntries();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Завтра по Кишинёву
  const tomorrowLocal = new Date(tomorrow.toLocaleDateString('en', {timeZone:'Europe/Chisinau'}));
  const tomorrowStr = tomorrow.toLocaleDateString('ru', {timeZone:'Europe/Chisinau', day:'2-digit', month:'2-digit', year:'numeric'});

  function isTomorrow(dateStr) {
    if (!dateStr) return false;
    const d = parseLocalDate(dateStr);
    if (!d) return false;
    const dLocal = d.toLocaleDateString('en', {timeZone:'Europe/Chisinau'});
    const tomorrowLocalStr = tomorrow.toLocaleDateString('en', {timeZone:'Europe/Chisinau'});
    return dLocal === tomorrowLocalStr;
  }

  const lines = [];
  entries.forEach(e => {
    if ((e.status==='unprocessed'||e.status==='measure') && isTomorrow(e.measureDate)) {
      lines.push(`📐 <b>Замер</b> в ${ft(e.measureDate)}: ${e.clientName} — ${e.phone||'—'} 📍 ${addrStr(e)}`);
    }
    if (e.status==='install' && isTomorrow(e.installDate)) {
      lines.push(`🔧 <b>Монтаж</b> в ${ft(e.installDate)}: ${e.clientName} — ${e.phone||'—'} 📍 ${addrStr(e)}`);
    }
    if (e.status==='order' && isTomorrow(e.mfrReadyDate)) {
      lines.push(`📦 <b>Заказ готов</b>: ${e.clientName} — ${e.manufacturer||'—'} №${e.orderNum||'—'}`);
    }
  });

  const onReview = entries.filter(e => e.status==='review');
  if (onReview.length) {
    lines.push(`\n🔍 <b>На проверке (${onReview.length}):</b>`);
    onReview.forEach(e => lines.push(`  • ${e.clientName} — №${e.orderNum||'—'}`));
  }

  if (!lines.length) {
    await tgSend(`🗓 <b>ART-GROUP · ${tomorrowStr}</b>\n\nНа завтра событий нет ✅`);
  } else {
    await tgSend(`🗓 <b>ART-GROUP · События на ${tomorrowStr}</b>\n\n` + lines.join('\n'));
  }
  console.log('Daily digest sent');
}

function scheduleDaily(hour, minute, fn) {
  function msUntilNext() {
    const now = new Date();
    const nowChisinau = new Date(now.toLocaleString('en', {timeZone:'Europe/Chisinau'}));
    const next = new Date(nowChisinau);
    next.setHours(hour, minute, 0, 0);
    if (nowChisinau >= next) next.setDate(next.getDate() + 1);
    return next - nowChisinau;
  }
  function run() { fn(); setTimeout(run, 24*60*60*1000); }
  setTimeout(run, msUntilNext());
  console.log(`Scheduled ${hour}:${String(minute).padStart(2,'0')} Chisinau time, next in ${Math.round(msUntilNext()/60000)} min`);
}

// ===== СТАРТ =====
console.log('CRM Bot started');
tgSend('🤖 <b>CRM Bot перезапущен</b>\nВсе команды и уведомления активны 24/7');

setInterval(checkInstallReminders, 60*1000);
setInterval(pollUpdates, 3000);
scheduleDaily(17, 0, tgDailyDigest);
