const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SETTINGS_FILE = path.join(__dirname, '../config/settings.json');

const getSettings = () => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch(e) {}
  return {};
};

// Create a transporter using config or fallback to a mock ethereal account
const getTransporter = async () => {
  const settings = getSettings();
  if (settings.smtpHost && settings.smtpUser && settings.smtpPass) {
    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpPort == 465,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
    });
  }
  
  // Fallback for development if no SMTP is configured
  console.log('No SMTP config found in settings.json, generating Ethereal test account...');
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
};

const sendSecurityAlertEmail = async (alert) => {
  try {
    const settings = getSettings();
    if (!settings.emailReport) return; // Feature toggle check
    
    // Only send emails for High or Critical alerts
    if (alert.severity !== 'HIGH' && alert.severity !== 'CRITICAL') {
      return;
    }

    const transporter = await getTransporter();
    
    const adminEmail = settings.adminEmails || 'admin@secureassets.local';
    const fromEmail = settings.smtpFrom || 'alerts@secureassets.local';

    const info = await transporter.sendMail({
      from: `"SecureAssets Alerts" <${fromEmail}>`,
      to: adminEmail,
      subject: `[${alert.severity}] Security Alert: ${alert.type}`,
      text: `A new security alert has been triggered.\n\nSeverity: ${alert.severity}\nType: ${alert.type}\nDevice: ${alert.device_id || 'N/A'}\nDescription: ${alert.description}\nTime: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-top: 4px solid ${alert.severity === 'CRITICAL' ? '#ff003c' : '#ffb700'}">
          <div style="padding: 20px;">
            <h2 style="color: ${alert.severity === 'CRITICAL' ? '#ff003c' : '#ffb700'}">Security Alert: ${alert.severity}</h2>
            <p><strong>Type:</strong> ${alert.type}</p>
            <p><strong>Device:</strong> ${alert.device_id || 'N/A'}</p>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <div style="background: #f5f5f5; padding: 15px; border-left: 3px solid #ccc; margin: 15px 0;">
              ${alert.description}
            </div>
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/security" style="display: inline-block; background: #0f172a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View in Dashboard</a>
          </div>
        </div>
      `
    });

    console.log(`Security alert email sent: ${info.messageId}`);
    if (info.messageId && transporter.options.host === 'smtp.ethereal.email') {
      console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
  } catch (error) {
    console.error('Error sending security alert email:', error);
  }
};

const sendMaintenanceTicketEmail = async (ticket) => {
  try {
    const settings = getSettings();
    if (!settings.emailReport) return; // Feature toggle check

    const transporter = await getTransporter();
    
    const adminEmail = settings.adminEmails || 'admin@secureassets.local';
    const fromEmail = settings.smtpFrom || 'alerts@secureassets.local';

    const info = await transporter.sendMail({
      from: `"SecureAssets Maintenance" <${fromEmail}>`,
      to: adminEmail,
      subject: `[New Ticket] Maintenance Log: ${ticket.title} (${ticket.ticket_id})`,
      text: `A new maintenance ticket has been created.\n\nTicket ID: ${ticket.ticket_id}\nTitle: ${ticket.title}\nPriority: ${ticket.priority}\nDescription: ${ticket.description}\nTime: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-top: 4px solid #f59e0b">
          <div style="padding: 20px;">
            <h2 style="color: #f59e0b">New Maintenance Ticket Created</h2>
            <p><strong>Ticket ID:</strong> ${ticket.ticket_id}</p>
            <p><strong>Title:</strong> ${ticket.title}</p>
            <p><strong>Priority:</strong> <span style="text-transform: uppercase; font-weight: bold; color: ${ticket.priority === 'high' ? '#ef4444' : '#f59e0b'}">${ticket.priority}</span></p>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <div style="background: #f5f5f5; padding: 15px; border-left: 3px solid #ccc; margin: 15px 0;">
              <strong>Description:</strong><br/>
              ${ticket.description || 'No description provided.'}
            </div>
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/maintenance" style="display: inline-block; background: #0f172a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View in Maintenance Portal</a>
          </div>
        </div>
      `
    });

    console.log(`Maintenance ticket email sent: ${info.messageId}`);
    if (info.messageId && transporter.options.host === 'smtp.ethereal.email') {
      console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
  } catch (error) {
    console.error('Error sending maintenance ticket email:', error);
  }
};

module.exports = {
  sendSecurityAlertEmail,
  sendMaintenanceTicketEmail
};