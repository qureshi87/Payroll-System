const express = require('express');
const cors = require('cors');
const ZKLib = require('node-zklib');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Supabase Credentials
const supabaseUrl = 'https://gordiiwaqdlrlqpvceeb.supabase.co';
const supabaseKey = 'sb_publishable_JHWFEHKavPZF-D3cTbYwOQ_MtRcLsp5';
const supabase = createClient(supabaseUrl, supabaseKey);

// مشین کی تفصیلات
const MACHINE_IP = '192.168.100.4';
const MACHINE_PORT = 4370;

// سنکنگ کا مین فنکشن
app.post('/api/sync-device', async (req, res) => {
    let zkInstance = new ZKLib(MACHINE_IP, MACHINE_PORT, 10000, 5000);

    try {
        console.log("🔄 بائیومیٹرک مشین سے رابطہ کیا جا رہا ہے...");
        await zkInstance.createSocket();
        console.log("✅ مشین کے ساتھ کنکشن کامیاب!");

        // مشین سے حاضری کے لاگز کھینچیں (مشین کا ڈیٹا ڈیلیٹ نہیں ہوگا)
        const logsResponse = await zkInstance.getAttendances();
        const logs = logsResponse.data || [];
        
        console.log(`📥 مشین سے کل ${logs.length} لاگز ملے ہیں۔`);

        const attendanceData = logs.map(item => ({
            device_user_id: String(item.deviceUserId),
            record_time: item.recordTime,
            device_ip: item.ip || MACHINE_IP
        }));

        if (attendanceData.length > 0) {
            console.log("☁️ Supabase میں ڈیٹا بھیجا جا رہا ہے...");
            const { error } = await supabase
                .from('biometric_logs')
                .upsert(attendanceData, { onConflict: 'device_user_id,record_time' });

            if (error) {
                console.error("❌ Supabase ایرر:", error.message);
                return res.status(500).json({ success: false, error: error.message });
            }
        }

        await zkInstance.disconnect();
        console.log("🔌 کنکشن محفوظ طریقے سے بند کر دیا گیا۔");

        return res.json({ 
            success: true, 
            message: `کامیابی! ${attendanceData.length} لاگز سنک ہو گئے ہیں۔` 
        });

    } catch (e) {
        console.log("❌ خرابی:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// لوکل سرور پورٹ 5000 پر چلے گا
app.listen(5000, () => {
    console.log('🚀 لوکل برج سرور رن ہو رہا ہے پورٹ 5000 پر...');
});