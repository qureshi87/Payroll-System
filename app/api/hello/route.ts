import { NextResponse } from 'next/server';

export async function POST() {
    try {
        const response = await fetch('http://localhost:5000/api/sync-device', {
            method: 'POST',
        });

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            { success: false, error: 'لوکل برج سرور سے رابطہ نہیں ہو سکا۔ کیا برج سرور آن ہے؟' },
            { status: 500 }
        );
    }
}