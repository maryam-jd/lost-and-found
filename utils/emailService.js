const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

const sendClaimContactEmail = async ({ to, from, itemName, ownerName, message, itemId }) => {
  try {
    const transporter = createTransporter();
    
    const contactUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/items/${itemId}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: `Regarding Your Claim: ${itemName} - CUI Lost & Found`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #4f46e5, #3730a3); padding: 2rem; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🔍 CUI Lost & Found</h1>
          </div>
          
          <div style="padding: 2rem; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #3730a3;">Message Regarding Your Claim</h2>
            
            <div style="background: #f8fafc; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border-left: 4px solid #4f46e5;">
              <h3 style="margin-top: 0; color: #374151;">Item: ${itemName}</h3>
              <p style="margin: 0.5rem 0;"><strong>From:</strong> ${ownerName} (${from})</p>
            </div>
            
            <div style="background: #f0f9ff; padding: 1.5rem; border-radius: 8px; border: 1px solid #e0f2fe;">
              <h4 style="margin-top: 0; color: #0369a1;">Message from Item Owner:</h4>
              <p style="color: #374151; line-height: 1.6; white-space: pre-wrap;">${message}</p>
            </div>
            
            <div style="margin-top: 2rem; padding: 1rem; background: #fef3c7; border-radius: 6px;">
              <p style="margin: 0; color: #92400e;">
                <strong>Please respond directly to ${from} to provide additional proof or coordinate item return.</strong>
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 2rem;">
              <a href="${contactUrl}" 
                 style="background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                View Item Details
              </a>
            </div>
          </div>
          
          <div style="margin-top: 1rem; padding: 1rem; background: #f8fafc; border-radius: 6px; text-align: center;">
            <p style="margin: 0; color: #64748b; font-size: 0.9rem;">
              This email was sent through CUI Lost & Found Portal. Do not reply to this automated message.
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Claim contact email sent to: ${to}`);
    return true;
  } catch (error) {
    console.error('❌ Claim contact email error:', error);
    return false;
  }
};

const sendClaimNotificationEmail = async ({ to, ownerName, itemName, itemType, claimantName, claimMessage, itemId }) => {
  try {
    const transporter = createTransporter();
    
    const claimsUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/items/${itemId}/claims`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: `🚨 New Claim on Your ${itemType === 'lost' ? 'Lost' : 'Found'} Item - ${itemName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #4f46e5, #3730a3); padding: 2rem; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🔍 CUI Lost & Found</h1>
          </div>
          
          <div style="padding: 2rem; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #3730a3; border-bottom: 3px solid #4f46e5; padding-bottom: 0.5rem;">New Item Claim Notification</h2>
            
            <div style="background: #f0f9ff; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border-left: 4px solid #0369a1;">
              <h3 style="margin-top: 0; color: #0369a1;">📦 Item Details</h3>
              <p style="margin: 0.5rem 0;"><strong>Item:</strong> ${itemName}</p>
              <p style="margin: 0.5rem 0;"><strong>Type:</strong> ${itemType === 'lost' ? 'Lost Item' : 'Found Item'}</p>
            </div>
            
            <div style="background: #fef3c7; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border-left: 4px solid #d97706;">
              <h3 style="margin-top: 0; color: #92400e;">👤 Claimant Information</h3>
              <p style="margin: 0.5rem 0;"><strong>Name:</strong> ${claimantName}</p>
              <p style="margin: 0.5rem 0;"><strong>Claim Message:</strong></p>
              <div style="background: white; padding: 1rem; border-radius: 6px; margin-top: 0.5rem;">
                <p style="margin: 0; color: #374151; font-style: italic;">"${claimMessage}"</p>
              </div>
            </div>
            
            <div style="text-align: center; margin: 2rem 0;">
              <a href="${claimsUrl}" 
                 style="background: #4f46e5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 1.1rem;">
                 🔍 Review Claim & Contact Claimant
              </a>
            </div>
            
            <div style="background: #ecfdf5; padding: 1rem; border-radius: 6px; border: 1px solid #a7f3d0;">
              <p style="margin: 0; color: #065f46;">
                <strong>💡 Next Steps:</strong> Review the claim, contact the claimant for additional proof, and approve if legitimate.
              </p>
            </div>
          </div>
          
          <div style="margin-top: 1rem; padding: 1rem; background: #f8fafc; border-radius: 6px; text-align: center;">
            <p style="margin: 0; color: #64748b; font-size: 0.9rem;">
              This is an automated notification from CUI Lost & Found Portal.
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Claim notification email sent to owner: ${to}`);
    return true;
  } catch (error) {
    console.error('❌ Claim notification email error:', error);
    return false;
  }
};

module.exports = {
  sendClaimContactEmail,
  sendClaimNotificationEmail
};