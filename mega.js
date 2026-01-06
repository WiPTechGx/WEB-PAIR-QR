import { Storage } from 'megajs';
import dotenv from 'dotenv';
dotenv.config();

const auth = {
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
};

export const upload = async (data, name) => {
    try {
        if (!auth.email || !auth.password || auth.email === 'your_email@example.com') {
            console.warn("Missing MEGA credentials in .env. Skipping upload.");
            return null;
        }

        if (typeof data === 'string') data = Buffer.from(data);

        const storage = await new Storage(auth).ready;

        const file = await storage.upload({ name, allowUploadBuffering: true }, data).complete;

        if (url) {
            console.log("MEGA Upload Successful:", url);
            return url;
        } else {
            console.error("MEGA Upload failed to return a link.");
            return null;
        }

    } catch (err) {
        console.error("Error uploading file to MEGA:", err.message || err);
        return null; // Return null instead of throwing to prevent app crash
    }
};

