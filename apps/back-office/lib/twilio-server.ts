import twilio from 'twilio';

// Autenticación con API Key (no requiere Auth Token)
export const twilioClient = twilio(
  process.env.TWILIO_API_KEY_SID!,
  process.env.TWILIO_API_KEY_SECRET!,
  { accountSid: process.env.TWILIO_ACCOUNT_SID! },
);

export const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID ?? '';
export const TWILIO_PHONE_NUMBER  = process.env.TWILIO_PHONE_NUMBER ?? '';
export const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID ?? '';
