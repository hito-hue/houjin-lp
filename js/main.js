/* ==========================================================================
   法人スマホLP - main.js
   送信先の変更はこの CONFIG だけ書き換えればOK
   ========================================================================== */
const CONFIG = {
  // 【送信先1】メール（FormSubmit経由。登録不要・無料）
  mailEndpoint: 'https://formsubmit.co/ajax/h_ito@beee-marketing.com',

  // 【送信先2】ChatWork通知（VPSの受付窓口。空ならメールのみ）
  chatworkEndpoint: '',

  // 送信完了後に飛ばすページ
  thanksUrl: './thanks.html'
};

/* ---------- スムーススクロール ---------- */
function scrollToForm() {
  const target = document.getElementById('contact-form');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('.js-scroll').forEach(function (el) {
  el.addEventListener('click', function (e) {
    e.preventDefault();
    scrollToForm();
  });
});

/* ---------- 広告パラメータをフォームに自動格納 ---------- */
(function captureParams() {
  const params = new URLSearchParams(window.location.search);
  const keys = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'placement', 'gclid', 'fbclid'
  ];
  keys.forEach(function (key) {
    const field = document.getElementById('trk-' + key);
    if (field) field.value = params.get(key) || '';
  });
  const lpPath = document.getElementById('trk-lp_path');
  if (lpPath) lpPath.value = window.location.pathname;
})();

/* ---------- 入力チェック ---------- */
const submitBtn = document.getElementById('submitBtn');

function showError(id, message) {
  const field = document.getElementById(id);
  const errorBox = document.getElementById('err-' + id);
  if (field) field.classList.add('error');
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.add('show');
  }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(function (el) {
    el.textContent = '';
    el.classList.remove('show');
  });
  document.querySelectorAll('.error').forEach(function (el) {
    el.classList.remove('error');
  });
}

function validate() {
  clearErrors();
  let firstBad = null;

  const rules = [
    { id: 'companyType', message: '会社形態を選択してください' },
    { id: 'companyName', message: '会社名・屋号をご入力ください' },
    { id: 'contactName', message: 'お名前をご入力ください' },
    { id: 'tel', message: '電話番号をご入力ください' },
    { id: 'email', message: 'メールアドレスをご入力ください' },
    { id: 'prefecture', message: '都道府県を選択してください' }
  ];

  rules.forEach(function (rule) {
    const field = document.getElementById(rule.id);
    if (!field.value.trim()) {
      showError(rule.id, rule.message);
      if (!firstBad) firstBad = field;
    }
  });

  const tel = document.getElementById('tel');
  if (tel.value.trim() && !/^[0-9-]{10,14}$/.test(tel.value.trim())) {
    showError('tel', '電話番号は数字とハイフンでご入力ください');
    if (!firstBad) firstBad = tel;
  }

  // 名前は、インサイドセールスが読めるようひらがなで入れてもらう
  // （カタカナで入力された場合も読めるので通す。漢字だけ弾く）
  const contactName = document.getElementById('contactName');
  const kanaOnly = /^[぀-ゟ゠-ヿー\s　]+$/;
  if (contactName.value.trim() && !kanaOnly.test(contactName.value.trim())) {
    showError('contactName', 'ひらがなでご入力ください（例：やまだ たろう）');
    if (!firstBad) firstBad = contactName;
  }

  const email = document.getElementById('email');
  if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    showError('email', 'メールアドレスの形式が正しくありません');
    if (!firstBad) firstBad = email;
  }

  if (firstBad) {
    firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstBad.focus({ preventScroll: true });
    return false;
  }
  return true;
}

/* ---------- 送信 ---------- */
const leadForm = document.getElementById('leadForm');
const pageOpenedAt = Date.now();

if (leadForm) {
  leadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return;

    // ボット対策1：見えない罠の欄が埋まっている＝自動投稿
    const honeypot = leadForm.querySelector('input[name="website"]');
    if (honeypot && honeypot.value !== '') {
      window.location.href = CONFIG.thanksUrl; // 送ったように見せて、実際は送らない
      return;
    }

    // ボット対策2：開いて3秒未満での送信は人間の入力速度ではない
    if (Date.now() - pageOpenedAt < 3000) {
      window.location.href = CONFIG.thanksUrl;
      return;
    }

    if (!validate()) return;

    const data = Object.fromEntries(new FormData(leadForm).entries());
    delete data.website; // 罠の欄は送信データに含めない

    submitBtn.disabled = true;
    submitBtn.textContent = '送信中…';

    // メール本文で読みやすいように、日本語の項目名に整える
    const mailBody = {
      _subject: '【LP】無料相談：' + (data.company_name || '') + ' 様',
      _template: 'table',
      会社形態: data.company_type || '',
      会社名・屋号: data.company_name || '',
      お名前: data.name || '',
      電話番号: data.tel || '',
      都道府県: data.prefecture || '',
      メールアドレス: data.email || '',
      連絡希望時間: data.contact_time || '指定なし',
      ご相談内容: data.message || '',
      流入元: [data.utm_source, data.utm_campaign, data.utm_content].filter(Boolean).join(' / ') || '直接',
      配信面: data.placement || ''
    };

    const sendMail = fetch(CONFIG.mailEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(mailBody)
    }).then(function (res) {
      if (!res.ok) throw new Error('mail failed');
      return 'mail';
    });

    const sendChatwork = CONFIG.chatworkEndpoint
      ? fetch(CONFIG.chatworkEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (res) {
          if (!res.ok) throw new Error('chatwork failed');
          return 'chatwork';
        })
      : Promise.reject(new Error('chatwork未設定'));

    // どちらか1つでも成功すれば、お客様には「送信完了」を出す
    Promise.allSettled([sendMail, sendChatwork]).then(function (results) {
      const ok = results.some(function (r) { return r.status === 'fulfilled'; });
      if (ok) {
        window.location.href = CONFIG.thanksUrl;
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = '無料相談する';
        alert('送信に失敗しました。お手数ですが、時間をおいて再度お試しください。');
      }
    });
  });
}
