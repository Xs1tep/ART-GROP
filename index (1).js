const FIREBASE_URL = 'https://art-group-eebcb-default-rtdb.firebaseio.com';
const FIREBASE_PATH = '/jcrm';
const TG_TOKEN = '8852464996:AAGoIULpUdlfWRv_7oeDOh7Thk13HpMt994';
const TG_CHAT = '6685550868';

// Храним уже отправленные напоминания чтобы не дублировать
const sent = new Set();

async function tgSend(text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' })
    });
    const data = await res.json();
    if (!data.ok) console.error('TG error:', data);
  } catch (e) {
    console.error('TG send failed:', e.message);
  }
}

async function getEntries() {
  try {
    const res = await fetch(`${FIREBASE_URL}${FIREBASE_PATH}/entries.json`);
    const data = await res.json();
    if (!data) return [];
    return Object.values(data);
  } catch (e) {
    console.error('Firebase error:', e.message);
    return [];
  }
}

function addrStr(e) {
  return [e.street, e.house].filter(Boolean).join(' ') || e.city || '—';
}

function fd(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ft(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

async function checkInstallReminders() {
  const entries = await getEntries();
  const now = new Date();

  for (const e of entries) {
    if (e.status !== 'install' || !e.installDate) continue;
    const installTime = new Date(e.installDate);
    if (isNaN(installTime)) continue;

    const diffMin = Math.round((installTime - now) / 60000);
    const addr = addrStr(e);
    const timeStr = ft(e.installDate);
    const dateStr = fd(e.installDate);

    const info = `👤 ${e.clientName}\n📞 ${e.phone || '—'}\n🔢 №${e.orderNum || '—'}\n🏭 ${e.manufacturer || '—'}\n📅 ${dateStr} в ${timeStr}\n📍 ${addr}\n💰 ${e.installPayAmount ? e.installPayAmount + ' MDL' : '—'}\n💳 ${e.payMethod || '—'}`;

    // За 3 часа
    if (diffMin >= 179 && diffMin <= 181) {
      const key = `3h_${e.id}_${dateStr}`;
      if (!sent.has(key)) {
        sent.add(key);
        await tgSend(`⏰ <b>Монтаж через 3 часа!</b>\n${info}`);
        console.log(`Sent 3h reminder for ${e.clientName}`);
      }
    }

    // За 1 час
    if (diffMin >= 59 && diffMin <= 61) {
      const key = `1h_${e.id}_${dateStr}`;
      if (!sent.has(key)) {
        sent.add(key);
        await tgSend(`🚨 <b>Монтаж через 1 час!</b>\n${info}`);
        console.log(`Sent 1h reminder for ${e.clientName}`);
      }
    }
  }
}

async function tgDailyDigest() {
  const entries = await getEntries();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowStr = tomorrow.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function isTomorrow(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === tomorrow.getTime();
  }

  const lines = [];

  entries.forEach(e => {
    if ((e.status === 'unprocessed' || e.status === 'measure') && isTomorrow(e.measureDate)) {
      const t = e.measureDate && e.measureDate.includes('T') ? e.measureDate.split('T')[1].slice(0, 5) : '';
      lines.push(`📐 <b>Замер</b>${t ? ' в ' + t : ''}: ${e.clientName} — ${e.phone || '—'} 📍 ${addrStr(e)}`);
    }
    if (e.status === 'install' && isTomorrow(e.installDate)) {
      const t = e.installDate && e.installDate.includes('T') ? e.installDate.split('T')[1].slice(0, 5) : '';
      lines.push(`🔧 <b>Монтаж</b>${t ? ' в ' + t : ''}: ${e.clientName} — ${e.phone || '—'} 📍 ${addrStr(e)}`);
    }
    if (e.status === 'order' && isTomorrow(e.mfrReadyDate)) {
      lines.push(`📦 <b>Заказ готов</b>: ${e.clientName} — ${e.manufacturer || '—'} №${e.orderNum || '—'}`);
    }
  });

  const onReview = entries.filter(e => e.status === 'review');
  if (onReview.length) {
    lines.push(`\n🔍 <b>На проверке (${onReview.length}):</b>`);
    onReview.forEach(e => lines.push(`  • ${e.clientName} — №${e.orderNum || '—'}`));
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
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return next - now;
  }

  function run() {
    fn();
    setTimeout(run, 24 * 60 * 60 * 1000);
  }

  setTimeout(run, msUntilNext());
  console.log(`Scheduled daily job at ${hour}:${String(minute).padStart(2,'0')}, next run in ${Math.round(msUntilNext()/60000)} min`);
}

// Старт
console.log('CRM Bot started');
tgSend('🤖 <b>CRM Bot запущен</b>\nУведомления активны 24/7');

// Каждую минуту проверяем напоминания о монтаже
setInterval(checkInstallReminders, 60 * 1000);

// Дайджест в 17:00
scheduleDaily(17, 0, tgDailyDigest);
