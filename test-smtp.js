// Quick SMTP connection test
const nodemailer = require('nodemailer');

const config = {
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'helga.kris97@ethereal.email',
    pass: process.env.SMTP_PASSWORD || 'JdbUUxkkEn6amdPXDt',
  },
};

console.log('Testing SMTP with config:');
console.log('  Host:', config.host);
console.log('  Port:', config.port);
console.log('  Secure:', config.secure);
console.log('  User:', config.auth.user);
console.log('');

const transporter = nodemailer.createTransport(config);

async function test() {
  try {
    // Verify connection
    console.log('Verifying SMTP connection...');
    await transporter.verify();
    console.log('✓ SMTP connection successful!\n');

    // Send test email
    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: config.auth.user,
      to: config.auth.user, // Send to self for testing
      subject: 'SignatureHub SMTP Test',
      text: 'If you see this, SMTP is working!',
      html: '<p>If you see this, <strong>SMTP is working!</strong></p>',
    });

    console.log('✓ Email sent!');
    console.log('  Message ID:', info.messageId);
    if (info.messageId && config.host.includes('ethereal')) {
      console.log('  Preview URL:', nodemailer.getTestMessageUrl(info));
    }
  } catch (error) {
    console.error('✗ SMTP Error:', error.message);
    console.error('  Full error:', error);
  }
}

test();
