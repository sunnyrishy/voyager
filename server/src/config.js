import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 8787),
  stay22ApiKey: process.env.STAY22_API_KEY || '',
};
