const ZKLib = require('node-zklib');
const { createClient } = require('@supabase/supabase-js');

// Supabase Credentials
const supabaseUrl = 'https://gordiiwaqdlrlqpvceeb.supabase.co';
const supabaseKey = 'sb_publishable_JHWFEHKavPZF-D3cTbYwOQ_MtRcLsp5';
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncBiometricData() {
    let zkInstance = new ZKLib('192.168.100.4', 4370, 10000, 5000);

    try {
        console.log("🔄 بائیومیٹرک مشین سے رابطہ کیا جا رہا ہے...");
        await zkInstance.createSocket();
        console.log("✅ مشین کے ساتھ کنکشن کامیاب!");

        // 1. مشین سے تمام حاضری کے لاگز کھینچیں
        const logsResponse = await zkInstance.getAttendances();
        const logs = logsResponse.data || [];
        
        console.log(`📥 مشین سے کل ${logs.length} لاگز ملے ہیں۔`);

        // ڈیٹا کو فارمیٹ کریں
        const attendanceData = logs.map(item => ({
            device_user_id: String(item.deviceUserId),
            record_time: item.recordTime,
            device_ip: item.ip || '192.168.100.4'
        }));

        if (attendanceData.length > 0) {
            console.log("☁️ Supabase ڈیٹا بیس میں ڈیٹا بھیجا جا رہا ہے...");
            
            // ڈیٹا بیس میں بلک انسرٹ / اپسرٹ
            const { error } = await supabase
                .from('biometric_logs')
                .upsert(attendanceData, { onConflict: 'device_user_id,record_time' });

            if (error) {
                console.error("❌ Supabase ایرر:", error.message);
            } else {
                console.log("✨ کامیابی! تمام حاضری کا ریکارڈ Supabase میں سنک ہو گیا ہے۔");
            }
        }

        // کنکشن بند کریں
        await zkInstance.disconnect();
        console.log("🔌 کنکشن محفوظ طریقے سے بند کر دیا گیا۔");

    } catch (e) {
        console.log("❌ سنکنگ میں خرابی (Error):", e);
    }
}

syncBiometricData();