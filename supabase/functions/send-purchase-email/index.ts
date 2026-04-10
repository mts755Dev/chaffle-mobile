// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
import { createTransport } from "npm:nodemailer@6.9.14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPurchaseEmail(quantity: number, ticketNumber: string) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title></title>
  <style type="text/css">
    body { margin: 0; padding: 0; }
    table, tr, td { vertical-align: top; border-collapse: collapse; }
    p { margin: 0; }
    * { line-height: inherit; }
    .ticket-list {
      width: 300px; margin: 0 auto; background-color: white;
      border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 15px;
    }
    .ticket-item {
      display: flex; justify-content: space-between;
      align-items: center; padding: 10px 0; border-bottom: 1px solid #eee;
    }
    .ticket-item:last-child { border-bottom: none; }
    .ticket-text { font-size: 14px; font-weight: 700; color: #333; }
    .ticket-number { font-size: 14px; font-weight: 400; color: #888; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f7f8f9;color:#000000;">
  <table style="border-collapse:collapse;table-layout:fixed;border-spacing:0;min-width:320px;margin:0 auto;background-color:#f7f8f9;width:100%;" cellpadding="0" cellspacing="0">
    <tbody>
      <tr>
        <td style="word-break:break-word;border-collapse:collapse!important;vertical-align:top;">
          <div style="padding:0;background-color:transparent;">
            <div style="margin:0 auto;min-width:320px;max-width:500px;background-color:transparent;">
              <div style="display:table;width:100%;background-color:transparent;">
                <div style="min-width:500px;display:table-cell;vertical-align:top;">
                  <div style="background-color:#ffffff;height:100%;width:100%!important;">
                    <div style="padding:0px;">

                      <!-- Logo -->
                      <table style="font-family:arial,helvetica,sans-serif;" cellpadding="0" cellspacing="0" width="100%" border="0">
                        <tbody><tr><td style="padding:10px;" align="left">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr><td style="padding-right:0px;padding-left:0px;" align="center">
                              <a href="https://chaffle.org/" target="_blank">
                                <img align="center" border="0"
                                  src="https://chaffle.org/assets/purchase/images/image-5.png"
                                  alt="" width="129.6"
                                  style="outline:none;text-decoration:none;clear:both;display:inline-block!important;border:none;height:auto;float:none;width:27%;max-width:129.6px;" />
                              </a>
                            </td></tr>
                          </table>
                        </td></tr></tbody>
                      </table>

                      <!-- Body text -->
                      <table style="font-family:arial,helvetica,sans-serif;" cellpadding="0" cellspacing="0" width="100%" border="0">
                        <tbody><tr><td style="padding:10px;font-family:arial,helvetica,sans-serif;" align="left">
                          <div style="font-size:14px;line-height:140%;text-align:left;">
                            <p style="line-height:140%">We've received your order. You can find your ticket information below.</p>
                            <p style="line-height:140%">Winners will be announced via social media and via email. Be on the lookout for an email from us within 48 hours of the draw date with details on how to claim your prize if you win!</p>
                          </div>
                        </td></tr></tbody>
                      </table>

                      <!-- Button -->
                      <table style="font-family:arial,helvetica,sans-serif;" cellpadding="0" cellspacing="0" width="100%" border="0">
                        <tbody><tr><td style="padding:10px;" align="left">
                          <div align="left">
                            <a href="https://chaffle.org/" target="_blank"
                              style="box-sizing:border-box;display:inline-block;text-decoration:none;text-align:center;color:#ffffff;background-color:#3aaee0;border-radius:4px;width:auto;font-size:14px;">
                              <span style="display:block;padding:10px 20px;line-height:120%;">Visit our website</span>
                            </a>
                          </div>
                        </td></tr></tbody>
                      </table>

                      <!-- Ticket info -->
                      <div class="ticket-list">
                        <div class="ticket-item">
                          <div><span class="ticket-text">50/50 Raffle Ticket x ${quantity}</span></div>
                          <span class="ticket-number">#${ticketNumber}</span>
                        </div>
                      </div>

                      <!-- Footer logo -->
                      <table style="font-family:arial,helvetica,sans-serif;" cellpadding="0" cellspacing="0" width="100%" border="0">
                        <tbody><tr><td style="padding:10px;" align="left">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr><td style="padding-right:0px;padding-left:0px;" align="left">
                              <a href="https://chaffle.org/" target="_blank">
                                <img align="left" border="0"
                                  src="https://chaffle.org/assets/purchase/images/image-4.png"
                                  alt="" width="100.8"
                                  style="outline:none;text-decoration:none;clear:both;display:inline-block!important;border:none;height:auto;float:none;width:21%;max-width:100.8px;" />
                              </a>
                            </td></tr>
                          </table>
                        </td></tr></tbody>
                      </table>

                      <!-- Footer links -->
                      <table style="font-family:arial,helvetica,sans-serif;" cellpadding="0" cellspacing="0" width="100%" border="0">
                        <tbody><tr><td style="padding:10px;" align="left">
                          <div style="font-size:14px;line-height:140%;text-align:left;">
                            <p style="line-height:140%"><a rel="noopener" href="https://chaffle.org/#support-form" target="_blank">Contact Us</a></p>
                            <p style="line-height:140%"><a rel="noopener" href="https://chaffle.org/#support-form" target="_blank">Support</a></p>
                            <p style="line-height:140%"><strong>©</strong>2024 Chaffle</p>
                          </div>
                        </td></tr></tbody>
                      </table>

                      <!-- Social icons -->
                      <table style="font-family:arial,helvetica,sans-serif;" cellpadding="0" cellspacing="0" width="100%" border="0">
                        <tbody><tr><td style="padding:10px;" align="left">
                          <div align="center">
                            <div style="display:table;max-width:110px;">
                              <table align="center" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="width:32px!important;height:32px!important;display:inline-block;border-collapse:collapse;table-layout:fixed;border-spacing:0;vertical-align:top;margin-right:5px;">
                                <tbody><tr><td align="center" valign="middle">
                                  <a href="https://www.facebook.com/profile.php?id=61560541843920&mibextid=LQQJ4d&rdid=fqzXPU4UfOGF8GPq&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2FcdeGLQd9WS1TajT1%2F%3Fmibextid%3DLQQJ4d" title="Facebook" target="_blank">
                                    <img src="https://chaffle.org/assets/purchase/images/image-1.png" alt="Facebook" width="32" style="outline:none;text-decoration:none;clear:both;display:block!important;border:none;height:auto;float:none;max-width:32px!important;" />
                                  </a>
                                </td></tr></tbody>
                              </table>
                              <table align="center" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="width:32px!important;height:32px!important;display:inline-block;border-collapse:collapse;table-layout:fixed;border-spacing:0;vertical-align:top;margin-right:5px;">
                                <tbody><tr><td align="center" valign="middle">
                                  <a href="https://www.instagram.com/chafflefundraising?igsh=ZTJudjZnenZtdDA0" title="Instagram" target="_blank">
                                    <img src="https://chaffle.org/assets/purchase/images/image-2.png" alt="Instagram" width="32" style="outline:none;text-decoration:none;clear:both;display:block!important;border:none;height:auto;float:none;max-width:32px!important;" />
                                  </a>
                                </td></tr></tbody>
                              </table>
                              <table align="center" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="width:32px!important;height:32px!important;display:inline-block;border-collapse:collapse;table-layout:fixed;border-spacing:0;vertical-align:top;margin-right:0px;">
                                <tbody><tr><td align="center" valign="middle">
                                  <a href="https://x.com/chafflellc?s=11&t=wmbk6WQMTaImuIdR06ZqEg" title="X" target="_blank">
                                    <img src="https://chaffle.org/assets/purchase/images/image-3.png" alt="X" width="32" style="outline:none;text-decoration:none;clear:both;display:block!important;border:none;height:auto;float:none;max-width:32px!important;" />
                                  </a>
                                </td></tr></tbody>
                              </table>
                            </div>
                          </div>
                        </td></tr></tbody>
                      </table>

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, quantity, ticketNumber } = await req.json();

    if (!email || !quantity || !ticketNumber) {
      return jsonResponse(
        { error: "Missing required fields: email, quantity, ticketNumber" },
        400,
      );
    }

    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");

    if (!adminEmail || !adminPassword) {
      console.error("ADMIN_EMAIL or ADMIN_PASSWORD not configured");
      return jsonResponse({ error: "Email credentials not configured" }, 500);
    }

    const transporter = createTransport({
      host: "smtpout.secureserver.net",
      port: 465,
      secure: true,
      auth: {
        user: adminEmail,
        pass: adminPassword,
      },
    });

    const html = getPurchaseEmail(quantity, ticketNumber);

    const info = await transporter.sendMail({
      from: adminEmail,
      to: email,
      subject: "Chaffle Ticket purchase summary",
      html,
    });

    console.log("Email sent:", info.messageId);

    return jsonResponse({ success: true, messageId: info.messageId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("send-purchase-email error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
