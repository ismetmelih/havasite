// E-posta gonderimi (yalnizca sifre sifirlama icin). Resend'in HTTP API'si kullanilir;
// ekstra paket gerekmez. Ortam degiskenleri tanimli degilse gonderim kapali kalir ve
// sifre sifirlama baglantisini site yoneticisi admin panelinden olusturabilir.
//
//   RESEND_API_KEY = re_xxx           (https://resend.com — ucretsiz katman)
//   MAIL_FROM      = "TürkiyeCanlı <bildirim@ornek.com>"  (Resend'de dogrulanmis alan adi)

function mailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
    });
    if (!r.ok) {
      console.error("[mail] gonderilemedi:", r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mail] gonderim hatasi:", err.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { mailConfigured, sendMail };
