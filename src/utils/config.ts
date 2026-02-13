const SITE_SETTINGS = {
  email: {
    type: 'smtp',
    host: 'smtp.gmail.com',
    secure: true,
    port: 465,
    tls: {
      rejectUnauthorized: false,
    },
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  },
  fromMail: process.env.EMAIL_USER,
};
export default SITE_SETTINGS;
