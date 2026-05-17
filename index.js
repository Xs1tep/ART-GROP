const FIREBASE_URL = 'https://art-group-eebcb-default-rtdb.firebaseio.com';
const FIREBASE_PATH = '/jcrm';
const TG_TOKEN = '8852464996:AAGoIULpUdlfWRv_7oeDOh7Thk13HpMt994';
const TG_CHAT = '6685550868';
const SUPPORT_PHONE = '+373 69 698 841';
const TZ_OFFSET = 3; // UTC+3 Кишинёв

let lastUpdateId = 0;

// Текущее время в UTC+3
function nowLocal() {
  const now = new Date();
  return new Date(now.getTime() + TZ_OFFSET * 60 * 60 * 1000);
}

async function tgSend(text) { await tgSendTo(TG_CHAT, text); }

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

// Сохраняем отправленные напоминания в Firebase чтобы не терять при перезапуске
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

function fd(d) {
  if (!d) return '—';
  const date = new Date(new Date(d).getTime() + TZ_OFFSET * 60 * 60 * 1000);
  return date.toLocaleDateString('ru', {day:'2-digit', month:'2-digit', year:'numeric'});
}

function ft(d) {
  if (!d) return '—';
  const date = new Date(new Date(d).getTime() + TZ_OFFSET * 60 * 60 * 1000);
  return date.toLocaleTimeString('ru', {hour:'2-digit', minute:'2-digit'});
}

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
  const now = new Date(); // UTC

  for (const e of entries) {
    if (e.status !== 'install' || !e.installDate) continue;
    const installTime = new Date(e.installDate); // UTC
    if (isNaN(installTime)) continue;

    const diffMin = Math.round((installTime - now) / 60000);
    const dateStr = fd(e.installDate);
    const timeStr = ft(e.installDate);
    const info = `👤 ${e.clientName}\n📞 ${e.phone||'—'}\n🔢 №${e.orderNum||'—'}\n🏭 ${e.manufacturer||'—'}\n📅 ${dateStr} в ${timeStr}\n📍 ${addrStr(e)}\n💰 ${e.installPayAmount ? e.installPayAmount+' MDL' : '—'}\n💳 ${e.payMethod||'—'}`;

    // За 3 часа (175-185 минут) — расширенное окно
    if (diffMin >= 175 && diffMin <= 185) {
      const key = `3h_${e.id}_${dateStr}`.replace(/\./g, '_');
      if (!sentReminders[key]) {
        await markSent(key);
        await tgSend(`⏰ <b>Монтаж через 3 часа!</b>\n${info}`);
        console.log(`3h reminder: ${e.clientName}`);
      }
    }

    // За 1 час (55-65 минут) — расширенное окно
    if (diffMin >= 55 && diffMin <= 65) {
      const key = `1h_${e.id}_${dateStr}`.replace(/\./g, '_');
      if (!sentReminders[key]) {
        await markSent(key);
        await tgSend(`🚨 <b>Монтаж через 1 час!</b>\n${info}`);
        console.log(`1h reminder: ${e.clientName}`);
      }
    }
  }
}

async function tgDailyDigest() {
  const entries = await getEntries();
  const local = nowLocal();
  const tomorrow = new Date(local);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowStr = tomorrow.toLocaleDateString('ru', {day:'2-digit', month:'2-digit', year:'numeric'});

  function isTomorrow(dateStr) {
    if (!dateStr) return false;
    const d = new Date(new Date(dateStr).getTime() + TZ_OFFSET * 60 * 60 * 1000);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === tomorrow.getTime();
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
    const local = nowLocal();
    const next = new Date(local);
    next.setHours(hour, minute, 0, 0);
    if (local >= next) next.setDate(next.getDate() + 1);
    return next - local;
  }
  function run() { fn(); setTimeout(run, 24*60*60*1000); }
  setTimeout(run, msUntilNext());
  console.log(`Scheduled ${hour}:${String(minute).padStart(2,'0')} (UTC+3), next in ${Math.round(msUntilNext()/60000)} min`);
}

// ===== СТАРТ =====
console.log('CRM Bot started');
tgSend('🤖 <b>CRM Bot запущен</b>\nВсе команды и уведомления активны 24/7');

setInterval(checkInstallReminders, 60*1000);
setInterval(pollUpdates, 3000);
scheduleDaily(17, 0, tgDailyDigest);
