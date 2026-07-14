/* ==========================================================================
   法人スマホLP - 問い合わせ中継サーバー
   LP（GitHub Pages）から送られた内容を受け取り、
   ① Gmailで担当者に通知  ② Gmailでお客様に自動返信  ③ ChatWorkに通知
   を行う。鍵（パスワード・トークン）はこのサーバーの .env だけに置く。
   ========================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

/* ---------- 設定の読み込み ---------- */
const ENV_PATH = path.join(process.cwd(), '.env');
const env = {};
if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  });
}

const CONFIG = {
  port: Number(env.PORT || 3900),
  // 送信元Gmail（アプリパスワードを使う）
  gmailUser: env.GMAIL_USER || '',
  gmailPass: (env.GMAIL_APP_PASSWORD || '').replace(/\s/g, ''),
  // 問い合わせ通知の宛先（担当者）
  notifyTo: env.NOTIFY_TO || '',
  // ChatWork（未設定なら通知しない）
  chatworkToken: env.CHATWORK_TOKEN || '',
  chatworkRoom: env.CHATWORK_ROOM || '',
  // このLPからのアクセスだけ許可する
  allowedOrigin: env.ALLOWED_ORIGIN || 'https://hito-hue.github.io',
  // 保存先（届いた内容の控え）
  logFile: path.join(process.cwd(), 'leads.jsonl')
};

// pool: 接続を使い回す。1通ごとにGmailへつなぎ直す（毎回0.5秒前後）のを避ける
const mailer = CONFIG.gmailUser && CONFIG.gmailPass
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: CONFIG.gmailUser, pass: CONFIG.gmailPass },
      pool: true,
      maxConnections: 2,
      maxMessages: 50
    })
  : null;

/* ---------- お客様への自動返信の文面 ---------- */
function buildAutoResponse(d) {
  const name = d.name ? `${d.name} 様` : 'お客様';
  return [
    name,
    '',
    'この度は、法人携帯・通信費の見直しに関する広告をご覧いただき、',
    'お問い合わせいただきありがとうございます。',
    '株式会社アイ・ステーションです。',
    '',
    '本サービスでは、現在の携帯・通信環境を確認したうえで、',
    '月々のコスト削減や、法人携帯の管理面の見直しをご提案しています。',
    '',
    '後ほど担当者より、ご入力いただいたお電話番号宛にご連絡させていただきます。',
    'お電話では、現在のご利用状況を簡単にお伺いし、',
    '削減可能性や見直しのポイントをご案内いたします。',
    '',
    'お忙しいところ恐れ入りますが、',
    '担当者からの着信をお待ちいただけますと幸いです。',
    '',
    '（ご連絡は、知らない番号からの着信となる場合がございます。',
    '　本件に関するご連絡ですので、お受けいただけますようお願いいたします）',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '株式会社アイ・ステーション',
    '法人携帯・通信費見直し窓口',
    '受付時間：平日 9:00〜19:00',
    'https://i-sta.co.jp/',
    '━━━━━━━━━━━━━━━━━━━━'
  ].join('\n');
}

/* ---------- 担当者への通知の文面 ---------- */
function buildNotification(d) {
  const rows = [
    ['会社形態', d.company_type],
    ['会社名・屋号', d.company_name],
    ['おなまえ', d.name],
    ['電話番号', d.tel],
    ['都道府県', d.prefecture],
    ['メールアドレス', d.email],
    ['連絡希望時間', d.contact_time || '指定なし'],
    ['ご相談内容', d.message],
    ['', ''],
    ['流入元', [d.utm_source, d.utm_campaign, d.utm_content].filter(Boolean).join(' / ') || '直接'],
    ['配信面', d.placement],
    ['広告ID', d.utm_id]
  ];
  return rows
    .filter((r) => r[0] === '' || r[1])
    .map((r) => (r[0] === '' ? '' : `${r[0]}：${r[1]}`))
    .join('\n');
}

/* ---------- 送信元が正しいか・中身が妥当かを確認 ---------- */
function isValidLead(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.website) return false;                       // 罠フィールド＝ボット
  if (!d.name || !d.tel || !d.email) return false;   // 必須が欠けている
  if (!/^[0-9]{10,11}$/.test(String(d.tel))) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email))) return false;
  return true;
}

/* ---------- 同じ人からの連続送信を弾く（簡易） ---------- */
const recent = new Map();
function isDuplicate(d) {
  const key = `${d.tel}|${d.email}`;
  const now = Date.now();
  const last = recent.get(key);
  recent.set(key, now);
  // 古い記録を掃除
  for (const [k, t] of recent) if (now - t > 10 * 60 * 1000) recent.delete(k);
  return last && now - last < 60 * 1000; // 1分以内の再送は重複とみなす
}

/* ---------- ChatWork通知 ---------- */
async function notifyChatwork(d) {
  if (!CONFIG.chatworkToken || !CONFIG.chatworkRoom) return 'skipped';

  const body =
    '[info][title]【LP】新しい無料相談が届きました[/title]' +
    buildNotification(d) +
    '[/info]';

  const res = await fetch(
    `https://api.chatwork.com/v2/rooms/${CONFIG.chatworkRoom}/messages`,
    {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': CONFIG.chatworkToken,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ body })
    }
  );
  if (!res.ok) throw new Error(`chatwork ${res.status}`);
  return 'sent';
}

/* ---------- メール送信 ---------- */
async function sendMails(d) {
  if (!mailer) throw new Error('Gmailが未設定です（.env の GMAIL_USER / GMAIL_APP_PASSWORD）');

  // ① 担当者へ通知
  await mailer.sendMail({
    from: `法人スマホLP <${CONFIG.gmailUser}>`,
    to: CONFIG.notifyTo || CONFIG.gmailUser,
    replyTo: d.email,
    subject: `【LP】無料相談：${d.company_name || d.name} 様`,
    text: buildNotification(d)
  });

  // ② お客様へ自動返信
  await mailer.sendMail({
    from: `株式会社アイ・ステーション <${CONFIG.gmailUser}>`,
    to: d.email,
    subject: '【お問い合わせありがとうございます】法人携帯・通信費の見直しについて',
    text: buildAutoResponse(d)
  });

  return 'sent';
}

/* ---------- サーバー本体 ---------- */
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const cors = {
    'Access-Control-Allow-Origin': origin === CONFIG.allowedOrigin ? origin : CONFIG.allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      gmail: Boolean(mailer),
      chatwork: Boolean(CONFIG.chatworkToken && CONFIG.chatworkRoom)
    }));
  }

  if (req.method !== 'POST') {
    res.writeHead(405, cors);
    return res.end();
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 20000) req.destroy(); // 巨大な送信は切る
  });

  req.on('end', async () => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
    }

    if (!isValidLead(data)) {
      // ボットや不正な送信は、静かに成功を返して相手に情報を与えない
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (isDuplicate(data)) {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, duplicate: true }));
    }

    // 届いた内容は必ず控えを残す（メールが落ちてもリードを失わない）
    try {
      fs.appendFileSync(
        CONFIG.logFile,
        JSON.stringify({ at: new Date().toISOString(), ...data }) + '\n'
      );
    } catch (e) {
      console.error('[lead] 保存に失敗', e.message);
    }

    // 控えを残した時点で「受け付けた」ことは確定。
    // メールとChatWorkの完了は待たない＝お客様はすぐサンクスページへ進める。
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, queued: true }));

    // 通知は裏で送る（失敗してもログに残るだけ。リードはleads.jsonlにある）
    Promise.allSettled([sendMails(data), notifyChatwork(data)]).then((results) => {
      results.forEach((r, i) => {
        const label = i === 0 ? 'mail' : 'chatwork';
        if (r.status === 'rejected') console.error(`[${label}] 失敗:`, r.reason?.message);
        else console.log(`[${label}] ${r.value}`);
      });
    });
  });
});

server.listen(CONFIG.port, () => {
  console.log(`[lead-relay] ポート ${CONFIG.port} で待機中`);
  console.log(`  Gmail: ${mailer ? CONFIG.gmailUser : '未設定'}`);
  console.log(`  ChatWork: ${CONFIG.chatworkToken ? '設定済み' : '未設定'}`);
});
