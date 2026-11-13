const biometricBridgeUrl =
  process.env.BIOMETRIC_BRIDGE_URL || 'http://127.0.0.1:5000/api/sync-device';

export async function POST() {
  try {
    const bridgeResponse = await fetch(biometricBridgeUrl, {
      method: 'POST',
      cache: 'no-store'
    });
    const result: unknown = await bridgeResponse.json();

    if (!result || typeof result !== 'object') {
      console.error('Biometric bridge returned an invalid response.');
      return Response.json(
        { success: false, error: 'Biometric bridge returned an invalid response.' },
        { status: 502 }
      );
    }

    const responseData = result as { success?: boolean; message?: string; error?: string };
    if (!bridgeResponse.ok || !responseData.success) {
      const status = bridgeResponse.ok ? 502 : bridgeResponse.status;
      return Response.json(
        { success: false, error: responseData.error || 'Biometric sync failed.' },
        { status }
      );
    }

    return Response.json({
      success: true,
      message: responseData.message || 'Biometric sync completed.'
    });
  } catch (error) {
    console.error('Unable to connect to the biometric bridge:', error);
    return Response.json(
      { success: false, error: 'Unable to connect to the biometric bridge. Ensure the bridge server is running.' },
      { status: 502 }
    );
  }
}
