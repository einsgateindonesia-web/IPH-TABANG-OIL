export interface FormattedAuthError {
  code: string;
  message: string;
  unauthorizedDomain?: string;
}

export function formatGoogleAuthError(
  err: unknown,
  currentHostname = ''
): FormattedAuthError {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');

  if (
    code === 'auth/unauthorized-domain' ||
    rawMessage.includes('auth/unauthorized-domain')
  ) {
    const domain = currentHostname.trim() || 'domain saat ini';
    return {
      code: 'auth/unauthorized-domain',
      unauthorizedDomain: currentHostname.trim() || undefined,
      message: `Domain "${domain}" belum terdaftar di Authorized Domains Firebase. Tambahkan "${domain}" pada Firebase Console → Authentication → Settings → Authorized domains, lalu ulangi Sign in.`,
    };
  }

  if (
    code === 'auth/popup-blocked' ||
    rawMessage.includes('auth/popup-blocked')
  ) {
    return {
      code: 'auth/popup-blocked',
      message:
        'Popup login Google diblokir oleh browser. Izinkan popup untuk situs ini lalu klik Sign in kembali.',
    };
  }

  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    rawMessage.includes('auth/popup-closed-by-user') ||
    rawMessage.includes('auth/cancelled-popup-request')
  ) {
    return {
      code: code || 'auth/popup-closed-by-user',
      message: 'Login Google dibatalkan sebelum selesai. Silakan coba lagi.',
    };
  }

  if (
    code === 'auth/network-request-failed' ||
    rawMessage.includes('auth/network-request-failed')
  ) {
    return {
      code: 'auth/network-request-failed',
      message:
        'Koneksi jaringan bermasalah saat menghubungi Google Sign-In. Periksa internet Anda lalu coba lagi.',
    };
  }

  return {
    code,
    message: rawMessage || 'Login Google dibatalkan atau gagal.',
  };
}
