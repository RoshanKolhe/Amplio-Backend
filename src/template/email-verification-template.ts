export default function generateGuarantorVerificationEmailTemplate(mailOptions: any) {
  const template = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Guarantor Verification - BirbalPlus</title>
</head>

<style>
  body {
    font-family: Arial, sans-serif;
    background-color: #f4f6f8;
    margin: 0;
    padding: 0;
  }

  .container {
    max-width: 600px;
    margin: 30px auto;
    background: #ffffff;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  }

  .header {
    background: #0A2540;
    color: #ffffff;
    padding: 20px;
    text-align: center;
  }

  .content {
    padding: 30px 25px;
    font-size: 15px;
    color: #333;
    line-height: 1.6;
  }

  .highlight {
    font-weight: 600;
    color: #0A2540;
  }

  .button-container {
    text-align: center;
    margin: 30px 0;
  }

  .button {
    display: inline-block;
    background: #1A73E8;
    color: #ffffff !important;
    padding: 12px 24px;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
  }

  .info-box {
    background: #F4F8FF;
    padding: 15px;
    border-radius: 6px;
    margin-top: 20px;
    font-size: 14px;
  }

  .footer {
    text-align: center;
    font-size: 13px;
    color: #888;
    padding: 15px;
    border-top: 1px solid #eee;
  }
</style>

<body>

<div class="container">

  <div class="header">
    <h2>Guarantor Verification Required</h2>
  </div>

  <div class="content">
    <p>Hello <span class="highlight">${mailOptions?.guarantorName || ''}</span>,</p>

    <p>
      You have been listed as a <strong>Guarantor</strong> for a business application on
      <strong>BirbalPlus</strong>.
    </p>

    <p>
      To proceed further, we require your verification and consent.
    </p>

    <div class="button-container">
      <a href="${mailOptions?.verificationLink}" target="_blank" class="button">
        Verify as Guarantor
      </a>
    </div>

    <div class="info-box">
      <p><strong>Business Name:</strong> ${mailOptions?.businessName || ''}</p>
      <p>This verification link will expire in <strong>24 hours</strong>.</p>
    </div>

    <p>
      If you were not expecting this request, you may safely ignore this email.
    </p>

    <p>
      Regards,<br />
      <strong>BirbalPlus Compliance Team</strong>
    </p>
  </div>

  <div class="footer">
    &copy; ${new Date().getFullYear()} BirbalPlus. All rights reserved.
  </div>

</div>

</body>
</html>`;

  return {
    subject: 'Action Required: Guarantor Verification - BirbalPlus',
    html: template,
  };
}
