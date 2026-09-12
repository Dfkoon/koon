<?php
/**
 * includes/totp.php
 * تطبيق مبسّط لخوارزمية TOTP (RFC 6238) متوافق مع Google Authenticator / Authy / إلخ
 * لا يعتمد على أي مكتبة خارجية (لا Composer مطلوب).
 */

final class TOTP
{
    private const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /** توليد سر عشوائي بصيغة Base32 (يُستخدم كمفتاح TOTP) */
    public static function generateSecret(int $bytesLength = 20): string
    {
        return self::base32Encode(random_bytes($bytesLength));
    }

    /** بناء رابط otpauth:// يُستخدم لتوليد رمز QR */
    public static function provisioningUri(string $secret, string $accountName, string $issuer): string
    {
        $label = rawurlencode($issuer . ':' . $accountName);
        $params = http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => 6,
            'period' => 30,
        ]);
        return "otpauth://totp/{$label}?{$params}";
    }

    /** التحقق من رمز مكوّن من 6 أرقام مع سماحية انزياح زمني بسيطة (خطوة واحدة قبل/بعد) */
    public static function verify(string $secret, string $code, int $window = 1): bool
    {
        $code = trim($code);
        if (!preg_match('/^\d{6}$/', $code)) {
            return false;
        }
        $timeSlice = (int) floor(time() / 30);
        for ($i = -$window; $i <= $window; $i++) {
            if (self::generateCode($secret, $timeSlice + $i) === $code) {
                return true;
            }
        }
        return false;
    }

    private static function generateCode(string $secret, int $timeSlice): string
    {
        $key = self::base32Decode($secret);
        $time = pack('N*', 0) . pack('N*', $timeSlice); // 8 bytes big-endian
        $hash = hash_hmac('sha1', $time, $key, true);
        $offset = ord($hash[19]) & 0x0F;
        $part = (
            ((ord($hash[$offset]) & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8) |
            (ord($hash[$offset + 3]) & 0xFF)
        );
        $otp = $part % 1000000;
        return str_pad((string) $otp, 6, '0', STR_PAD_LEFT);
    }

    private static function base32Encode(string $data): string
    {
        $binaryString = '';
        foreach (str_split($data) as $char) {
            $binaryString .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }
        $output = '';
        foreach (str_split($binaryString, 5) as $chunk) {
            $chunk = str_pad($chunk, 5, '0');
            $output .= self::BASE32_ALPHABET[bindec($chunk)];
        }
        return $output;
    }

    private static function base32Decode(string $data): string
    {
        $data = strtoupper(rtrim($data, '='));
        $binaryString = '';
        foreach (str_split($data) as $char) {
            $pos = strpos(self::BASE32_ALPHABET, $char);
            if ($pos === false) {
                continue;
            }
            $binaryString .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }
        $output = '';
        foreach (str_split($binaryString, 8) as $byte) {
            if (strlen($byte) === 8) {
                $output .= chr(bindec($byte));
            }
        }
        return $output;
    }
}
